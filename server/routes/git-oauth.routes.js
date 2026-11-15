import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import * as ctrl from '../controllers/git-oauth.controller.js';

const router = Router();

router.get('/accounts', authRequired, asyncHandler(ctrl.listAccounts));
router.get('/:provider/start', authRequired, asyncHandler(ctrl.start));
router.get('/:provider/callback', asyncHandler(ctrl.callback));
router.delete('/:provider', authRequired, asyncHandler(ctrl.unlink));

export default router;
