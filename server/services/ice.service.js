/**
 * ICE/TURN credentials for WebRTC rooms.
 * If private coturn is down / misconfigured, fall back to a public TURN so
 * screen-share and cross-network calls still work.
 */
import crypto from 'node:crypto';
import net from 'node:net';
import dns from 'node:dns/promises';

const REACHABILITY_TTL_MS = 60_000;
let reachabilityCache = { host: '', port: 0, ok: false, checkedAt: 0 };

/** Free Open Relay (Metered) — temporary/public fallback. */
export const PUBLIC_TURN_FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function normalizeTurnHost(raw) {
  let host = String(raw || '').trim();
  if (!host) return '';
  host = host.replace(/^turns?:\/\//i, '').replace(/^stuns?:\/\//i, '');
  host = host.split('/')[0].split('?')[0];
  // strip accidental :port from TURN_HOST (we add ports ourselves)
  if (host.includes(']') && host.startsWith('[')) {
    // ipv6 literal [addr]:port
    const end = host.indexOf(']');
    host = host.slice(0, end + 1);
  } else if ((host.match(/:/g) || []).length === 1) {
    host = host.split(':')[0];
  }
  return host;
}

function tcpReachable(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function isPrivateTurnReachable(host, port = 3478) {
  const now = Date.now();
  if (
    reachabilityCache.host === host
    && reachabilityCache.port === port
    && now - reachabilityCache.checkedAt < REACHABILITY_TTL_MS
  ) {
    return reachabilityCache.ok;
  }

  let ok = false;
  try {
    // Resolve first so we fail fast on bad DNS
    await dns.lookup(host);
    ok = await tcpReachable(host, port);
  } catch {
    ok = false;
  }
  reachabilityCache = { host, port, ok, checkedAt: now };
  return ok;
}

function buildPrivateIceServers(host, secret, userId) {
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const username = `${expiry}:${userId}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  const iceServers = [
    { urls: `stun:${host}:3478` },
    {
      urls: `turn:${host}:3478?transport=udp`,
      username,
      credential,
    },
  ];
  const tlsPort = Number.parseInt(process.env.TURN_TLS_PORT, 10);
  if (Number.isInteger(tlsPort) && tlsPort > 0 && tlsPort <= 65535) {
    iceServers.push({
      urls: `turns:${host}:${tlsPort}?transport=tcp`,
      username,
      credential,
    });
  } else {
    iceServers.push({
      urls: `turn:${host}:3478?transport=tcp`,
      username,
      credential,
    });
  }
  return iceServers;
}

/**
 * @returns {Promise<{ iceServers: object[], source: 'private'|'public-fallback', warning?: string }>}
 */
export async function getIceServersForUser(userId) {
  const host = normalizeTurnHost(process.env.TURN_HOST);
  const secret = String(process.env.TURN_SECRET || '').trim();
  const forcePublic = ['1', 'true', 'yes'].includes(String(process.env.TURN_FORCE_PUBLIC || '').toLowerCase());
  const allowFallback = !['0', 'false', 'no'].includes(String(process.env.TURN_PUBLIC_FALLBACK || 'true').toLowerCase());

  if (!forcePublic && host && secret) {
    const reachable = await isPrivateTurnReachable(host, 3478);
    if (reachable) {
      return {
        iceServers: buildPrivateIceServers(host, secret, userId),
        source: 'private',
      };
    }
    if (!allowFallback) {
      return {
        iceServers: buildPrivateIceServers(host, secret, userId),
        source: 'private',
        warning: `TURN host ${host}:3478 unreachable — clients may fail ICE`,
      };
    }
    console.warn(`[ice] Private TURN ${host}:3478 unreachable — using public fallback`);
    return {
      iceServers: PUBLIC_TURN_FALLBACK,
      source: 'public-fallback',
      warning: `Private TURN ${host}:3478 is down; using public relay`,
    };
  }

  if (allowFallback || forcePublic) {
    return {
      iceServers: PUBLIC_TURN_FALLBACK,
      source: 'public-fallback',
      warning: host && secret
        ? undefined
        : 'TURN_HOST/TURN_SECRET not set — using public relay',
    };
  }

  return {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    source: 'public-fallback',
    warning: 'No TURN configured',
  };
}
