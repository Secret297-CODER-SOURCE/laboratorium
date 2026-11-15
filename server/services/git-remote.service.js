import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import db from '../db/index.js';
import config from '../config/index.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as gitOAuth from './git-oauth.service.js';

const execFileAsync = promisify(execFile);
const STAFF_ROLES = new Set(['owner', 'developer', 'teacher']);
const GIT_ROOT = resolve(dirname(config.db.path), 'code-workspaces');
const ALLOWED_HOSTS = new Set(['github.com', 'www.github.com', 'gitlab.com', 'www.gitlab.com']);
const remoteOpLast = new Map();
const REMOTE_OP_MIN_MS = 2000;

function workspaceRepoPath(workspaceId) {
  const root = resolve(GIT_ROOT, String(workspaceId));
  if (!root.startsWith(`${GIT_ROOT}${sep}`)) throw new ValidationError('Невірний робочий простір');
  return root;
}

function getOwned(userId, workspaceId) {
  const ws = db.prepare('SELECT * FROM code_workspaces WHERE id = ?').get(workspaceId);
  if (!ws) throw new NotFoundError('Робочий простір не знайдено');
  if (ws.user_id !== userId) throw new ForbiddenError('Це не ваш робочий простір');
  return ws;
}

function assertRemoteRate(userId) {
  const last = remoteOpLast.get(userId) || 0;
  const now = Date.now();
  if (now - last < REMOTE_OP_MIN_MS) {
    throw new ValidationError('Зачекайте кілька секунд між remote-операціями');
  }
  remoteOpLast.set(userId, now);
}

export function parseAllowedRemoteUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new ValidationError('Некоректний URL репозиторію');
  }
  if (url.protocol !== 'https:') {
    throw new ValidationError('Дозволено лише HTTPS clone URL');
  }
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host) && !host.endsWith('.gitlab.com')) {
    throw new ValidationError('Дозволені лише github.com та gitlab.com');
  }
  if (url.username || url.password) {
    throw new ValidationError('URL не повинен містити облікові дані');
  }
  const provider = host.includes('gitlab') ? 'gitlab' : 'github';
  return { url: url.toString().replace(/\.git$/, '') + (String(raw).endsWith('.git') ? '.git' : ''), provider, host };
}

async function runGit(args, cwd, { timeout = 120000, maxBuffer = 8 * 1024 * 1024, extraEnv = {}, extraConfig = [] } = {}) {
  const gitArgs = [];
  for (const [k, v] of extraConfig) {
    gitArgs.push('-c', `${k}=${v}`);
  }
  gitArgs.push(...args);
  try {
    return await execFileAsync('git', gitArgs, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        ...extraEnv,
      },
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError('Локальний Git недоступний на сервері', 503, 'GIT_UNAVAILABLE');
    }
    const details = String(error.stderr || error.message || '').trim().slice(0, 1500);
    throw new AppError(`Помилка Git${details ? `: ${details}` : ''}`, 500, 'GIT_OPERATION_FAILED');
  }
}

function authExtra(provider, token) {
  if (!token) return { extraConfig: [] };
  const header = provider === 'gitlab'
    ? `Authorization: Bearer ${token}`
    : `Authorization: Bearer ${token}`;
  return {
    extraConfig: [['http.extraHeader', header]],
  };
}

async function listFilesRecursive(dir, prefix = '') {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listFilesRecursive(full, rel));
    } else if (entry.isFile()) {
      if (rel.length > 64 || rel.split('/').length > 8) continue;
      const stat = await fs.stat(full);
      if (stat.size > 200_000) continue;
      const content = await fs.readFile(full, 'utf8');
      if (content.includes('\0')) continue;
      out.push({ path: rel, content: content.slice(0, 200_000) });
      if (out.length >= 40) break;
    }
  }
  return out;
}

export async function importDiskToDb(workspaceId) {
  const root = workspaceRepoPath(workspaceId);
  const files = await listFilesRecursive(root);
  const saveAll = db.transaction(() => {
    db.prepare('DELETE FROM code_files WHERE workspace_id = ?').run(workspaceId);
    for (const file of files) {
      db.prepare('INSERT INTO code_files (workspace_id, path, content) VALUES (?, ?, ?)')
        .run(workspaceId, file.path, file.content);
    }
    db.prepare(`UPDATE code_workspaces SET updated_at = datetime('now') WHERE id = ?`).run(workspaceId);
  });
  saveAll();
  return files;
}

export async function readRemoteSnapshot(root, ws) {
  const [status, branch, commits, remotes, branchesOut] = await Promise.all([
    runGit(['status', '--short', '--untracked-files=all'], root, { timeout: 10000 }),
    runGit(['branch', '--show-current'], root, { timeout: 5000 }),
    runGit(['log', '-20', '--format=%h%x09%s'], root, { timeout: 10000 }),
    runGit(['remote', '-v'], root, { timeout: 5000 }),
    runGit(['branch', '--list', '--format=%(refname:short)'], root, { timeout: 5000 }),
  ]);
  const changes = status.stdout.split('\n').filter(Boolean);
  const history = commits.stdout.trim()
    ? commits.stdout.trim().split('\n').map((line) => {
      const [hash, ...parts] = line.split('\t');
      return { hash, message: parts.join('\t') };
    })
    : [];
  const branches = branchesOut.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  let ahead = null;
  let behind = null;
  try {
    const ab = await runGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], root, { timeout: 8000 });
    const [behindStr, aheadStr] = ab.stdout.trim().split(/\s+/);
    behind = Number(behindStr) || 0;
    ahead = Number(aheadStr) || 0;
  } catch { /* no upstream */ }

  return {
    branch: branch.stdout.trim(),
    branches,
    clean: changes.length === 0,
    changes,
    history,
    remotes: remotes.stdout.trim(),
    local_only: !remotes.stdout.trim(),
    remote_url: ws.remote_url || null,
    remote_provider: ws.remote_provider || null,
    ahead,
    behind,
  };
}

export async function cloneIntoWorkspace(userId, role, { url, name, language }) {
  assertRemoteRate(userId);
  if (!STAFF_ROLES.has(role)) {
    const row = db.prepare(`
      SELECT 1 FROM study_group_members gm
      JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
      JOIN programs p ON p.id = g.program_id
      JOIN directions d ON d.id = p.direction_id AND d.is_programming = 1
      WHERE gm.user_id = ? LIMIT 1
    `).get(userId);
    if (!row) throw new ForbiddenError('Clone доступний учасникам програмістських напрямків');
  }

  const parsed = parseAllowedRemoteUrl(url);
  const token = gitOAuth.getAccessToken(userId, parsed.provider);
  const count = db.prepare('SELECT COUNT(*) as c FROM code_workspaces WHERE user_id = ?').get(userId).c;
  if (count >= 20) throw new ValidationError('Максимум 20 робочих просторів');

  const lang = ['python', 'node', 'cpp', 'bash', 'web'].includes(language) ? language : 'web';
  const trimmedName = String(name || '').trim() || `Clone ${parsed.provider}`;

  const result = db.prepare(`
    INSERT INTO code_workspaces (user_id, group_id, name, language, remote_url, remote_provider)
    VALUES (?, NULL, ?, ?, ?, ?)
  `).run(userId, trimmedName, lang, parsed.url, parsed.provider);
  const workspaceId = Number(result.lastInsertRowid);
  const root = workspaceRepoPath(workspaceId);

  try {
    await fs.mkdir(dirname(root), { recursive: true, mode: 0o700 });
    await fs.rm(root, { recursive: true, force: true });
    const auth = authExtra(parsed.provider, token);
    await runGit(
      ['clone', '--depth', '50', '--single-branch', parsed.url, String(workspaceId)],
      GIT_ROOT,
      { timeout: 180000, ...auth },
    );
    await runGit(['config', 'user.name', 'Laboratorium learner'], root);
    await runGit(['config', 'user.email', 'learner@localhost'], root);
    await runGit(['config', 'commit.gpgsign', 'false'], root);
    await runGit(['config', 'core.hooksPath', '/dev/null'], root);
    // Strip any embedded credentials from remote URL
    await runGit(['remote', 'set-url', 'origin', parsed.url], root);
    await importDiskToDb(workspaceId);
  } catch (err) {
    db.prepare('DELETE FROM code_workspaces WHERE id = ?').run(workspaceId);
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  const ws = db.prepare('SELECT * FROM code_workspaces WHERE id = ?').get(workspaceId);
  const files = db.prepare('SELECT path, content FROM code_files WHERE workspace_id = ? ORDER BY path').all(workspaceId);
  return {
    id: ws.id,
    user_id: ws.user_id,
    name: ws.name,
    language: ws.language,
    remote_url: ws.remote_url,
    remote_provider: ws.remote_provider,
    files,
    activeWebRun: null,
  };
}

async function ensureRoot(ws) {
  const root = workspaceRepoPath(ws.id);
  try {
    await fs.access(join(root, '.git'));
  } catch {
    throw new ValidationError('Локальний Git-репозиторій відсутній — зробіть commit або clone');
  }
  return root;
}

export async function createBranch(userId, workspaceId, { name, create, checkout }) {
  const ws = getOwned(userId, workspaceId);
  const root = await ensureRoot(ws);
  const branch = String(name || '').trim();
  if (!/^[A-Za-z0-9._/\-]{1,80}$/.test(branch) || branch.includes('..')) {
    throw new ValidationError('Некоректна назва гілки');
  }
  if (create) {
    await runGit(['checkout', '-b', branch], root, { timeout: 15000 });
  } else if (checkout) {
    await runGit(['checkout', branch], root, { timeout: 15000 });
    await importDiskToDb(ws.id);
  }
  return readRemoteSnapshot(root, ws);
}

export async function pull(userId, workspaceId) {
  assertRemoteRate(userId);
  const ws = getOwned(userId, workspaceId);
  const root = await ensureRoot(ws);
  const provider = ws.remote_provider || 'github';
  const token = gitOAuth.getAccessToken(userId, provider);
  const auth = authExtra(provider, token);
  await runGit(['pull', '--ff-only'], root, { timeout: 120000, ...auth });
  await importDiskToDb(ws.id);
  return readRemoteSnapshot(root, getOwned(userId, workspaceId));
}

export async function push(userId, workspaceId, role, { force } = {}) {
  assertRemoteRate(userId);
  const ws = getOwned(userId, workspaceId);
  const root = await ensureRoot(ws);
  const branchOut = await runGit(['branch', '--show-current'], root, { timeout: 5000 });
  const branch = branchOut.stdout.trim();
  if (force && ['main', 'master'].includes(branch) && !STAFF_ROLES.has(role)) {
    throw new ForbiddenError('Force-push на main/master заборонено');
  }
  if (force && ['main', 'master'].includes(branch) && STAFF_ROLES.has(role) && force !== 'confirm') {
    throw new ValidationError('Для force-push на main/master потрібне підтвердження');
  }
  const provider = ws.remote_provider || 'github';
  const token = gitOAuth.getAccessToken(userId, provider);
  if (!token) throw new ValidationError(`Підключіть ${provider} OAuth перед push`);
  const auth = authExtra(provider, token);
  const args = force === 'confirm' ? ['push', '--force-with-lease'] : ['push', '-u', 'origin', 'HEAD'];
  await runGit(args, root, { timeout: 120000, ...auth });
  return readRemoteSnapshot(root, ws);
}

export async function mergeBranch(userId, workspaceId, { branch }) {
  const ws = getOwned(userId, workspaceId);
  const root = await ensureRoot(ws);
  const target = String(branch || '').trim();
  if (!/^[A-Za-z0-9._/\-]{1,80}$/.test(target)) {
    throw new ValidationError('Некоректна гілка для merge');
  }
  try {
    await runGit(['merge', '--no-ff', target, '-m', `Merge ${target}`], root, { timeout: 60000 });
    await importDiskToDb(ws.id);
    return { ok: true, ...(await readRemoteSnapshot(root, ws)) };
  } catch (err) {
    const conflict = await runGit(['diff', '--name-only', '--diff-filter=U'], root, { timeout: 10000 }).catch(() => ({ stdout: '' }));
    await runGit(['merge', '--abort'], root, { timeout: 10000 }).catch(() => {});
    return {
      ok: false,
      message: err.message,
      merge_conflict: conflict.stdout.trim() || 'конфлікт merge',
      ...(await readRemoteSnapshot(root, ws)),
    };
  }
}

export async function listPullRequests(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  if (!ws.remote_url) return { items: [] };
  const provider = ws.remote_provider || 'github';
  const token = gitOAuth.getAccessToken(userId, provider);
  if (!token) return { items: [] };
  const { owner, repo } = parseOwnerRepo(ws.remote_url, provider);
  if (provider === 'github') {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=10`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'laboratorium-school',
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!Array.isArray(data)) return { items: [] };
    return {
      items: data.map((p) => ({ id: p.number, title: p.title, url: p.html_url, state: p.state })),
    };
  }
  const base = config.gitOAuth.gitlab.baseUrl.replace(/\/+$/, '');
  const project = encodeURIComponent(`${owner}/${repo}`);
  const res = await fetch(`${base}/api/v4/projects/${project}/merge_requests?state=opened&per_page=10`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!Array.isArray(data)) return { items: [] };
  return {
    items: data.map((p) => ({ id: p.iid, title: p.title, url: p.web_url, state: p.state })),
  };
}

export async function createPullRequest(userId, workspaceId, { title, body, base }) {
  assertRemoteRate(userId);
  const ws = getOwned(userId, workspaceId);
  if (!ws.remote_url) throw new ValidationError('Немає remote URL');
  const provider = ws.remote_provider || 'github';
  const token = gitOAuth.getAccessToken(userId, provider);
  if (!token) throw new ValidationError(`Підключіть ${provider}`);
  const root = await ensureRoot(ws);
  const branch = (await runGit(['branch', '--show-current'], root, { timeout: 5000 })).stdout.trim();
  const { owner, repo } = parseOwnerRepo(ws.remote_url, provider);
  const prTitle = String(title || '').trim().slice(0, 120) || `Update ${branch}`;
  const prBody = String(body || '').slice(0, 4000);
  const baseBranch = String(base || 'main').trim() || 'main';

  if (provider === 'github') {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'laboratorium-school',
      },
      body: JSON.stringify({ title: prTitle, body: prBody, head: branch, base: baseBranch }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) throw new ValidationError(data.message || 'Не вдалося створити PR');
    return { id: data.number, url: data.html_url, title: data.title };
  }

  const glBase = config.gitOAuth.gitlab.baseUrl.replace(/\/+$/, '');
  const project = encodeURIComponent(`${owner}/${repo}`);
  const res = await fetch(`${glBase}/api/v4/projects/${project}/merge_requests`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: prTitle,
      description: prBody,
      source_branch: branch,
      target_branch: baseBranch,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!res.ok) throw new ValidationError(data.message || 'Не вдалося створити MR');
  return { id: data.iid, url: data.web_url, title: data.title };
}

function parseOwnerRepo(remoteUrl, provider) {
  const u = new URL(remoteUrl);
  const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length < 2) throw new ValidationError('Не вдалося розпарсити owner/repo');
  if (provider === 'gitlab') {
    return { owner: parts.slice(0, -1).join('/'), repo: parts[parts.length - 1] };
  }
  return { owner: parts[0], repo: parts[1] };
}

export { ALLOWED_HOSTS, workspaceRepoPath, runGit };
