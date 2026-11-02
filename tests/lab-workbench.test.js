import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeJwt, extractIocs, analyzeHeaders, testRegex, createProject, deleteProject, renameProject,
  addFinding, removeFinding, WORKBENCH_TOOLS,
} from '../public/lab-workbench.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('decodeJwt reads header/payload without verifying the signature', () => {
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: '123', role: 'student' })}.sig`;
  const decoded = decodeJwt(token);
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.sub, '123');
  assert.equal(decoded.hasSignature, true);
  assert.throws(() => decodeJwt('not-a-jwt'));
});

test('extractIocs finds indicators in pasted text without any network access', () => {
  const text = 'Connection from 10.0.0.5 to evil.example.com, contact admin@example.com, '
    + 'see https://example.com/path, hash d41d8cd98f00b204e9800998ecf8427e';
  const r = extractIocs(text);
  assert.ok(r.ips.includes('10.0.0.5'));
  assert.ok(r.domains.includes('evil.example.com') || r.domains.some((d) => d.includes('evil.example.com')));
  assert.ok(r.emails.includes('admin@example.com'));
  assert.ok(r.urls.some((u) => u.startsWith('https://example.com')));
  assert.ok(r.hashes.md5.includes('d41d8cd98f00b204e9800998ecf8427e'));
});

test('analyzeHeaders flags missing security headers', () => {
  const checks = analyzeHeaders('content-type: text/html\nset-cookie: a=b');
  const csp = checks.find((c) => c.label === 'Content-Security-Policy');
  assert.equal(csp.ok, false);
});

test('testRegex finds matches in pasted text only', () => {
  const r = testRegex('\\d+', 'g', 'a1 b22 c333');
  assert.equal(r.count, 3);
  assert.equal(r.matches[0].match, '1');
});

test('project CRUD operations', () => {
  let store = { projects: {}, activeId: null };
  store = createProject(store, 'Investigation A');
  const id = store.activeId;
  assert.equal(store.projects[id].name, 'Investigation A');
  store = addFinding(store, id, { toolId: 'ioc', input: 'x', summary: 'found 1', body: '<p>1</p>' });
  assert.equal(store.projects[id].findings.length, 1);
  const findingId = store.projects[id].findings[0].id;
  store = renameProject(store, id, 'Renamed');
  assert.equal(store.projects[id].name, 'Renamed');
  store = removeFinding(store, id, findingId);
  assert.equal(store.projects[id].findings.length, 0);
  store = deleteProject(store, id);
  assert.equal(Object.keys(store.projects).length, 0);
});

test('workbench tool list only contains local, input-based analysis tools', () => {
  const ids = WORKBENCH_TOOLS.map((t) => t.id);
  assert.deepEqual(ids.sort(), ['base64', 'hash', 'headers', 'ioc', 'jwt', 'regex', 'url'].sort());
});
