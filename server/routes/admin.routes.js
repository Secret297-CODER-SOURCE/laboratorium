import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import * as adminCtrl from '../controllers/admin.controller.js';
import * as contentCtrl from '../controllers/content.controller.js';
import * as scheduleCtrl from '../controllers/schedule.controller.js';
import * as learningCtrl from '../controllers/learning.controller.js';
import * as storageCtrl from '../controllers/storage.controller.js';
import * as statsCtrl from '../controllers/stats.controller.js';
import * as attendanceCtrl from '../controllers/attendance.controller.js';
import * as calendarCtrl from '../controllers/calendar.controller.js';
import { uploadCtfAttachment } from '../middleware/upload.js';
import * as crmCtrl from '../controllers/crm.controller.js';
import * as plannerCtrl from '../controllers/planner.controller.js';
import * as telegramCtrl from '../controllers/telegram.controller.js';
import * as homeworkReminderCtrl from '../controllers/homework-reminder.controller.js';

const router = Router();

router.use(authRequired);
router.use(requireRole('teacher', 'owner', 'developer'));

router.get('/overview', asyncHandler(adminCtrl.getOverview));
router.get('/users', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listUsers));
router.post('/users', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createUser));
router.patch('/users/:id/role', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateUserRole));
router.patch('/users/:id/freeze', requireRole('owner', 'developer'), asyncHandler(adminCtrl.freezeUser));
router.patch('/users/:id/restrict', requireRole('owner', 'developer'), asyncHandler(adminCtrl.restrictUser));
router.delete('/users/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteUser));
router.post('/users/:id/send-reset', requireRole('owner', 'developer'), asyncHandler(adminCtrl.sendUserPasswordReset));
router.post('/users/:id/send-password', requireRole('owner', 'developer'), asyncHandler(adminCtrl.sendUserNewPassword));

router.get('/applications', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listApplications));
router.patch('/applications/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateApplication));

router.get('/crm/board', requireRole('owner', 'developer'), asyncHandler(crmCtrl.getBoard));
router.get('/crm/companies', requireRole('owner', 'developer'), asyncHandler(crmCtrl.listCompanies));
router.post('/crm/companies', requireRole('owner', 'developer'), asyncHandler(crmCtrl.createCompany));
router.patch('/crm/companies/:id', requireRole('owner', 'developer'), asyncHandler(crmCtrl.updateCompany));
router.get('/crm/contacts', requireRole('owner', 'developer'), asyncHandler(crmCtrl.listContacts));
router.post('/crm/contacts', requireRole('owner', 'developer'), asyncHandler(crmCtrl.createContact));
router.patch('/crm/contacts/:id', requireRole('owner', 'developer'), asyncHandler(crmCtrl.updateContact));
router.post('/crm/opportunities', requireRole('owner', 'developer'), asyncHandler(crmCtrl.createOpportunity));
router.get('/crm/opportunities/:id', requireRole('owner', 'developer'), asyncHandler(crmCtrl.getOpportunity));
router.patch('/crm/opportunities/:id', requireRole('owner', 'developer'), asyncHandler(crmCtrl.updateOpportunity));
router.get('/crm/activities', requireRole('owner', 'developer'), asyncHandler(crmCtrl.listActivities));
router.post('/crm/activities', requireRole('owner', 'developer'), asyncHandler(crmCtrl.addActivity));

router.get('/messages', requireRole('owner'), asyncHandler(adminCtrl.listSupportThreads));
router.get('/messages/summary', requireRole('owner'), asyncHandler(adminCtrl.getSupportInboxSummary));
router.get('/messages/templates', requireRole('owner'), asyncHandler(adminCtrl.listSupportTemplates));
router.post('/messages/templates', requireRole('owner'), asyncHandler(adminCtrl.createSupportTemplate));
router.delete('/messages/templates/:id', requireRole('owner'), asyncHandler(adminCtrl.deleteSupportTemplate));
router.get('/messages/:id', requireRole('owner'), asyncHandler(adminCtrl.getSupportThread));
router.post('/messages/:id/replies', requireRole('owner'), asyncHandler(adminCtrl.replyToSupportThread));
router.patch('/messages/:id/status', requireRole('owner'), asyncHandler(adminCtrl.updateSupportThreadStatus));

router.get('/directions', asyncHandler(adminCtrl.listDirections));
router.post('/directions', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createDirection));
router.patch('/directions/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateDirection));
router.delete('/directions/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteDirection));

router.get('/programs', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listPrograms));
router.get('/programs/export', requireRole('owner', 'developer'), asyncHandler(adminCtrl.exportPrograms));
router.post('/programs/import', requireRole('owner', 'developer'), asyncHandler(adminCtrl.importPrograms));
router.post('/programs', requireRole('owner', 'developer'), asyncHandler(adminCtrl.createProgram));
router.patch('/programs/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateProgram));
router.delete('/programs/:id', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteProgram));

router.get('/manuals', asyncHandler(adminCtrl.listManuals));
router.post('/manuals', asyncHandler(adminCtrl.createManual));
router.patch('/manuals/:id', asyncHandler(adminCtrl.updateManual));
router.delete('/manuals/:id', asyncHandler(adminCtrl.deleteManual));
router.post('/manuals/:id/return', asyncHandler(adminCtrl.returnManualToDraft));

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
router.get('/calendar/events', requireRole('owner', 'developer'), asyncHandler(calendarCtrl.listAdminEvents));
router.post('/calendar/events', requireRole('owner', 'developer'), asyncHandler(calendarCtrl.createEvent));
router.delete('/calendar/events/:id(\\d+)', requireRole('owner', 'developer'), asyncHandler(calendarCtrl.deleteEvent));
router.post('/calendar/ctftime/sync', requireRole('owner', 'developer'), asyncHandler(calendarCtrl.syncCtfEvents));

router.get('/quizzes', asyncHandler(learningCtrl.listQuizzes));
router.post('/quizzes', asyncHandler(learningCtrl.createQuiz));
router.delete('/quizzes/:id', asyncHandler(learningCtrl.deleteQuiz));

router.get('/attendance/groups/:groupId', asyncHandler(attendanceCtrl.getGroupOverview));
router.get('/attendance/conferences/:id', asyncHandler(attendanceCtrl.getConferenceAttendance));

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
router.get('/settings/access-policy', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getAccessPolicy));
router.patch('/settings/access-policy', requireRole('owner', 'developer'), asyncHandler(adminCtrl.saveAccessPolicy));
router.post('/settings/access-policy/reset', requireRole('owner', 'developer'), asyncHandler(adminCtrl.resetAccessPolicy));

router.get('/billing', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getBillingOverview));
router.post('/billing/users/:userId/payments', requireRole('owner', 'developer'), asyncHandler(adminCtrl.recordBillingPayment));
router.patch('/billing/users/:userId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.updateBillingUser));
router.delete('/billing/payments/:paymentId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.deleteBillingPayment));
router.get('/marketing', requireRole('owner'), asyncHandler(adminCtrl.getMarketingOverview));
router.get('/marketing/access-log', requireRole('owner'), asyncHandler(adminCtrl.getAccessLog));
router.get('/marketing/access-stats', requireRole('owner'), asyncHandler(adminCtrl.getAccessStats));
router.post('/marketing/campaigns', requireRole('owner'), asyncHandler(adminCtrl.createMarketingCampaign));
router.patch('/marketing/campaigns/:id', requireRole('owner'), asyncHandler(adminCtrl.updateMarketingCampaign));
router.patch('/marketing/referrals', requireRole('owner'), asyncHandler(adminCtrl.updateReferralSettings));
router.post('/marketing/referral-programs', requireRole('owner'), asyncHandler(adminCtrl.createReferralProgram));
router.patch('/marketing/referral-programs/:id', requireRole('owner'), asyncHandler(adminCtrl.updateReferralProgram));

router.get('/content/:type/:id/status', asyncHandler(contentCtrl.getContentStatus));

router.get('/errors', requireRole('owner', 'developer'), asyncHandler(adminCtrl.listErrors));
router.delete('/errors', requireRole('owner', 'developer'), asyncHandler(adminCtrl.clearErrors));

router.get('/people/:userId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.getPersonProfile));
router.post('/people/:userId/notes', requireRole('owner', 'developer'), asyncHandler(adminCtrl.addPersonNote));
router.delete('/people/:userId/notes/:noteId', requireRole('owner', 'developer'), asyncHandler(adminCtrl.removePersonNote));

router.get('/planner', requireRole('owner', 'developer', 'teacher'), asyncHandler(plannerCtrl.list));
router.post('/planner', requireRole('owner', 'developer', 'teacher'), asyncHandler(plannerCtrl.create));
router.patch('/planner/:id', requireRole('owner', 'developer', 'teacher'), asyncHandler(plannerCtrl.update));
router.delete('/planner/:id', requireRole('owner', 'developer', 'teacher'), asyncHandler(plannerCtrl.remove));

router.get('/homework-reminders', requireRole('owner', 'developer', 'teacher'), asyncHandler(homeworkReminderCtrl.getSettings));
router.patch('/homework-reminders', requireRole('owner', 'developer', 'teacher'), asyncHandler(homeworkReminderCtrl.saveSettings));

router.get('/telegram', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.getOverview));
router.get('/telegram/monitor', requireRole('owner', 'developer', 'teacher'), asyncHandler(telegramCtrl.getMonitor));
router.patch('/telegram/settings', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.updateSettings));
router.patch('/telegram/templates/:key', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.updateTemplate));
router.post('/telegram/auto-replies', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.addAutoReply));
router.post('/telegram/auto-replies/:id/disable', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.disableAutoReply));
router.post('/telegram/link-chat', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.linkChatUser));
router.post('/telegram/send-lead', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.sendLead));
router.post('/telegram/hw-group', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.sendHomeworkGroup));
router.post('/telegram/pay-ask', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.askPaymentReminders));
router.post('/telegram/reply', requireRole('owner', 'developer'), asyncHandler(telegramCtrl.sendReply));

export default router;
