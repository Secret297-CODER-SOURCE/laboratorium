import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as demoCtrl from '../controllers/ctf-demo.controller.js';

const router = Router();
const form = express.urlencoded({ extended: false });

router.get('/nmap-scan/scan', asyncHandler(demoCtrl.nmapScan));
router.post('/sql-injection/login', form, asyncHandler(demoCtrl.sqliLogin));
router.post('/xss-stored/comment', form, asyncHandler(demoCtrl.xssComment));
router.get('/xss-stored/admin', asyncHandler(demoCtrl.xssAdmin));
router.post('/buffer-overflow/overflow', form, asyncHandler(demoCtrl.bufferOverflow));
router.get('/malware-static/download', asyncHandler(demoCtrl.malwareDownload));
router.post('/python-port-scanner/scan', form, asyncHandler(demoCtrl.portScanner));
router.post('/ghidra-crackme/check', form, asyncHandler(demoCtrl.crackmeCheck));
router.post('/priv-esc-linux/escalate', form, asyncHandler(demoCtrl.privEsc));

router.get('/:slug', asyncHandler(demoCtrl.renderDemoPage));

export default router;
