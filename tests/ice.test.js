import test from 'node:test';
import assert from 'node:assert/strict';
import { getIceServersForUser, PUBLIC_TURN_FALLBACK } from '../server/services/ice.service.js';

test('getIceServersForUser falls back to public TURN when private host unreachable', async () => {
  const prev = { ...process.env };
  process.env.TURN_HOST = 'turn.invalid.laboratorium.local';
  process.env.TURN_SECRET = 'test-secret';
  process.env.TURN_PUBLIC_FALLBACK = 'true';
  delete process.env.TURN_FORCE_PUBLIC;

  const result = await getIceServersForUser(42);
  assert.equal(result.source, 'public-fallback');
  assert.ok(result.iceServers.some((s) => String(s.urls).includes('openrelay.metered.ca')));
  assert.equal(result.iceServers.length, PUBLIC_TURN_FALLBACK.length);

  Object.keys(process.env).forEach((k) => {
    if (!(k in prev)) delete process.env[k];
  });
  Object.assign(process.env, prev);
});

test('getIceServersForUser returns public when TURN env missing', async () => {
  const prevHost = process.env.TURN_HOST;
  const prevSecret = process.env.TURN_SECRET;
  delete process.env.TURN_HOST;
  delete process.env.TURN_SECRET;
  process.env.TURN_PUBLIC_FALLBACK = 'true';

  const result = await getIceServersForUser(1);
  assert.equal(result.source, 'public-fallback');
  assert.ok(result.iceServers.length >= 2);

  if (prevHost !== undefined) process.env.TURN_HOST = prevHost;
  else delete process.env.TURN_HOST;
  if (prevSecret !== undefined) process.env.TURN_SECRET = prevSecret;
  else delete process.env.TURN_SECRET;
});
