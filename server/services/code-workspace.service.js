import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import db from '../db/index.js';
import config from '../config/index.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as sandbox from './sandbox.service.js';

const execFileAsync = promisify(execFile);
const STAFF_ROLES = new Set(['owner', 'developer', 'teacher']);
const MAX_WORKSPACES_PER_USER = 20;
const MIN_RUN_INTERVAL_MS = 3000;
const GIT_ROOT = resolve(dirname(config.db.path), 'code-workspaces');

const DEFAULT_FILES = {
  python: [{ path: 'main.py', content: 'print("Hello, laboratorium!")\n' }],
  node: [{ path: 'main.js', content: 'console.log("Hello, laboratorium!");\n' }],
  cpp: [{ path: 'main.cpp', content: '#include <iostream>\n\nint main() {\n  std::cout << "Hello, laboratorium!" << std::endl;\n  return 0;\n}\n' }],
  bash: [{ path: 'main.sh', content: 'echo "Hello, laboratorium!"\n' }],
  web: [
    { path: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head><link rel="stylesheet" href="style.css"></head>\n<body>\n  <h1>Hello, laboratorium!</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
    { path: 'style.css', content: 'body { font-family: sans-serif; background: #111; color: #eee; }\n' },
    { path: 'script.js', content: 'console.log("web workspace ready");\n' },
  ],
};

/** Учні мають доступ, якщо є в групі напрямку з is_programming=1; персонал — завжди. */
export function canUseSandbox(userId, role) {
  if (STAFF_ROLES.has(role)) return true;
  const row = db.prepare(`
    SELECT 1 FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    JOIN programs p ON p.id = g.program_id
    JOIN directions d ON d.id = p.direction_id AND d.is_programming = 1
    WHERE gm.user_id = ?
    LIMIT 1
  `).get(userId);
  return !!row;
}

function assertCanUse(userId, role) {
  if (!canUseSandbox(userId, role)) {
    throw new ForbiddenError('Редактор коду доступний учасникам груп програмістських напрямків');
  }
}

function mapWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    name: row.name,
    language: row.language,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    mode: row.mode,
    status: row.status,
    stdout: row.stdout,
    stderr: row.stderr,
    exit_code: row.exit_code,
    target_url: row.target_url,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

export function listMine(userId) {
  return db.prepare(`
    SELECT * FROM code_workspaces WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId).map(mapWorkspace);
}

function getOwned(userId, workspaceId) {
  const ws = db.prepare('SELECT * FROM code_workspaces WHERE id = ?').get(workspaceId);
  if (!ws) throw new NotFoundError('Робочий простір не знайдено');
  if (ws.user_id !== userId) throw new ForbiddenError('Це не ваш робочий простір');
  return ws;
}

function workspaceRepoPath(workspaceId) {
  const root = resolve(GIT_ROOT, String(workspaceId));
  if (!root.startsWith(`${GIT_ROOT}${sep}`)) throw new ValidationError('Невірний робочий простір');
  return root;
}

function validateWorkspacePath(rawPath) {
  const value = String(rawPath || '').trim();
  const parts = value.split('/');
  if (
    !value
    || value.length > 64
    || value.includes('\\')
    || /^[a-z]:/i.test(value)
    || /[\0-\x1f\x7f]/.test(value)
    || parts.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')
  ) {
    throw new ValidationError('Некоректний шлях файлу. Використовуйте відносний шлях без .git, .. та зворотних слешів');
  }
  return value;
}

async function runGit(args, cwd) {
  try {
    return await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError('Локальний Git недоступний на сервері', 503, 'GIT_UNAVAILABLE');
    }
    const details = String(error.stderr || error.message || '').trim().slice(0, 1000);
    throw new AppError(`Помилка локального Git${details ? `: ${details}` : ''}`, 500, 'GIT_OPERATION_FAILED');
  }
}

async function clearWorkspaceFiles(directory, isRoot = true) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (isRoot && entry.name === '.git') continue;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await clearWorkspaceFiles(entryPath, false);
      await fs.rmdir(entryPath);
    } else {
      await fs.unlink(entryPath);
    }
  }
}

async function syncWorkspaceFiles(workspaceId, files) {
  const root = workspaceRepoPath(workspaceId);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.chmod(root, 0o700);
  await clearWorkspaceFiles(root);
  for (const file of files) {
    const path = validateWorkspacePath(file.path);
    const destination = resolve(root, ...path.split('/'));
    if (!destination.startsWith(`${root}${sep}`)) throw new ValidationError('Шлях файлу виходить за межі проєкту');
    await fs.mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await fs.writeFile(destination, file.content, { encoding: 'utf8', mode: 0o600 });
  }
  return root;
}

async function ensureGitRepository(workspaceId, files) {
  const root = await syncWorkspaceFiles(workspaceId, files);
  try {
    const stat = await fs.lstat(join(root, '.git'));
    if (!stat.isDirectory()) throw new ValidationError('Некоректна локальна Git-база');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await runGit(['init', '--quiet'], root);
    await runGit(['checkout', '--quiet', '-b', 'main'], root);
    await runGit(['config', 'user.name', 'Laboratorium learner'], root);
    await runGit(['config', 'user.email', 'learner@localhost'], root);
    await runGit(['config', 'commit.gpgsign', 'false'], root);
    await runGit(['config', 'core.hooksPath', '/dev/null'], root);
    await runGit(['add', '--all'], root);
    await runGit(['commit', '--quiet', '-m', 'Початковий стан'], root);
  }
  return root;
}

async function readGitSnapshot(root) {
  const [status, branch, commits, remotes] = await Promise.all([
    runGit(['status', '--short', '--untracked-files=all'], root),
    runGit(['branch', '--show-current'], root),
    runGit(['log', '-5', '--format=%h%x09%s'], root),
    runGit(['remote'], root),
  ]);
  const changes = status.stdout.split('\n').filter(Boolean);
  const history = commits.stdout.trim()
    ? commits.stdout.trim().split('\n').map((line) => {
      const [hash, ...parts] = line.split('\t');
      return { hash, message: parts.join('\t') };
    })
    : [];
  return {
    branch: branch.stdout.trim(),
    clean: changes.length === 0,
    changes,
    history,
    local_only: remotes.stdout.trim().length === 0,
  };
}

function getWorkspaceFiles(workspaceId) {
  return db.prepare('SELECT path, content FROM code_files WHERE workspace_id = ? ORDER BY path').all(workspaceId);
}

export function getWithFiles(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  const files = getWorkspaceFiles(workspaceId);
  const activeRun = db.prepare(`
    SELECT * FROM code_runs WHERE workspace_id = ? AND mode = 'web' AND status = 'running'
    ORDER BY id DESC LIMIT 1
  `).get(workspaceId);
  return { ...mapWorkspace(ws), files, activeWebRun: mapRun(activeRun) };
}

export function create(userId, role, { name, language, group_id }) {
  assertCanUse(userId, role);
  const lang = ['python', 'node', 'cpp', 'bash', 'web'].includes(language) ? language : 'python';
  const trimmedName = name?.trim() || `Проєкт ${lang}`;

  const count = db.prepare('SELECT COUNT(*) as c FROM code_workspaces WHERE user_id = ?').get(userId).c;
  if (count >= MAX_WORKSPACES_PER_USER) {
    throw new ValidationError(`Максимум ${MAX_WORKSPACES_PER_USER} робочих просторів на користувача`);
  }

  let groupId = group_id ? parseInt(group_id, 10) : null;
  if (groupId) {
    const member = db.prepare('SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    if (!member) groupId = null;
  }

  const createAll = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO code_workspaces (user_id, group_id, name, language)
      VALUES (?, ?, ?, ?)
    `).run(userId, groupId, trimmedName, lang);
    const workspaceId = result.lastInsertRowid;
    for (const f of DEFAULT_FILES[lang]) {
      db.prepare(`INSERT INTO code_files (workspace_id, path, content) VALUES (?, ?, ?)`).run(workspaceId, f.path, f.content);
    }
    return workspaceId;
  });

  return getWithFiles(userId, createAll());
}

export function saveFiles(userId, workspaceId, files) {
  const ws = getOwned(userId, workspaceId);
  if (!Array.isArray(files) || !files.length) throw new ValidationError('Немає файлів для збереження');
  if (files.length > 20) throw new ValidationError('Забагато файлів (максимум 20)');

  const normalizedFiles = files.map((file) => ({
    path: validateWorkspacePath(file?.path),
    content: String(file?.content ?? '').slice(0, 200_000),
  }));
  if (new Set(normalizedFiles.map(file => file.path)).size !== normalizedFiles.length) {
    throw new ValidationError('Шляхи файлів мають бути унікальними');
  }

  const saveAll = db.transaction(() => {
    db.prepare('DELETE FROM code_files WHERE workspace_id = ?').run(workspaceId);
    for (const file of normalizedFiles) {
      db.prepare(`INSERT INTO code_files (workspace_id, path, content) VALUES (?, ?, ?)`)
        .run(workspaceId, file.path, file.content);
    }
    db.prepare(`UPDATE code_workspaces SET updated_at = datetime('now') WHERE id = ?`).run(workspaceId);
  });
  saveAll();

  return getWithFiles(userId, ws.id);
}

export async function remove(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  const activeRun = db.prepare(`
    SELECT * FROM code_runs WHERE workspace_id = ? AND mode = 'web' AND status = 'running'
  `).get(workspaceId);
  if (activeRun) await sandbox.stopWebPreview(activeRun.container_name, activeRun.work_dir);

  await fs.rm(workspaceRepoPath(ws.id), { recursive: true, force: true });
  db.prepare('DELETE FROM code_workspaces WHERE id = ?').run(ws.id);
  return { ok: true };
}

export async function getGitStatus(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  const files = getWorkspaceFiles(ws.id);
  const root = await ensureGitRepository(ws.id, files);
  return readGitSnapshot(root);
}

export async function createGitCommit(userId, workspaceId, rawMessage) {
  const ws = getOwned(userId, workspaceId);
  const message = String(rawMessage || '').trim();
  if (!message || message.length > 120 || /[\0-\x1f\x7f]/.test(message)) {
    throw new ValidationError('Вкажіть назву коміту до 120 символів без керівних символів');
  }
  const root = await ensureGitRepository(ws.id, getWorkspaceFiles(ws.id));
  const before = await runGit(['status', '--porcelain', '--untracked-files=all'], root);
  if (!before.stdout.trim()) return { committed: false, ...await readGitSnapshot(root) };
  await runGit(['add', '--all'], root);
  await runGit(['commit', '--quiet', '-m', message], root);
  return { committed: true, ...await readGitSnapshot(root) };
}

const lastRunAt = new Map();
function assertRunRateLimit(userId) {
  const last = lastRunAt.get(userId) || 0;
  const now = Date.now();
  if (now - last < MIN_RUN_INTERVAL_MS) {
    throw new ValidationError('Зачекайте кілька секунд між запусками');
  }
  lastRunAt.set(userId, now);
}

export async function run(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  assertRunRateLimit(userId);
  if (ws.language === 'web') throw new ValidationError('Для web-проєкту використовуйте "Запустити прев\'ю"');

  const files = db.prepare('SELECT path, content FROM code_files WHERE workspace_id = ?').all(workspaceId);
  const runRow = db.prepare(`
    INSERT INTO code_runs (workspace_id, mode, status) VALUES (?, 'exec', 'running')
  `).run(workspaceId);

  const result = await sandbox.runExec(ws.language, files);

  db.prepare(`
    UPDATE code_runs SET status = ?, stdout = ?, stderr = ?, exit_code = ?, finished_at = datetime('now')
    WHERE id = ?
  `).run(result.status, result.stdout, result.stderr, result.exit_code, runRow.lastInsertRowid);

  return mapRun(db.prepare('SELECT * FROM code_runs WHERE id = ?').get(runRow.lastInsertRowid));
}

export async function runTests(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  assertRunRateLimit(userId);
  if (!['python', 'node'].includes(ws.language)) {
    throw new ValidationError('Автоматичний запуск тестів наразі доступний для Python і Node.js');
  }

  const files = db.prepare('SELECT path, content FROM code_files WHERE workspace_id = ?').all(workspaceId);
  const result = await sandbox.runTests(ws.language, files);
  const runRow = db.prepare(`
    INSERT INTO code_runs (workspace_id, mode, status, stdout, stderr, exit_code, finished_at)
    VALUES (?, 'tests', ?, ?, ?, ?, datetime('now'))
  `).run(workspaceId, result.status, result.stdout, result.stderr, result.exit_code);
  return mapRun(db.prepare('SELECT * FROM code_runs WHERE id = ?').get(runRow.lastInsertRowid));
}

export async function runWeb(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  assertRunRateLimit(userId);
  if (ws.language !== 'web') throw new ValidationError('Прев\'ю доступне лише для web-проєктів');

  const existing = db.prepare(`
    SELECT * FROM code_runs WHERE workspace_id = ? AND mode = 'web' AND status = 'running'
  `).get(workspaceId);
  if (existing) {
    await sandbox.stopWebPreview(existing.container_name, existing.work_dir);
    db.prepare(`UPDATE code_runs SET status = 'done', finished_at = datetime('now') WHERE id = ?`).run(existing.id);
  }

  const files = db.prepare('SELECT path, content FROM code_files WHERE workspace_id = ?').all(workspaceId);
  const { containerName, hostPort, targetUrl, workDir } = await sandbox.startWebPreview(workspaceId, files);

  const runRow = db.prepare(`
    INSERT INTO code_runs (workspace_id, mode, status, target_url, container_name, host_port, work_dir)
    VALUES (?, 'web', 'running', ?, ?, ?, ?)
  `).run(workspaceId, targetUrl, containerName, hostPort, workDir);

  return mapRun(db.prepare('SELECT * FROM code_runs WHERE id = ?').get(runRow.lastInsertRowid));
}

export async function stopWeb(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  const existing = db.prepare(`
    SELECT * FROM code_runs WHERE workspace_id = ? AND mode = 'web' AND status = 'running'
  `).get(ws.id);
  if (!existing) return { ok: true };

  await sandbox.stopWebPreview(existing.container_name, existing.work_dir);
  db.prepare(`UPDATE code_runs SET status = 'done', finished_at = datetime('now') WHERE id = ?`).run(existing.id);
  return { ok: true };
}
