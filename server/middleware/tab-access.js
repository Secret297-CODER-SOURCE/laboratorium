import { assertAnyTabAccess, assertTabAccess } from '../services/tab-access.service.js';

export function requireTab(tabKey) {
  return (req, _res, next) => {
    try {
      assertTabAccess(req.user, tabKey);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAnyTab(...tabKeys) {
  return (req, _res, next) => {
    try {
      assertAnyTabAccess(req.user, tabKeys);
      next();
    } catch (err) {
      next(err);
    }
  };
}
