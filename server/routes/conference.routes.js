import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { requirePlatformAccess } from '../middleware/platform-access.js';
import { requireTab } from '../middleware/tab-access.js';
import * as confCtrl from '../controllers/conference.controller.js';

const router = Router();

router.use(authRequired);
router.use(requirePlatformAccess);
router.use(requireTab('page.conferences'));

router.get('/', asyncHandler(confCtrl.list));
router.get('/schedule', asyncHandler(confCtrl.schedule));
router.get('/upcoming', asyncHandler(confCtrl.upcoming));
router.post('/', asyncHandler(confCtrl.create));
router.get('/code/:code', asyncHandler(confCtrl.getByCode));
router.get('/:id', asyncHandler(confCtrl.getById));
router.post('/:id/join', asyncHandler(confCtrl.join));
router.post('/:id/start', asyncHandler(confCtrl.start));
router.post('/:id/end', asyncHandler(confCtrl.end));
router.post('/:id/cancel', asyncHandler(confCtrl.cancel));
router.get('/:id/messages', asyncHandler(confCtrl.getMessages));

export default router;
