import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTestEnv } from '../adversarial-review/helpers/setup.js';

setTestEnv({ LAB_USE_LOCAL_DOCKER: 'true' });

const {
  wrapSandboxCommand,
  buildSandboxRunArgs,
  parseContainerIdsFromProc,
  dockerCopySource,
} = await import('../server/services/sandbox.service.js');

const execFileAsync = promisify(execFile);

function tarList(archive) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-tf', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout))));
    child.stdin.end(archive);
  });
}

test('sandbox run args feed files through stdin tar instead of a host bind mount', () => {
  const args = buildSandboxRunArgs('sbx-test', 'python:3.12-slim', ['python3', 'main.py']);
  assert.equal(args.includes('-v'), false, 'bind-mount would be empty behind docker.sock');
  assert.ok(args.includes('-i'));
  assert.ok(args.includes('--rm'));
  assert.ok(args.some((a) => String(a).startsWith('/workspace')));
  assert.deepEqual(args.slice(-2), ['python3', 'main.py']);
  const script = args[args.indexOf('sh') + 2];
  assert.match(script, /tar -xf - -o -C \/workspace/);
  assert.match(script, /exec "\$@"/);
});

test('wrapSandboxCommand keeps the student command as argv after a fixed extract script', () => {
  const wrapped = wrapSandboxCommand(['python3', 'main.py']);
  assert.equal(wrapped[0], 'sh');
  assert.equal(wrapped[3], 'sh');
  assert.deepEqual(wrapped.slice(4), ['python3', 'main.py']);
});

test('parseContainerIdsFromProc reads Docker cgroup and mountinfo ids', () => {
  const cgroup = '0::/system.slice/docker-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.scope\n';
  const mountinfo = '364 104 0:56 / / rw - overlay overlay rw,upperdir=/var/lib/docker/containers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/hostname\n';
  const ids = parseContainerIdsFromProc(cgroup, mountinfo);
  assert.ok(ids.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.ok(ids.includes('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'));
});

test('dockerCopySource uses this container as the cp origin when running under Docker', () => {
  assert.equal(dockerCopySource('/tmp/lab-sandbox-x', null), '/tmp/lab-sandbox-x/.');
  assert.equal(
    dockerCopySource('/tmp/lab-sandbox-x', 'laboratorium-app'),
    'laboratorium-app:/tmp/lab-sandbox-x/.',
  );
});

test('workspace tar archive contains main.py so python3 can open it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lab-sandbox-test-'));
  try {
    await writeFile(join(dir, 'main.py'), 'print("Hello, laboratorium!")\n', 'utf8');
    const { stdout: archive } = await execFileAsync('tar', ['-C', dir, '-cf', '-', '.'], {
      encoding: 'buffer',
      maxBuffer: 1024 * 1024,
    });
    assert.ok(Buffer.isBuffer(archive) && archive.length > 0);
    const listed = await tarList(archive);
    assert.match(listed, /main\.py/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
