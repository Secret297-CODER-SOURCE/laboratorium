import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import db from '../db/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'student' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

/**
 * A frozen account keeps its data but must not be usable — checked per
 * request (not baked into the JWT) so freezing takes effect immediately
 * against tokens already issued, without a revocation list. is_restricted
 * (self-registered, not yet approved) is read the same way for the same
 * reason: an admin's approval must take effect on the student's existing
 * session, not just on their next login.
 */
function loadAccessFlags(userId) {
  const row = db.prepare('SELECT is_frozen, is_restricted FROM users WHERE id = ?').get(userId);
  if (row?.is_frozen) {
    throw new ForbiddenError('Акаунт заморожено. Зверніться до адміністрації.');
  }
  return row;
}

export function authRequired(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError());
  }
  try {
    req.user = jwt.verify(header.slice(7), config.jwt.secret);
    const flags = loadAccessFlags(req.user.id);
    req.user.isRestricted = !!flags?.is_restricted;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return next(err);
    next(new UnauthorizedError('Сесію закінчено, увійдіть знову'));
  }
}

/** Self-registered accounts stay locked to the application-only cabinet
 * view until an admin approves their course application. */
export function requireUnrestricted(req, _res, next) {
  if (req.user?.isRestricted) {
    return next(new ForbiddenError('Доступ буде відкрито після підтвердження заявки.'));
  }
  next();
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), config.jwt.secret);
    } catch { /* guest */ }
  }
  next();
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    const role = req.user.role || 'student';
    if (!roles.includes(role)) {
      return next(new ForbiddenError('Недостатньо прав доступу'));
    }
    next();
  };
}
