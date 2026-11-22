import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, chmod, rm, readFile } from 'fs/promises';
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
const TAR_MAX_BYTES = 8 * 1024 * 1024;
const SANDBOX_WORKDIR = '/workspace';

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
 * The app talks to the host Docker daemon via a mounted docker.sock
 * (Coolify / compose). A `-v /tmp/foo:/workspace` bind is resolved on the
 * *host*, so the sandbox sees an empty directory and Python dies with
 * `can't open file '/workspace/main.py'`. Feed the files through stdin
 * instead: the daemon never needs a shared filesystem.
 */
export function wrapSandboxCommand(command) {
  if (!Array.isArray(command) || !command.length) {
    throw new ValidationError('Непідтримувана мова або команда');
  }
  return [
    'sh', '-c',
    `tar -xf - -o -C ${SANDBOX_WORKDIR} && exec "$@"`,
    'sh',
    ...command,
  ];
}

export function buildSandboxRunArgs(containerName, image, command) {
  return [
    'run', '--rm', '-i',
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
    '--tmpfs', `${SANDBOX_WORKDIR}:rw,exec,size=32m,mode=1777`,
    '-w', SANDBOX_WORKDIR,
    image,
    ...wrapSandboxCommand(command),
  ];
}

export function parseContainerIdsFromProc(cgroupText, mountinfoText) {
  const ids = [];
  const seen = new Set();
  const text = `${cgroupText || ''}\n${mountinfoText || ''}`;
  const patterns = [
    /\/docker\/containers\/([0-9a-f]{64})\//g,
    /\/docker-([0-9a-f]{64})\.scope/g,
    /\/docker\/([0-9a-f]{64})(?:\/|$)/g,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        ids.push(match[1]);
      }
    }
  }
  return ids;
}

export function dockerCopySource(hostDir, selfContainerId) {
  return selfContainerId ? `${selfContainerId}:${hostDir}/.` : `${hostDir}/.`;
}

export async function detectSelfContainerId() {
  let cgroup = '';
  let mountinfo = '';
  try { cgroup = await readFile('/proc/self/cgroup', 'utf8'); } catch { /* host / non-linux */ }
  try { mountinfo = await readFile('/proc/self/mountinfo', 'utf8'); } catch { /* host / non-linux */ }
  const candidates = parseContainerIdsFromProc(cgroup, mountinfo);
  if (process.env.HOSTNAME) candidates.push(process.env.HOSTNAME);
  for (const id of candidates) {
    try {
      await execFileAsync('docker', ['inspect', '--type', 'container', id, '-f', '{{.Id}}'], { timeout: 3000 });
      return id;
    } catch { /* try next candidate */ }
  }
  return null;
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

function execDockerWithStdin(args, input, { timeout, maxBuffer }) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = timeout ? setTimeout(() => child.kill('SIGKILL'), timeout) : null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxBuffer) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < maxBuffer) stderr += chunk;
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function tarWorkspace(dir) {
  const { stdout } = await execFileAsync('tar', ['-C', dir, '-cf', '-', '.'], {
    encoding: 'buffer',
    maxBuffer: TAR_MAX_BYTES,
  });
  return stdout;
}

/** One-shot code execution (Python/Node/C++/Bash) — no network, hard resource caps, ephemeral container. */
async function runInSandbox(language, files, command) {
  if (!isSandboxEnabled()) throw new ValidationError('Пісочницю коду не налаштовано на цьому сервері');
  const lang = LANGUAGES[language];
  if (!lang || !command) throw new ValidationError('Непідтримувана мова або команда');
  if (!Array.isArray(files) || !files.length) throw new ValidationError('Немає файлів для запуску');

  const dir = await mkdtemp(join(tmpdir(), 'lab-sandbox-'));
  const containerName = assertSafeContainerName(`sbx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const killer = scheduleHardKill(containerName, RUN_TIMEOUT_MS);
  try {
    await writeWorkspaceFiles(dir, files);
    const tarBuf = await tarWorkspace(dir);
    const args = buildSandboxRunArgs(containerName, lang.image, command);

    try {
      const result = await execDockerWithStdin(args, tarBuf, {
        timeout: RUN_TIMEOUT_MS + KILL_GRACE_MS,
        maxBuffer: MAX_OUTPUT_BYTES * 2,
      });
      if (killer.didFire()) {
        return {
          status: 'timeout',
          stdout: truncate(result.stdout),
          stderr: `Перевищено ліміт часу виконання (${RUN_TIMEOUT_MS / 1000}с)`,
          exit_code: null,
        };
      }
      if (result.code === 0) {
        return { status: 'done', stdout: truncate(result.stdout), stderr: truncate(result.stderr), exit_code: 0 };
      }
      return {
        status: 'error',
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
        exit_code: result.code ?? 1,
      };
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

export async function runExec(language, files) {
  const lang = LANGUAGES[language];
  if (!lang) throw new ValidationError('Непідтримувана мова');
  const entry = files?.find((f) => f.path === lang.filename)?.path || files?.[0]?.path;
  if (!entry) throw new ValidationError('Немає файлів для запуску');
  return runInSandbox(language, files, lang.cmd(safeFileName(entry)));
}

export async function runTests(language, files) {
  if (!['python', 'node'].includes(language)) {
    throw new ValidationError('Автоматичний запуск тестів наразі доступний для Python і Node.js');
  }
  const testFiles = (files || []).filter((file) => language === 'python'
    ? /(^|\/)test[^/]*\.py$/i.test(file.path)
    : /(^|\/)([^/]+\.)?(test|spec)\.js$/i.test(file.path));
  if (!testFiles.length) {
    throw new ValidationError(language === 'python'
      ? 'Додайте тестові файли test_*.py'
      : 'Додайте тестові файли *.test.js або *.spec.js');
  }
  const args = language === 'python'
    ? ['python3', '-m', 'unittest', 'discover', '-s', SANDBOX_WORKDIR, '-p', 'test*.py']
    : ['node', '--test', ...testFiles.map((file) => safeFileName(file.path))];
  return runInSandbox(language, files, args);
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
    'create',
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
    'nginx:alpine',
  ]);

  try {
    const selfId = await detectSelfContainerId();
    await execFileAsync('docker', [
      'cp',
      dockerCopySource(dir, selfId),
      `${containerName}:/usr/share/nginx/html`,
    ]);
    await execFileAsync('docker', ['start', containerName]);
  } catch (err) {
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

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
