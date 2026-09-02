import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { requirePlatformAccess } from '../middleware/platform-access.js';
import { requireTab } from '../middleware/tab-access.js';
import * as labCtrl from '../controllers/lab.controller.js';

const router = Router();

router.use(authRequired);
router.use(requirePlatformAccess);

router.get('/', requireTab('dash.lab'), asyncHandler(labCtrl.getLabOverview));
router.post('/vm/start', requireTab('dash.lab'), asyncHandler(labCtrl.startVm));
router.post('/vm/stop', requireTab('dash.lab'), asyncHandler(labCtrl.stopVm));
router.post('/vm/reset', requireTab('dash.lab'), asyncHandler(labCtrl.resetVm));
router.get('/vm/system', requireTab('dash.lab'), asyncHandler(labCtrl.getVmSystem));
router.get('/vm/files', requireTab('dash.lab'), asyncHandler(labCtrl.listVmFiles));
router.get('/vm/file', requireTab('dash.lab'), asyncHandler(labCtrl.readVmFile));
router.put('/vm/file', requireTab('dash.lab'), asyncHandler(labCtrl.writeVmFile));
router.get('/vm/ports', requireTab('dash.lab'), asyncHandler(labCtrl.listVmPorts));
router.post('/vm/ports', requireTab('dash.lab'), asyncHandler(labCtrl.addVmPort));
router.delete('/vm/ports/:id', requireTab('dash.lab'), asyncHandler(labCtrl.removeVmPort));

router.post('/docker/deploy', requireTab('dash.lab'), asyncHandler(labCtrl.deployDocker));
router.post('/docker/:id/stop', requireTab('dash.lab'), asyncHandler(labCtrl.stopDocker));

router.get('/ctf', requireTab('dash.ctf'), asyncHandler(labCtrl.listCtf));
router.get('/ctf/activity', requireTab('dash.ctf'), asyncHandler(labCtrl.getCtfActivity));
router.post('/ctf/:id/start', requireTab('dash.ctf'), asyncHandler(labCtrl.startCtf));
router.post('/ctf/:id/stop', requireTab('dash.ctf'), asyncHandler(labCtrl.stopCtf));
router.post('/ctf/:id/flag', requireTab('dash.ctf'), asyncHandler(labCtrl.submitFlag));
router.post('/ctf/:id/hint/:stageId', requireTab('dash.ctf'), asyncHandler(labCtrl.unlockHint));

export default router;
