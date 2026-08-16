import { PaymentRequiredError } from '../utils/errors.js';
import { getAccessStatus } from '../services/payment.service.js';

const BYPASS_ROLES = new Set(['owner', 'developer', 'teacher']);

export function requirePlatformAccess(req, _res, next) {
  if (!req.user) return next();

  const role = req.user.role || 'student';
  if (BYPASS_ROLES.has(role)) return next();

  const status = getAccessStatus(req.user.id);
  if (!status.access) {
    return next(new PaymentRequiredError('Доступ призупинено через прострочену оплату', status));
  }

  req.billingStatus = status;
  next();
}
