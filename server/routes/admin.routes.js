import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import * as adminCtrl from '../controllers/admin.controller.js';
import * as contentCtrl from '../controllers/content.controller.js';
import * as scheduleCtrl from '../controllers/schedule.controller.js';
import * as learningCtrl from '../controllers/learning.controller.js';
import * as storageCtrl from '../controllers/storage.controller.js';
import * as statsCtrl from '../controllers/stats.controller.js';
import { uploadCtfAttachment } from '../middleware/upload.js';

const router = Router();

router.use(authRequired);
router.use(requireRole('teacher', 'owner', 'developer'));

router.get('/overview', asyncHandler(adminCtrl.getOverview));
router.get('/users', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listUsers));
router.post('/users', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createUser));
router.patch('/users/:id/role', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateUserRole));
router.post('/users/:id/send-reset', requireRole('owner', 'developer'), asyncHandler(adminCtrl.sendUserPasswordReset));
router.post('/users/:id/send-password', requireRole('owner', 'developer'), asyncHandler(adminCtrl.sendUserNewPassword));

router.get('/applications', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listApplications));
router.patch('/applications/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateApplication));

router.get('/directions', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listDirections));
router.post('/directions', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createDirection));
router.patch('/directions/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateDirection));
router.delete('/directions/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteDirection));

router.get('/programs', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listPrograms));
router.post('/programs', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createProgram));
router.patch('/programs/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateProgram));
router.delete('/programs/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteProgram));

router.get('/groups', asyncHandler(adminCtrl.listGroups));
router.post('/groups', asyncHandler(adminCtrl.createGroup));
router.patch('/groups/:id', asyncHandler(adminCtrl.updateGroup));
router.delete('/groups/:id', asyncHandler(adminCtrl.deleteGroup));
router.get('/groups/:id/members', asyncHandler(adminCtrl.listGroupMembers));
router.post('/groups/:id/members', asyncHandler(adminCtrl.addGroupMembers));
router.delete('/groups/:id/members/:userId', asyncHandler(adminCtrl.removeGroupMember));
router.patch('/groups/:id/members/:userId/role', asyncHandler(adminCtrl.updateGroupMemberRole));
router.get('/students/available', asyncHandler(adminCtrl.listAvailableStudents));

router.get('/tasks', asyncHandler(adminCtrl.listTasks));
router.post('/tasks', asyncHandler(adminCtrl.createTask));
router.delete('/tasks/:id', asyncHandler(adminCtrl.deleteTask));
router.post('/tasks/assignments/:id/approve', asyncHandler(adminCtrl.approveTask));
router.post('/tasks/assignments/:id/reject', asyncHandler(adminCtrl.rejectTask));
router.get('/articles', asyncHandler(adminCtrl.listArticles));

router.post('/announcements', asyncHandler(adminCtrl.createAnnouncement));

router.get('/schedule/lessons', asyncHandler(scheduleCtrl.listLessons));
router.post('/schedule/lessons', asyncHandler(scheduleCtrl.createLesson));
router.patch('/schedule/lessons/:id', asyncHandler(scheduleCtrl.updateLesson));
router.delete('/schedule/lessons/:id', asyncHandler(scheduleCtrl.deleteLesson));
router.get('/schedule/absences', asyncHandler(scheduleCtrl.listAbsences));
router.post('/schedule/absences/:id/acknowledge', asyncHandler(scheduleCtrl.acknowledgeAbsence));
router.get('/schedule/stats', asyncHandler(scheduleCtrl.getStats));

router.get('/quizzes', asyncHandler(learningCtrl.listQuizzes));
router.post('/quizzes', asyncHandler(learningCtrl.createQuiz));
router.delete('/quizzes/:id', asyncHandler(learningCtrl.deleteQuiz));

router.get('/stats', asyncHandler(statsCtrl.getStatsOverview));
router.get('/stats/students/:id', asyncHandler(statsCtrl.getStudentStats));
router.get('/stats/tasks/:id', asyncHandler(statsCtrl.getTaskStats));
router.get('/stats/quizzes/:id', asyncHandler(statsCtrl.getQuizStats));

router.get('/storage', requireRole('owner', 'developer'), asyncHandler(storageCtrl.getStorageOverview));
router.post('/storage/servers', requireRole('owner', 'developer'), asyncHandler(storageCtrl.createStorageServer));
router.patch('/storage/servers/:id', requireRole('owner', 'developer'), asyncHandler(storageCtrl.updateStorageServer));
router.delete('/storage/servers/:id', requireRole('owner', 'developer'), asyncHandler(storageCtrl.deleteStorageServer));
router.get('/storage/assets', requireRole('owner', 'developer'), asyncHandler(storageCtrl.listStorageAssets));
router.post('/storage/move', requireRole('owner', 'developer'), asyncHandler(storageCtrl.moveStorageAssets));
router.post('/storage/sync', requireRole('owner', 'developer'), asyncHandler(storageCtrl.syncStorage));

router.get('/challenges', asyncHandler(learningCtrl.listChallenges));
router.get('/challenges/:id/stages', asyncHandler(learningCtrl.getChallengeStages));
router.post('/challenges', asyncHandler(learningCtrl.createChallenge));
router.patch('/challenges/:id', asyncHandler(learningCtrl.updateChallenge));
router.delete('/challenges/:id', asyncHandler(learningCtrl.deleteChallenge));

router.post('/challenges/:id/stages/:stageId/attachments', (req, res, next) => {
  uploadCtfAttachment(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, asyncHandler(learningCtrl.uploadStageAttachment));
router.get('/challenges/:id/stages/:stageId/attachments/:attachmentId', asyncHandler(learningCtrl.downloadStageAttachmentAdmin));
router.delete('/challenges/:id/stages/:stageId/attachments/:attachmentId', asyncHandler(learningCtrl.deleteStageAttachment));

router.get('/settings/lab-public', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getLabPublicSettings));
router.patch('/settings/lab-public', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateLabPublicSettings));

router.get('/settings/smtp', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getSmtpSettings));
router.patch('/settings/smtp', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateSmtpSettings));
router.post('/settings/smtp/test', requireRole('owner', 'developer'), asyncHandler(adminCtrl.testSmtpSettings));

router.get('/settings/proxmox', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getProxmoxSettings));
router.patch('/settings/proxmox', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateProxmoxSettings));
router.post('/settings/proxmox/provision-missing', requireRole('owner', 'developer'), asyncHandler(adminCtrl.provisionMissingLabs));

router.get('/labs', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listLabs));
router.post('/labs/:userId/start', requireRole('owner', 'developer'), asyncHandler(adminCtrl.adminStartVm));
router.post('/labs/:userId/stop', requireRole('owner', 'developer'), asyncHandler(adminCtrl.adminStopVm));
router.post('/labs/:userId/reset', requireRole('owner', 'developer'), asyncHandler(adminCtrl.adminResetVm));
router.delete('/labs/:userId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.adminDeleteVm));
router.post('/labs/:userId/transfer', requireRole('owner', 'developer'), asyncHandler(adminCtrl.adminTransferVm));
router.post('/labs/:userId/link', requireRole('owner', 'developer'), asyncHandler(adminCtrl.adminLinkVm));
router.get('/labs/:userId/backups', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listVmBackups));
router.post('/labs/:userId/backups', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createVmBackup));
router.post('/labs/:userId/backups/:backupId/restore', requireRole('owner', 'developer'), asyncHandler(adminCtrl.restoreVmBackup));
router.delete('/labs/:userId/backups/:backupId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteVmBackup));

router.get('/labs/:userId/docker/:deployId/backups', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listDockerBackups));
router.post('/labs/:userId/docker/:deployId/backups', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createDockerBackup));
router.post('/labs/:userId/docker/backups/:backupId/restore', requireRole('owner', 'developer'), asyncHandler(adminCtrl.restoreDockerBackup));
router.delete('/labs/:userId/docker/backups/:backupId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteDockerBackup));

router.get('/settings/tab-access', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getTabAccessSettings));
router.patch('/settings/tab-access', requireRole('owner', 'developer'), asyncHandler(adminCtrl.saveTabAccessSettings));

router.get('/billing', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getBillingOverview));
router.post('/billing/users/:userId/payments', requireRole('owner', 'developer'), asyncHandler(adminCtrl.recordBillingPayment));
router.patch('/billing/users/:userId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateBillingUser));
router.delete('/billing/payments/:paymentId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteBillingPayment));

router.get('/content/:type/:id', asyncHandler(contentCtrl.getContentEditor));
router.put('/content/:type/:id', asyncHandler(contentCtrl.saveContent));
router.get('/content/:type/:id/status', asyncHandler(contentCtrl.getContentStatus));

export default router;
