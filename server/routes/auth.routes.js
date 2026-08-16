import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import * as authCtrl from '../controllers/auth.controller.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато спроб, спробуйте пізніше', code: 'RATE_LIMIT' },
});

router.post('/register', authLimiter, asyncHandler(authCtrl.register));
router.post('/login', authLimiter, asyncHandler(authCtrl.login));
router.post('/forgot-password', authLimiter, asyncHandler(authCtrl.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(authCtrl.resetPassword));
router.get('/status', (_req, res) => {
  res.json({ ok: true, version: 2, publicAuth: true });
});
router.get('/me', authRequired, asyncHandler(authCtrl.me));

export default router;
