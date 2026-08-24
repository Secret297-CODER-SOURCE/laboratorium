import { ValidationError } from './errors.js';

const UNSAFE = /[\s;|&$`<>(){}\\!#'"\n\r\t]/;

export function assertSafeDockerImage(image) {
  const s = String(image || '').trim();
  if (!s || s.length > 256 || UNSAFE.test(s) || !/^[A-Za-z0-9][A-Za-z0-9._/@:+-]*$/.test(s)) {
    throw new ValidationError('Некоректний Docker image');
  }
  return s;
}

export function assertSafeContainerName(name) {
  return String(name || 'lab').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48) || 'lab';
}

export function assertSafePort(port) {
  const n = Number.parseInt(port, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ValidationError('Некоректний порт');
  }
  return n;
}

export function assertSafePortList(ports) {
  const list = Array.isArray(ports) ? ports : [];
  if (list.length > 4) throw new ValidationError('Забагато портів');
  return list.map((p) => assertSafePort(p));
}

export function dockerEnvArgs(envVars = {}) {
  const args = [];
  for (const [k, v] of Object.entries(envVars || {})) {
    if (!k || v == null || !/^[A-Z0-9_]+$/.test(k)) continue;
    args.push('-e', `${k}=${String(v)}`);
  }
  return args;
}
