import db from '../db/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as sandbox from './sandbox.service.js';

const STAFF_ROLES = new Set(['owner', 'developer', 'teacher']);
const MAX_WORKSPACES_PER_USER = 20;
const MIN_RUN_INTERVAL_MS = 3000;

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

export function getWithFiles(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  const files = db.prepare(`
    SELECT path, content FROM code_files WHERE workspace_id = ? ORDER BY path
  `).all(workspaceId);
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

  const saveAll = db.transaction(() => {
    db.prepare('DELETE FROM code_files WHERE workspace_id = ?').run(workspaceId);
    for (const f of files) {
      const path = String(f.path || '').trim().slice(0, 64);
      if (!path) continue;
      const content = String(f.content ?? '').slice(0, 200_000);
      db.prepare(`INSERT INTO code_files (workspace_id, path, content) VALUES (?, ?, ?)`).run(workspaceId, path, content);
    }
    db.prepare(`UPDATE code_workspaces SET updated_at = datetime('now') WHERE id = ?`).run(workspaceId);
  });
  saveAll();

  return getWithFiles(userId, ws.id);
}

export function remove(userId, workspaceId) {
  const ws = getOwned(userId, workspaceId);
  const activeRun = db.prepare(`
    SELECT * FROM code_runs WHERE workspace_id = ? AND mode = 'web' AND status = 'running'
  `).get(workspaceId);
  if (activeRun) sandbox.stopWebPreview(activeRun.container_name, activeRun.work_dir).catch(() => {});

  db.prepare('DELETE FROM code_workspaces WHERE id = ?').run(ws.id);
  return { ok: true };
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
