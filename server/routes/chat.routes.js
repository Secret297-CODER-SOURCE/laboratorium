import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { requirePlatformAccess } from '../middleware/platform-access.js';
import { requireTab } from '../middleware/tab-access.js';
import { uploadChatMedia } from '../middleware/upload.js';
import * as chatCtrl from '../controllers/chat.controller.js';

const router = Router();

router.use(authRequired);
router.use(requirePlatformAccess);
router.use(requireTab('page.groups_chat'));

router.get('/inbox', asyncHandler(chatCtrl.getInbox));
router.get('/groups/mine', asyncHandler(chatCtrl.listMyGroups));
router.get('/groups/:groupId', asyncHandler(chatCtrl.getGroupChannel));
router.get('/groups/:groupId/ranking', asyncHandler(chatCtrl.getGroupRanking));
router.get('/groups/:groupId/dms', asyncHandler(chatCtrl.listGroupDms));
router.get('/channels/:id/messages', asyncHandler(chatCtrl.getMessages));
router.post('/channels/:id/messages', asyncHandler(chatCtrl.sendMessage));
router.post('/dm', asyncHandler(chatCtrl.createDm));
router.get('/dm/candidates', asyncHandler(chatCtrl.listDmCandidates));
router.post('/upload', (req, res, next) => {
  uploadChatMedia(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Помилка завантаження' });
    next();
  });
}, asyncHandler(chatCtrl.uploadMedia));

export default router;
