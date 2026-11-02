import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeJwt, extractIocs, analyzeHeaders, testRegex, createProject, deleteProject, renameProject,
  duplicateProject, addFinding, removeFinding, WORKBENCH_TOOLS, TOOL_CATEGORIES,
  hexEncode, hexDecode, rot13, multiHash, identifyHash, parseHttpMessage, parseUrlParts, parseUserAgent,
  parseWhoisText, analyzeEmailHeaders, calcCidr, generateSubdomainWordlist, extractStrings, xorBruteforce,
  nestedDecode, testJwtWeakSecret, detectAttackPatterns, textToBase64,
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

test('project CRUD operations including duplicate', () => {
  let store = { projects: {}, activeId: null };
  store = createProject(store, 'Investigation A');
  const id = store.activeId;
  assert.equal(store.projects[id].name, 'Investigation A');
  assert.ok(store.projects[id].updatedAt >= store.projects[id].createdAt);
  store = addFinding(store, id, { toolId: 'ioc', input: 'x', summary: 'found 1', body: '<p>1</p>' });
  assert.equal(store.projects[id].findings.length, 1);
  const findingId = store.projects[id].findings[0].id;
  store = renameProject(store, id, 'Renamed');
  assert.equal(store.projects[id].name, 'Renamed');
  store = duplicateProject(store, id);
  const dupId = store.activeId;
  assert.notEqual(dupId, id);
  assert.equal(store.projects[dupId].findings.length, 1);
  assert.match(store.projects[dupId].name, /копія/);
  store = removeFinding(store, id, findingId);
  assert.equal(store.projects[id].findings.length, 0);
  store = deleteProject(store, id);
  assert.equal(store.projects[id], undefined);
});

test('workbench tools cover every declared category and have unique ids', () => {
  const ids = WORKBENCH_TOOLS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'tool ids must be unique');
  const categoryIds = new Set(TOOL_CATEGORIES.map((c) => c.id));
  WORKBENCH_TOOLS.forEach((tool) => assert.ok(categoryIds.has(tool.category), `${tool.id} has an unknown category`));
  // every category should have at least one tool
  categoryIds.forEach((cat) => assert.ok(ids.some((id) => WORKBENCH_TOOLS.find((t) => t.id === id).category === cat)));
});

test('hex encode/decode round trip', () => {
  assert.equal(hexDecode(hexEncode('Hello, world!')), 'Hello, world!');
  assert.throws(() => hexDecode('not-hex'));
});

test('rot13 is its own inverse', () => {
  assert.equal(rot13(rot13('Hello World')), 'Hello World');
  assert.notEqual(rot13('Hello'), 'Hello');
});

test('multiHash computes SHA-1/256/384/512 of pasted text', async () => {
  const digests = await multiHash('abc');
  assert.equal(digests.sha1, 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(digests.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(digests.sha384.length, 96);
  assert.equal(digests.sha512.length, 128);
});

test('identifyHash recognises common hash shapes by pattern', () => {
  assert.ok(identifyHash('5d41402abc4b2a76b9719d911017c592').candidates[0].includes('MD5'));
  assert.ok(identifyHash('$2b$12$abcdefghijklmnopqrstuv').candidates.includes('bcrypt'));
  assert.ok(identifyHash('not a hash at all').candidates[0].includes('Невідомий'));
});

test('parseHttpMessage structures a raw request dump', () => {
  const raw = 'GET /path?x=1 HTTP/1.1\nHost: example.com\nUser-Agent: curl\n\nbody-here';
  const r = parseHttpMessage(raw);
  assert.equal(r.requestLine.method, 'GET');
  assert.equal(r.requestLine.path, '/path?x=1');
  assert.equal(r.headers.host, 'example.com');
  assert.equal(r.body, 'body-here');
  assert.throws(() => parseHttpMessage('not a http message'));
});

test('parseUrlParts breaks a URL into components without fetching it', () => {
  const r = parseUrlParts('https://example.com:8080/a/b?x=1&y=2#frag');
  assert.equal(r.host, 'example.com');
  assert.equal(r.port, '8080');
  assert.equal(r.path, '/a/b');
  assert.deepEqual(r.query, [['x', '1'], ['y', '2']]);
  assert.equal(r.hash, 'frag');
});

test('parseUserAgent detects a common Chrome/Windows UA heuristically', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
  const r = parseUserAgent(ua);
  assert.equal(r.browser.name, 'Chrome');
  assert.equal(r.os, 'Windows 10/11');
  assert.equal(r.isBot, false);
});

test('parseWhoisText structures pasted whois output into fields', () => {
  const raw = 'Domain Name: EXAMPLE.COM\nRegistrar: Example Registrar\nName Server: ns1.example.com\nName Server: ns2.example.com';
  const r = parseWhoisText(raw);
  assert.equal(r['Domain Name'], 'EXAMPLE.COM');
  assert.deepEqual(r['Name Server'], ['ns1.example.com', 'ns2.example.com']);
});

test('analyzeEmailHeaders flags a From/Reply-To domain mismatch', () => {
  const raw = 'From: a@a.com\nReply-To: b@b.com\n'
    + 'Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=a.com; dkim=fail; dmarc=pass\n'
    + 'Received: from x\nReceived: from y';
  const r = analyzeEmailHeaders(raw);
  assert.equal(r.spf, 'pass');
  assert.equal(r.dkim, 'fail');
  assert.equal(r.possibleSpoofHint, true);
  assert.equal(r.receivedHops, 2);
});

test('calcCidr computes network range for a /24', () => {
  const r = calcCidr('192.168.1.0/24');
  assert.equal(r.network, '192.168.1.0');
  assert.equal(r.broadcast, '192.168.1.255');
  assert.equal(r.firstHost, '192.168.1.1');
  assert.equal(r.lastHost, '192.168.1.254');
  assert.equal(r.usableHosts, 254);
  assert.throws(() => calcCidr('not-a-cidr'));
});

test('generateSubdomainWordlist only generates candidate names, never resolves them', () => {
  const list = generateSubdomainWordlist('example.com', 'foo, bar');
  assert.ok(list.includes('www.example.com'));
  assert.ok(list.includes('foo.example.com'));
  assert.ok(list.includes('bar.example.com'));
  assert.throws(() => generateSubdomainWordlist(''));
});

test('extractStrings pulls printable runs out of a hex dump (like `strings`)', () => {
  const hex = Buffer.from('hello\x00world').toString('hex');
  const r = extractStrings(hex, 3);
  assert.deepEqual(r, ['hello', 'world']);
});

test('xorBruteforce recovers a known single-byte XOR key among its top candidates', () => {
  const hex = Buffer.from('hello world'.split('').map((c) => c.charCodeAt(0) ^ 0x20)).toString('hex');
  const candidates = xorBruteforce(hex);
  assert.ok(candidates.some((c) => c.text === 'hello world'));
  assert.throws(() => xorBruteforce('nothex'));
});

test('nestedDecode peels layered url/base64 encoding without any network access', async () => {
  const inner = textToBase64('secret=1');
  const outer = encodeURIComponent(inner);
  const layers = nestedDecode(outer);
  assert.equal(layers[layers.length - 1].value, 'secret=1');
});

test('testJwtWeakSecret finds a secret from a short local wordlist via HMAC only', async () => {
  const crypto = await import('node:crypto');
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ sub: 1 });
  const sig = crypto.createHmac('sha256', 'secret123').update(`${header}.${payload}`).digest('base64url');
  const token = `${header}.${payload}.${sig}`;
  const found = await testJwtWeakSecret(token, 'wrongpass\nsecret123\nadmin');
  assert.equal(found.found, 'secret123');
  const notFound = await testJwtWeakSecret(token, 'wrongpass\nadmin');
  assert.equal(notFound.found, null);
});

test('detectAttackPatterns flags common attack signatures in pasted logs only', () => {
  const r = detectAttackPatterns("id=1 OR 1=1 -- and <script>alert(1)</script> and ../../etc/passwd");
  const ids = r.map((x) => x.id);
  assert.ok(ids.includes('sqli'));
  assert.ok(ids.includes('xss'));
  assert.ok(ids.includes('traversal') || ids.includes('lfi'));
  assert.deepEqual(detectAttackPatterns('just a normal log line'), []);
});
