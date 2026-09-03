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
 * against tokens already issued, without a revocation list.
 */
function assertNotFrozen(userId) {
  const row = db.prepare('SELECT is_frozen FROM users WHERE id = ?').get(userId);
  if (row?.is_frozen) {
    throw new ForbiddenError('Акаунт заморожено. Зверніться до адміністрації.');
  }
}

export function authRequired(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError());
  }
  try {
    req.user = jwt.verify(header.slice(7), config.jwt.secret);
    assertNotFrozen(req.user.id);
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return next(err);
    next(new UnauthorizedError('Сесію закінчено, увійдіть знову'));
  }
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
