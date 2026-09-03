import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import * as codeCtrl from '../controllers/code.controller.js';

const router = Router();

router.use(authRequired);

router.get('/info', asyncHandler(codeCtrl.getSandboxInfo));
router.get('/workspaces', asyncHandler(codeCtrl.listWorkspaces));
router.post('/workspaces', asyncHandler(codeCtrl.createWorkspace));
router.get('/workspaces/:id', asyncHandler(codeCtrl.getWorkspace));
router.put('/workspaces/:id/files', asyncHandler(codeCtrl.saveWorkspaceFiles));
router.delete('/workspaces/:id', asyncHandler(codeCtrl.deleteWorkspace));
router.post('/workspaces/:id/run', asyncHandler(codeCtrl.runWorkspace));
router.post('/workspaces/:id/run-web', asyncHandler(codeCtrl.runWorkspaceWeb));
router.post('/workspaces/:id/stop-web', asyncHandler(codeCtrl.stopWorkspaceWeb));

export default router;
