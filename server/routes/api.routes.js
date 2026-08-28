import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { requirePlatformAccess } from '../middleware/platform-access.js';
import { requireTab } from '../middleware/tab-access.js';
import { uploadTaskSubmission } from '../middleware/upload.js';
import * as apiCtrl from '../controllers/api.controller.js';

const router = Router();

router.use(authRequired);

router.get('/billing/status', asyncHandler(apiCtrl.getBillingStatus));

router.use(requirePlatformAccess);

router.get('/programs', asyncHandler(apiCtrl.getPrograms));

router.get('/dashboard', asyncHandler(apiCtrl.getDashboard));
router.get('/tab-access', asyncHandler(apiCtrl.getTabAccess));
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

router.get('/content/:type/:id', asyncHandler(apiCtrl.getContentView));

router.get('/schedule', asyncHandler(apiCtrl.getStudentSchedule));
router.post('/schedule/lessons/:lessonId/absence', asyncHandler(apiCtrl.reportAbsence));

router.get('/quizzes', requireTab('dash.tests'), asyncHandler(apiCtrl.listQuizzes));
router.get('/quizzes/:id', requireTab('dash.tests'), asyncHandler(apiCtrl.getQuiz));
router.post('/quizzes/:id/start', requireTab('dash.tests'), asyncHandler(apiCtrl.startQuiz));
router.post('/quizzes/:id/submit', requireTab('dash.tests'), asyncHandler(apiCtrl.submitQuiz));

export default router;
