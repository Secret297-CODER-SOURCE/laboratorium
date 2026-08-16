import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import * as apiCtrl from '../controllers/api.controller.js';

const router = Router();

router.get('/health', asyncHandler(apiCtrl.health));
router.get('/leaderboard', asyncHandler(apiCtrl.getLeaderboard));
router.get('/site-info', asyncHandler(apiCtrl.getSiteInfo));
router.get('/qr', asyncHandler(apiCtrl.getSiteQr));
router.get('/directions', asyncHandler(apiCtrl.getDirections));
router.post('/applications', optionalAuth, asyncHandler(apiCtrl.submitApplication));

export default router;
