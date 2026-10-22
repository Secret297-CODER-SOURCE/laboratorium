import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import * as apiCtrl from '../controllers/api.controller.js';

const router = Router();

const clientErrorLimiter = rateLimit({
  skip: () => config.rateLimit.disabled,
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  // Silently drop over-limit reports instead of surfacing a 429 — a broken
  // page shouldn't also spam its own console with reporting failures.
  handler: (_req, res) => res.status(204).end(),
});

router.get('/health', asyncHandler(apiCtrl.health));
router.get('/leaderboard', asyncHandler(apiCtrl.getLeaderboard));
router.get('/site-info', asyncHandler(apiCtrl.getSiteInfo));
router.get('/qr', asyncHandler(apiCtrl.getSiteQr));
router.get('/directions', asyncHandler(apiCtrl.getDirections));
router.get('/programs/:id/page', asyncHandler(apiCtrl.getPublicProgramPage));
router.post('/applications', optionalAuth, asyncHandler(apiCtrl.submitApplication));
router.post('/analytics/events', optionalAuth, asyncHandler(apiCtrl.recordAnalyticsEvent));
router.post('/client-error', clientErrorLimiter, optionalAuth, asyncHandler(apiCtrl.reportClientError));

export default router;
