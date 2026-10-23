import crypto from 'node:crypto';
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, requireUnrestricted } from '../middleware/auth.js';
import { requirePlatformAccess } from '../middleware/platform-access.js';
import { requireTab } from '../middleware/tab-access.js';
import { uploadTaskSubmission } from '../middleware/upload.js';
import * as apiCtrl from '../controllers/api.controller.js';
import * as notificationCtrl from '../controllers/notification.controller.js';
import * as contentCtrl from '../controllers/content.controller.js';
import * as calendarCtrl from '../controllers/calendar.controller.js';

const router = Router();

router.use(authRequired);

router.get('/ice-servers', (req, res) => {
  const host = process.env.TURN_HOST;
  const secret = process.env.TURN_SECRET;

  if (!host || !secret) {
    return res.status(503).json({ error: 'TURN not configured' });
  }

  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const username = `${expiry}:${req.user.id}`;
  const credential = crypto
    .createHmac('sha1', secret)
    .update(username)
    .digest('base64');

  return res.json({
    iceServers: [
      { urls: `stun:${host}:3478` },
      {
        urls: [
          `turn:${host}:3478?transport=udp`,
          `turn:${host}:3478?transport=tcp`,
        ],
        username,
        credential,
      },
    ],
  });
});


router.get('/billing/status', asyncHandler(apiCtrl.getBillingStatus));

// Notifications stay reachable even with suspended billing access — a student
// whose access is blocked still needs to see *why* (e.g. a billing_due
// notification), so this must not sit behind requirePlatformAccess below.
router.get('/notifications', asyncHandler(notificationCtrl.listNotifications));
router.get('/notifications/unread-count', asyncHandler(notificationCtrl.getUnreadCount));
router.post('/notifications/read-all', asyncHandler(notificationCtrl.markAllRead));
router.post('/notifications/:id/read', asyncHandler(notificationCtrl.markRead));
router.delete('/notifications/:id', asyncHandler(notificationCtrl.deleteNotification));
router.get('/notifications/push/public-key', asyncHandler(notificationCtrl.getPushPublicKey));
router.post('/notifications/push/subscribe', asyncHandler(notificationCtrl.subscribePush));
router.post('/notifications/push/unsubscribe', asyncHandler(notificationCtrl.unsubscribePush));

router.get('/support/threads', asyncHandler(apiCtrl.listMySupportThreads));
router.post('/support/threads', asyncHandler(apiCtrl.createSupportThread));
router.get('/support/threads/:id(\\d+)', asyncHandler(apiCtrl.getMySupportThread));
router.post('/support/threads/:id(\\d+)/replies', asyncHandler(apiCtrl.replyToSupportThread));

router.use(requirePlatformAccess);

// Restricted (self-registered, not-yet-approved) accounts still need their
// own cabinet data and applications, so these three stay reachable ahead of
// the requireUnrestricted gate below — everything else is the "other tabs"
// a restricted student must not reach.
router.get('/dashboard', asyncHandler(apiCtrl.getDashboard));
router.get('/tab-access', asyncHandler(apiCtrl.getTabAccess));
router.get('/applications/mine', asyncHandler(apiCtrl.listMyApplications));
router.get('/referrals/me', asyncHandler(apiCtrl.getMyReferralSummary));
router.get('/students/:handle/profile', asyncHandler(apiCtrl.getStudentPublicProfile));

router.use(requireUnrestricted);

router.get('/programs', asyncHandler(apiCtrl.getPrograms));
router.post('/enroll', asyncHandler(apiCtrl.enroll));
router.patch('/profile', asyncHandler(apiCtrl.updateProfile));
router.post('/challenges/:id/complete', asyncHandler(apiCtrl.completeChallenge));
router.post('/challenges/:id/start', asyncHandler(apiCtrl.startChallenge));
router.patch('/enrollments/:id/progress', asyncHandler(apiCtrl.updateEnrollmentProgress));

router.get('/tasks', asyncHandler(apiCtrl.listTasks));
router.post('/tasks/:id/take', asyncHandler(apiCtrl.takeTask));
router.post('/tasks/:id/submit', (req, res, next) => {
  uploadTaskSubmission(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, asyncHandler(apiCtrl.submitTask));

router.get('/articles', requireTab('dash.article'), asyncHandler(apiCtrl.listArticles));
router.post('/articles', requireTab('dash.article'), asyncHandler(apiCtrl.createArticle));
router.patch('/articles/:id', requireTab('dash.article'), asyncHandler(apiCtrl.updateArticle));
router.post('/articles/:id/submit', requireTab('dash.article'), asyncHandler(apiCtrl.submitArticle));

router.get('/manuals', asyncHandler(apiCtrl.listManuals));
router.get('/manuals/mine', requireTab('dash.manuals'), asyncHandler(apiCtrl.listMyManuals));
router.post('/manuals', requireTab('dash.manuals'), asyncHandler(apiCtrl.createManual));
router.get('/manuals/:id(\\d+)', asyncHandler(apiCtrl.getManualForActor));
router.patch('/manuals/:id(\\d+)', requireTab('dash.manuals'), asyncHandler(apiCtrl.updateManual));
router.delete('/manuals/:id(\\d+)', requireTab('dash.manuals'), asyncHandler(apiCtrl.deleteManual));
router.post('/manuals/:id(\\d+)/submit', requireTab('dash.manuals'), asyncHandler(apiCtrl.submitManualForReview));
router.get('/manuals/:id(\\d+)/comments', asyncHandler(apiCtrl.listManualComments));
router.post('/manuals/:id(\\d+)/comments', asyncHandler(apiCtrl.createManualComment));
router.delete('/manual-comments/:commentId(\\d+)', asyncHandler(apiCtrl.deleteManualComment));
router.get('/manuals/:slug', asyncHandler(apiCtrl.getManualBySlug));

router.get('/content/:type/:id', asyncHandler(apiCtrl.getContentView));
router.get('/content/:type/:id/editor', asyncHandler(contentCtrl.getContentEditor));
router.put('/content/:type/:id', asyncHandler(contentCtrl.saveContent));

router.get('/schedule', asyncHandler(apiCtrl.getStudentSchedule));
router.get('/calendar/events', asyncHandler(calendarCtrl.listStudentEvents));
router.post('/schedule/lessons/:lessonId/absence', asyncHandler(apiCtrl.reportAbsence));

router.get('/quizzes', requireTab('dash.tests'), asyncHandler(apiCtrl.listQuizzes));
router.get('/quizzes/:id', requireTab('dash.tests'), asyncHandler(apiCtrl.getQuiz));
router.post('/quizzes/:id/start', requireTab('dash.tests'), asyncHandler(apiCtrl.startQuiz));
router.post('/quizzes/:id/submit', requireTab('dash.tests'), asyncHandler(apiCtrl.submitQuiz));

export default router;
