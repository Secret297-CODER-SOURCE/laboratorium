import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import config from '../config/index.js';
import { ValidationError } from '../utils/errors.js';
import { assertSafeContainerName } from '../utils/docker-ref.js';
import { allocatePort } from './lab-agent.service.js';
import { getLabPublicConfig } from './settings.service.js';
import { buildDockerTargetUrl } from '../utils/publicUrl.js';

const execFileAsync = promisify(execFile);

const LANGUAGES = {
  python: { image: 'python:3.12-slim', filename: 'main.py', cmd: (f) => ['python3', f] },
  node: { image: 'node:20-slim', filename: 'main.js', cmd: (f) => ['node', f] },
  cpp: { image: 'gcc:13', filename: 'main.cpp', cmd: (f) => ['sh', '-c', `g++ -O2 -o /tmp/prog ${f} && /tmp/prog`] },
  bash: { image: 'bash:5', filename: 'main.sh', cmd: (f) => ['bash', f] },
};

const MAX_OUTPUT_BYTES = 64 * 1024;
const RUN_TIMEOUT_MS = 12_000;
const KILL_GRACE_MS = 3_000;

export function isSandboxEnabled() {
  return !!config.labAgent.useLocalDocker;
}

export function supportedLanguages() {
  return Object.keys(LANGUAGES);
}

function truncate(s) {
  if (!s) return s || '';
  return s.length > MAX_OUTPUT_BYTES ? `${s.slice(0, MAX_OUTPUT_BYTES)}\n…(вивід обрізано)` : s;
}

function safeFileName(path) {
  return String(path || '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 64) || 'file';
}

async function writeWorkspaceFiles(dir, files) {
  await chmod(dir, 0o755);
  for (const f of files) {
    const target = join(dir, safeFileName(f.path));
    await writeFile(target, f.content || '', 'utf8');
    await chmod(target, 0o644);
  }
}

/**
 * Kills the container directly by name (`docker kill`, SIGKILL) rather than
 * relying on execFile's own timeout — that only signals the local `docker`
 * CLI process, which forwards a *graceful* stop (SIGTERM + up to 10s grace)
 * to the container. Measured: that path leaves a runaway container alive
 * for 20s+ past the intended deadline. `docker kill` by name reaches the
 * daemon directly and is near-instant regardless of what the CLI is doing.
 */
function scheduleHardKill(containerName, ms) {
  let firedTimeout = false;
  const timer = setTimeout(() => {
    firedTimeout = true;
    execFile('docker', ['kill', containerName], () => {});
  }, ms);
  return {
    clear: () => clearTimeout(timer),
    didFire: () => firedTimeout,
  };
}

/** One-shot code execution (Python/Node/C++/Bash) — no network, hard resource caps, ephemeral container. */
export async function runExec(language, files) {
  if (!isSandboxEnabled()) throw new ValidationError('Пісочницю коду не налаштовано на цьому сервері');
  const lang = LANGUAGES[language];
  if (!lang) throw new ValidationError('Непідтримувана мова');
  if (!Array.isArray(files) || !files.length) throw new ValidationError('Немає файлів для запуску');

  const dir = await mkdtemp(join(tmpdir(), 'lab-sandbox-'));
  const containerName = assertSafeContainerName(`sbx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const entry = files.find((f) => f.path === lang.filename)?.path || files[0].path;

  const killer = scheduleHardKill(containerName, RUN_TIMEOUT_MS);
  try {
    await writeWorkspaceFiles(dir, files);

    const args = [
      'run', '--rm',
      '--name', containerName,
      '--network', 'none',
      '--memory', '256m',
      '--cpus', '1',
      '--pids-limit', '128',
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      '--user', '65534:65534',
      '--read-only',
      '--tmpfs', '/tmp:rw,exec,size=32m',
      '-v', `${dir}:/workspace:ro`,
      '-w', '/workspace',
      lang.image,
      ...lang.cmd(safeFileName(entry)),
    ];

    try {
      const { stdout, stderr } = await execFileAsync('docker', args, {
        timeout: RUN_TIMEOUT_MS + KILL_GRACE_MS,
        maxBuffer: MAX_OUTPUT_BYTES * 2,
      });
      return { status: 'done', stdout: truncate(stdout), stderr: truncate(stderr), exit_code: 0 };
    } catch (err) {
      if (killer.didFire()) {
        return {
          status: 'timeout',
          stdout: truncate(err.stdout),
          stderr: `Перевищено ліміт часу виконання (${RUN_TIMEOUT_MS / 1000}с)`,
          exit_code: null,
        };
      }
      return { status: 'error', stdout: truncate(err.stdout), stderr: truncate(err.stderr || err.message), exit_code: err.code ?? 1 };
    }
  } finally {
    killer.clear();
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Static HTML/CSS/JS preview — serves the workspace files read-only via
 * nginx, no code execution involved (deliberately scoped to static files
 * for V1 — a live Node/Vite dev server is a much larger, riskier surface).
 */
export async function startWebPreview(workspaceId, files) {
  if (!isSandboxEnabled()) throw new ValidationError('Пісочницю коду не налаштовано на цьому сервері');
  if (!files.some((f) => /\.html?$/i.test(f.path))) {
    throw new ValidationError('Потрібен хоча б один .html файл для перегляду');
  }

  const dir = await mkdtemp(join(tmpdir(), 'lab-sandbox-web-'));
  await writeWorkspaceFiles(dir, files);

  const containerName = assertSafeContainerName(`sbxweb-${workspaceId}`);
  await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});

  const hostPort = allocatePort(workspaceId);
  await execFileAsync('docker', [
    'run', '-d',
    '--name', containerName,
    '-p', `${hostPort}:80`,
    '--memory', '128m',
    '--cpus', '0.5',
    '--pids-limit', '64',
    '--read-only',
    '--tmpfs', '/var/cache/nginx:rw,size=16m',
    '--tmpfs', '/var/run:rw,size=8m',
    '--tmpfs', '/tmp:rw,size=8m',
    '--security-opt', 'no-new-privileges',
    '-v', `${dir}:/usr/share/nginx/html:ro`,
    'nginx:alpine',
  ]);

  const cfg = getLabPublicConfig();
  const targetUrl = buildDockerTargetUrl(cfg.dockerHostIp, hostPort, cfg);
  return { containerName, hostPort, targetUrl, workDir: dir };
}

export async function stopWebPreview(containerName, workDir) {
  if (containerName) {
    await execFileAsync('docker', ['rm', '-f', assertSafeContainerName(containerName)]).catch(() => {});
  }
  if (workDir) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
