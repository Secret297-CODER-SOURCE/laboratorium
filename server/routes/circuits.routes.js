import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import * as ctrl from '../controllers/circuits.controller.js';

const router = Router();

router.use(authRequired);

router.get('/info', asyncHandler(ctrl.getInfo));
router.get('/projects', asyncHandler(ctrl.list));
router.post('/projects', asyncHandler(ctrl.create));
router.get('/projects/:id', asyncHandler(ctrl.getOne));
router.put('/projects/:id', asyncHandler(ctrl.update));
router.delete('/projects/:id', asyncHandler(ctrl.remove));
router.get('/projects/:id/diagnose', asyncHandler(ctrl.diagnose));

export default router;
