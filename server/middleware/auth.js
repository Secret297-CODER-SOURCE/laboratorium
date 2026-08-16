import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'student' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

export function authRequired(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError());
  }
  try {
    req.user = jwt.verify(header.slice(7), config.jwt.secret);
    next();
  } catch {
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
