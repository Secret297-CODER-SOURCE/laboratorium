import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { requirePlatformAccess } from '../middleware/platform-access.js';
import { requireTab } from '../middleware/tab-access.js';
import { uploadRecording } from '../middleware/upload.js';
import * as recCtrl from '../controllers/recording.controller.js';

const router = Router();

router.use(authRequired);
router.use(requirePlatformAccess);
router.use(requireTab('page.recordings'));

router.get('/', asyncHandler(recCtrl.list));
router.post('/upload', (req, res, next) => {
  uploadRecording(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, asyncHandler(recCtrl.upload));

router.get('/:id', asyncHandler(recCtrl.getById));
router.get('/:id/stream', asyncHandler(recCtrl.stream));
router.delete('/:id', asyncHandler(recCtrl.remove));

router.get('/:id/notes', asyncHandler(recCtrl.getNotes));
router.post('/:id/notes', asyncHandler(recCtrl.addNote));
router.patch('/:id/notes/:noteId', asyncHandler(recCtrl.updateNote));
router.delete('/:id/notes/:noteId', asyncHandler(recCtrl.deleteNote));

export default router;
