import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

function readPackageVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

if (existsSync(join(root, '.env'))) {
  loadEnv({ path: join(root, '.env') });
}

function env(key, fallback) {
  const val = process.env[key];
  return val !== undefined && val !== '' ? val : fallback;
}

function envInt(key, fallback) {
  const n = parseInt(process.env[key], 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key, fallback) {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return ['1', 'true', 'yes'].includes(val.toLowerCase());
}

export const config = {
  env: env('NODE_ENV', 'development'),
  port: envInt('PORT', 3000),
  host: env('HOST', '0.0.0.0'),

  jwt: {
    secret: env('JWT_SECRET', 'lab-dev-secret-change-in-production'),
    expiresIn: env('JWT_EXPIRES_IN', '7d'),
  },

  db: {
    path: env('DATABASE_PATH', join(root, 'data', 'laboratorium.db')),
    seed: envBool('SEED_DATABASE', true),
  },

  cors: {
    origin: env('CORS_ORIGIN', '*'),
  },

  rateLimit: {
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: envInt('RATE_LIMIT_MAX', 100),
    authMax: envInt('AUTH_RATE_LIMIT_MAX', 20),
  },

  bcryptRounds: envInt('BCRYPT_ROUNDS', 10),
  isProd: env('NODE_ENV', 'development') === 'production',

  appUrl: env('APP_URL', 'https://laboratorium.club'),
  siteUrl: env('SITE_URL', 'https://laboratorium.club'),
  contactEmail: env('CONTACT_EMAIL', 'hello@laboratorium.club'),

  auth: {
    allowPublicRegistration: envBool('ALLOW_PUBLIC_REGISTRATION', false),
    resetTokenHours: envInt('RESET_TOKEN_HOURS', 24),
  },

  smtp: {
    host: env('SMTP_HOST', ''),
    port: envInt('SMTP_PORT', 587),
    secure: envBool('SMTP_SECURE', false),
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('SMTP_FROM', 'noreply@laboratorium.club'),
  },

  uploads: {
    dir: env('UPLOADS_DIR', join(root, 'data', 'uploads')),
    recordingsDir: env('RECORDINGS_DIR', join(root, 'data', 'uploads', 'recordings')),
    chatDir: env('CHAT_UPLOADS_DIR', join(root, 'data', 'uploads', 'chat')),
    ctfDir: env('CTF_ATTACHMENTS_DIR', join(root, 'data', 'uploads', 'ctf-attachments')),
    maxFileSize: envInt('MAX_RECORDING_SIZE_MB', 500) * 1024 * 1024,
    maxChatFileSize: envInt('MAX_CHAT_FILE_SIZE_MB', 50) * 1024 * 1024,
    maxCtfAttachmentSize: envInt('MAX_CTF_ATTACHMENT_SIZE_MB', 25) * 1024 * 1024,
  },

  proxmox: {
    enabled: envBool('PROXMOX_ENABLED', false),
    host: env('PROXMOX_HOST', 'https://pve.local:8006'),
    tokenId: env('PROXMOX_TOKEN_ID', ''),
    tokenSecret: env('PROXMOX_TOKEN_SECRET', ''),
    node: env('PROXMOX_NODE', 'pve'),
    templateVmid: envInt('PROXMOX_TEMPLATE_VMID', 9000),
    storage: env('PROXMOX_STORAGE', 'local-lvm'),
    bridge: env('PROXMOX_BRIDGE', 'vmbr0'),
    vmMemoryMb: envInt('LAB_VM_MEMORY_MB', 4096),
    vmCores: envInt('LAB_VM_CORES', 2),
    rejectUnauthorized: envBool('PROXMOX_REJECT_UNAUTHORIZED', false),
  },

  labAgent: {
    url: env('LAB_AGENT_URL', ''),
    secret: env('LAB_AGENT_SECRET', 'dev-lab-agent-secret'),
    hostIp: env('LAB_DOCKER_HOST_IP', '127.0.0.1'),
    portRangeStart: envInt('LAB_DOCKER_PORT_START', 31000),
    portRangeEnd: envInt('LAB_DOCKER_PORT_END', 32000),
    useLocalDocker: envBool('LAB_USE_LOCAL_DOCKER', false),
    ctfImage: env('CTF_DOCKER_IMAGE', 'laboratorium/ctf-lab:latest'),
  },

  labPublic: {
    useSslip: envBool('LAB_USE_SSLIP', true),
    sslipDomain: env('LAB_SSLIP_DOMAIN', 'sslip.io'),
    scheme: env('LAB_PUBLIC_SCHEME', 'http'),
    dockerHostIp: env('LAB_DOCKER_HOST_IP', '10.10.10.1'),
    vmSshUser: env('LAB_VM_SSH_USER', 'lab'),
    vmSshPort: envInt('LAB_VM_SSH_PORT', 22),
    useSecureTunnel: envBool('LAB_SECURE_TUNNEL', true),
    tunnelGatewayIp: env('LAB_TUNNEL_GATEWAY_IP', ''),
    tunnelTokenHours: envInt('LAB_TUNNEL_TOKEN_HOURS', 72),
  },

  billing: {
    graceDays: envInt('BILLING_GRACE_DAYS', 4),
    defaultBillingDay: envInt('BILLING_DEFAULT_DAY', 1),
  },

  staticVersion: env('STATIC_VERSION', readPackageVersion()),
};

if (config.isProd && config.jwt.secret === 'lab-dev-secret-change-in-production') {
  console.warn('[config] WARNING: Using default JWT_SECRET in production!');
}

export default config;
