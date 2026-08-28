import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as apiCtrl from '../controllers/api.controller.js';

const router = Router();

router.get('/sitemap.xml', asyncHandler(apiCtrl.getSitemap));

export default router;
