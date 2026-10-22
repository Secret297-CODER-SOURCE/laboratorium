import * as userService from '../services/user.service.js';
import * as passwordService from '../services/password.service.js';
import { signToken } from '../middleware/auth.js';
import config from '../config/index.js';
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

const googleFlows = new Map();
const googleGrants = new Map();
let googleKeys = null;
let googleKeysExpiresAt = 0;

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function safeLocalPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/portal.html';
  }
  const url = new URL(value, 'https://local.invalid');
  return url.origin === 'https://local.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/portal.html';
}

function cookieValue(req, name) {
  const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function setGoogleStateCookie(res, state, maxAge) {
  const secure = new URL(config.appUrl).protocol === 'https:';
  res.append('Set-Cookie', `lab_google_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

function pruneExpired(map) {
  const now = Date.now();
  for (const [key, value] of map) {
    if (value.expiresAt <= now) map.delete(key);
  }
}

async function fetchGoogleKeys() {
  if (googleKeys && googleKeysExpiresAt > Date.now()) return googleKeys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Could not load Google public keys');
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error('Invalid Google public keys');
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]) || 300;
  googleKeys = data.keys;
  googleKeysExpiresAt = Date.now() + Math.min(maxAge, 3600) * 1000;
  return googleKeys;
}

async function verifyGoogleIdToken(token, expectedNonce) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new UnauthorizedError('Google login could not be verified');
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    throw new UnauthorizedError('Google login could not be verified');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new UnauthorizedError('Google login could not be verified');
  }

  const keys = await fetchGoogleKeys();
  const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
  if (!jwk) throw new UnauthorizedError('Google login could not be verified');
  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url'),
  );
  const now = Math.floor(Date.now() / 1000);
  const audienceMatches = claims.aud === config.googleOAuth.clientId
    || (Array.isArray(claims.aud) && claims.aud.includes(config.googleOAuth.clientId));
  const nonceMatches = typeof claims.nonce === 'string'
    && claims.nonce.length === expectedNonce.length
    && timingSafeEqual(Buffer.from(claims.nonce), Buffer.from(expectedNonce));
  if (!valid || !audienceMatches
    || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    || claims.exp <= now || claims.iat > now + 60 || !nonceMatches
    || claims.email_verified !== true
    || typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    throw new UnauthorizedError('Google login could not be verified');
  }
  return claims;
}

export async function register(req, res) {
  if (!config.auth.allowPublicRegistration) {
    throw new ForbiddenError('Реєстрація закрита. Доступ надається після оплати.');
  }
  // No token/session here: the account's login+password are generated and
  // emailed, not chosen by the registrant, so there's nothing to log them
  // in with yet — they sign in themselves once they have that email.
  const { emailSent, mailReason } = await userService.register(req.body);
  res.status(201).json({
    ok: true,
    emailSent,
    mailReason,
    message: emailSent
      ? 'Реєстрацію прийнято! Перевірте пошту — ми надіслали логін і пароль для входу.'
      : 'Акаунт створено, але лист не надійшов. Зверніться до адміністрації, щоб отримати доступ.',
  });
}

export async function login(req, res) {
  const user = userService.login(req.body);
  const token = signToken(user);
  res.json({ token, user: userService.toPublic(user) });
}

export async function googleAuthStatus(_req, res) {
  res.json({ enabled: !!(config.googleOAuth.clientId && config.googleOAuth.clientSecret) });
}

export async function startGoogleAuth(req, res) {
  const { clientId, clientSecret, redirectUri } = config.googleOAuth;
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: 'Google OAuth is not configured' });
  }

  pruneExpired(googleFlows);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const flow = {
    nonce,
    verifier,
    next: safeLocalPath(req.query.next),
    referralCode: /^[a-z0-9]{6,32}$/i.test(req.query.referral_code || '')
      ? String(req.query.referral_code).toUpperCase()
      : '',
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  googleFlows.set(state, flow);
  setGoogleStateCookie(res, state, 600);

  const challenge = createHashSha256(verifier);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  res.redirect(url.toString());
}

function createHashSha256(value) {
  return createHash('sha256').update(value).digest('base64url');
}

export async function completeGoogleCallback(req, res) {
  const queryState = String(req.query.state || '');
  const cookieState = cookieValue(req, 'lab_google_state');
  const flow = googleFlows.get(queryState);
  const secure = new URL(config.appUrl).protocol === 'https:';
  res.append('Set-Cookie', `lab_google_state=; HttpOnly; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=0${secure ? '; Secure' : ''}`);
  if (!queryState || !cookieState || cookieState !== queryState || !flow || flow.expiresAt <= Date.now() || !req.query.code) {
    if (flow) googleFlows.delete(queryState);
    return res.redirect('/login.html?google_error=1');
  }
  googleFlows.delete(queryState);

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: config.googleOAuth.clientId,
        client_secret: config.googleOAuth.clientSecret,
        redirect_uri: config.googleOAuth.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokens = await response.json();
    if (!response.ok || typeof tokens.id_token !== 'string') {
      throw new UnauthorizedError('Google login could not be verified');
    }
    const claims = await verifyGoogleIdToken(tokens.id_token, flow.nonce);
    const user = userService.loginWithGoogle({
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified,
      name: claims.name,
      referralCode: flow.referralCode,
    });
    const code = randomToken();
    pruneExpired(googleGrants);
    googleGrants.set(code, {
      token: signToken(user),
      user: userService.toPublic(user),
      next: flow.next,
      expiresAt: Date.now() + 60 * 1000,
    });
    res.redirect(`/login.html?google_code=${encodeURIComponent(code)}&next=${encodeURIComponent(flow.next)}`);
  } catch (err) {
    console.error('[auth] Google OAuth failed:', err.message);
    res.redirect('/login.html?google_error=1');
  }
}

export async function completeGoogleLogin(req, res) {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const grant = googleGrants.get(code);
  googleGrants.delete(code);
  if (!grant || grant.expiresAt <= Date.now()) {
    throw new UnauthorizedError('Сеанс Google-входу завершився. Спробуйте ще раз.');
  }
  res.json({ token: grant.token, user: grant.user, next: grant.next });
}

export async function me(req, res) {
  const user = userService.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
  res.json({ user: userService.toPublic(user) });
}

export async function forgotPassword(req, res) {
  const result = await passwordService.requestPasswordReset(req.body.email);
  res.json(result);
}

export async function resetPassword(req, res) {
  await passwordService.resetPassword(req.body.token, req.body.password);
  res.json({ ok: true, message: 'Пароль оновлено. Увійдіть з новим паролем.' });
}
