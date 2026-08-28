import { ping, getStats } from '../db/index.js';
import config from '../config/index.js';
import * as userService from '../services/user.service.js';
import * as programService from '../services/program.service.js';
import * as directionService from '../services/direction.service.js';
import * as challengeService from '../services/challenge.service.js';
import * as taskService from '../services/task.service.js';
import * as articleService from '../services/article.service.js';
import * as contentService from '../services/content.service.js';
import * as scheduleService from '../services/schedule.service.js';
import * as quizService from '../services/quiz.service.js';
import * as applicationService from '../services/application.service.js';
import * as tabAccessService from '../services/tab-access.service.js';
import * as paymentService from '../services/payment.service.js';
import { addBounty, getBountyLog, getUserRank } from '../services/bounty.service.js';
import { getTier, getNextTier } from '../utils/tier.js';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../utils/errors.js';
import QRCode from 'qrcode';

export async function health(_req, res) {
  ping();
  res.json({
    status: 'ok',
    service: 'laboratorium',
    version: '1.0.0',
    env: config.env,
    db: getStats(),
    uptime: Math.floor(process.uptime()),
  });
}

export async function getPrograms(_req, res) {
  res.json({ programs: programService.getAll() });
}

export async function getDirections(_req, res) {
  res.json({ directions: directionService.getPublicWithPrograms() });
}

export async function getLeaderboard(_req, res) {
  const users = applicationService.getLeaderboard();
  res.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1,
      handle: u.handle,
      name: u.name,
      bounty_points: u.bounty_points,
      tier: getTier(u.bounty_points).name,
    })),
  });
}

export async function getSiteQr(req, res) {
  const raw = String(req.query.url || config.siteUrl || 'https://laboratorium.club').trim();
  if (!/^https?:\/\//i.test(raw)) throw new ValidationError('Некоректне посилання для QR');
  const url = raw.slice(0, 500);
  const accent = String(req.query.color || '#00ff88').match(/^#[0-9a-fA-F]{6}$/)?.[0] || '#00ff88';
  const size = Math.min(Math.max(parseInt(req.query.size, 10) || 280, 120), 640);
  const wantsPng = req.query.format === 'png'
    || req.query.format !== 'svg' && !String(req.headers.accept || '').includes('image/svg');

  if (wantsPng) {
    const buf = await QRCode.toBuffer(url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: accent, light: '#0c0c0cff' },
    });
    res.set('Cache-Control', 'public, max-age=86400');
    return res.type('png').send(buf);
  }

  const svg = await QRCode.toString(url, {
    type: 'svg',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: accent, light: '#0c0c0cff' },
  });
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('svg').send(svg);
}

export async function getSiteInfo(_req, res) {
  res.set('Cache-Control', 'no-cache');
  res.json({
    siteUrl: config.siteUrl,
    contactEmail: config.contactEmail,
    appUrl: config.appUrl,
    staticVersion: config.staticVersion,
  });
}

export async function submitApplication(req, res) {
  await applicationService.create({
    ...req.body,
    userId: req.user?.id || null,
  });
  res.status(201).json({
    ok: true,
    message: 'Заявку прийнято. Ми зв\'яжемося з вами протягом 24 годин.',
  });
}

export async function getBillingStatus(req, res) {
  const status = paymentService.getAccessStatus(req.user.id);
  const payments = paymentService.listUserPayments(req.user.id, 12);
  res.json({ ...status, payments });
}

export async function getTabAccess(req, res) {
  res.json({
    allowed: tabAccessService.getAllowedTabs(req.user),
    denied: [...tabAccessService.getDeniedTabs(req.user)],
    tabs: tabAccessService.TAB_DEFINITIONS,
  });
}

export async function getDashboard(req, res) {
  const user = userService.findById(req.user.id);
  if (!user) throw new NotFoundError('Користувача не знайдено');

  const enrollments = programService.getEnrollments(req.user.id);
  const bountyLog = getBountyLog(req.user.id);
  const challenges = challengeService.getAllForUser(req.user.id);
  const completed = challenges.filter(c => c.completed).length;
  const tasks = taskService.listForStudent(req.user.id);
  const quizzes = quizService.listForStudent(req.user.id);
  const canWriteArticles = articleService.studentCanWriteArticles(req.user.id);
  const studentMemberRoles = articleService.getStudentMemberRoles(req.user.id);
  const articles = canWriteArticles ? articleService.listForUser(req.user.id) : [];

  res.json({
    user: userService.toPublic(user),
    rank: getUserRank(user.bounty_points),
    tier: getTier(user.bounty_points),
    nextTier: getNextTier(user.bounty_points),
    enrollments,
    bountyLog,
    challenges,
    tasks,
    quizzes,
    articles,
    canWriteArticles,
    studentMemberRoles,
    groupContent: contentService.listStudentGroupContent(req.user.id),
    stats: {
      programs_count: enrollments.length,
      challenges_completed: completed,
      challenges_total: challenges.length,
      tasks_available: tasks.filter(t => t.status === 'available').length,
      tasks_in_progress: tasks.filter(t => t.status === 'taken').length,
      tasks_review: tasks.filter(t => t.status === 'review').length,
      tasks_completed: tasks.filter(t => t.status === 'completed').length,
      quizzes_available: quizzes.filter(q => !q.attempt?.submitted_at).length,
      quizzes_passed: quizzes.filter(q => q.attempt?.passed).length,
    },
    tabAccess: tabAccessService.getAllowedTabs(req.user),
    billing: paymentService.getAccessStatus(req.user.id),
  });
}

export async function enroll(req, res) {
  const result = programService.enroll(req.user.id, req.body.programId);
  if (result.error === 'not_found') throw new NotFoundError('Програму не знайдено');
  if (result.error === 'conflict') throw new ConflictError('Ви вже записані на цю програму');

  addBounty(req.user.id, 50, `Запис на програму: ${result.program.name}`);
  res.status(201).json({ ok: true, message: `Ви записані на «${result.program.name}» (+50 bounty)` });
}

export async function updateProfile(req, res) {
  const user = userService.updateProfile(req.user.id, req.body);
  res.json({ user: userService.toPublic(user) });
}

export async function completeChallenge(req, res) {
  const challengeId = parseInt(req.params.id, 10);
  const result = challengeService.complete(req.user.id, challengeId);
  if (result.error === 'not_found') throw new NotFoundError('Завдання не знайдено');
  if (result.error === 'ctf_only') throw new ForbiddenError('Це CTF-завдання — вирішіть його на вкладці CTF');
  if (result.error === 'conflict') throw new ConflictError('Завдання вже виконано');

  addBounty(req.user.id, result.challenge.bounty_reward, `Challenge: ${result.challenge.title}`);
  const user = userService.findById(req.user.id);

  res.json({
    ok: true,
    bounty_earned: result.challenge.bounty_reward,
    duration_seconds: result.duration_seconds,
    user: userService.toPublic(user),
    message: `+${result.challenge.bounty_reward} bounty за «${result.challenge.title}»`,
  });
}

export async function startChallenge(req, res) {
  const challengeId = parseInt(req.params.id, 10);
  const data = challengeService.startChallenge(req.user.id, challengeId);
  res.json({ ok: true, ...data });
}

export async function updateEnrollmentProgress(req, res) {
  const enrollmentId = parseInt(req.params.id, 10);
  const result = programService.updateProgress(req.user.id, enrollmentId, req.body.progress);
  if (result.error === 'not_found') throw new NotFoundError('Запис не знайдено');

  if (result.justCompleted) {
    const program = programService.getById(result.enrollment.program_id);
    addBounty(req.user.id, 200, `Завершення програми: ${program.name}`);
  }

  res.json({ ok: true, progress: result.value });
}

export async function listTasks(req, res) {
  res.json({ tasks: taskService.listForStudent(req.user.id) });
}

export async function takeTask(req, res) {
  const assignmentId = parseInt(req.params.id, 10);
  const assignment = taskService.takeTask(req.user.id, assignmentId);
  res.json({ ok: true, assignment, message: 'Задачу взято в роботу' });
}

export async function submitTask(req, res) {
  const assignmentId = parseInt(req.params.id, 10);
  const assignment = taskService.submitTask(req.user.id, assignmentId, req.body.note, req.files || []);
  res.json({ ok: true, assignment, message: 'Задачу надіслано на перевірку' });
}

export async function listArticles(req, res) {
  if (!articleService.studentCanWriteArticles(req.user.id)) {
    throw new ForbiddenError('Роль «Автор» не призначена');
  }
  res.json({ articles: articleService.listForUser(req.user.id) });
}

export async function createArticle(req, res) {
  const article = articleService.create(req.user.id, req.body);
  res.status(201).json({ article, message: 'Чернетку збережено' });
}

export async function updateArticle(req, res) {
  const articleId = parseInt(req.params.id, 10);
  const article = articleService.update(req.user.id, articleId, req.body);
  res.json({ article, message: 'Статтю оновлено' });
}

export async function submitArticle(req, res) {
  const articleId = parseInt(req.params.id, 10);
  const article = articleService.submit(req.user.id, articleId);
  res.json({ article, message: 'Статтю надіслано викладачу' });
}

export async function getContentView(req, res) {
  const targetType = req.params.type;
  const targetId = parseInt(req.params.id, 10);
  const allowDraft = req.query.draft === '1' && ['owner', 'developer', 'teacher'].includes(req.user.role);
  const data = contentService.getPageForViewer(
    targetType,
    targetId,
    req.user.id,
    req.user.role,
    { allowDraft },
  );
  res.json(data);
}

export async function getStudentSchedule(req, res) {
  const lessons = scheduleService.listStudentLessons(req.user.id, {
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ lessons });
}

export async function reportAbsence(req, res) {
  const absence = scheduleService.reportAbsence(
    req.user.id,
    parseInt(req.params.lessonId, 10),
    req.body.reason,
  );
  res.status(201).json({ absence, message: 'Відсутність зафіксовано. Викладач отримає повідомлення.' });
}

export async function listQuizzes(req, res) {
  res.json({ quizzes: quizService.listForStudent(req.user.id) });
}

export async function getQuiz(req, res) {
  const quiz = quizService.getForStudent(req.user.id, parseInt(req.params.id, 10));
  res.json({ quiz });
}

export async function startQuiz(req, res) {
  const data = quizService.startQuiz(req.user.id, parseInt(req.params.id, 10));
  res.json({ ok: true, ...data });
}

export async function submitQuiz(req, res) {
  const result = quizService.submitAttempt(req.user.id, parseInt(req.params.id, 10), req.body.answers);
  const user = userService.findById(req.user.id);
  res.json({
    ...result,
    user: userService.toPublic(user),
    message: result.passed
      ? `Тест пройдено! ${result.score_percent}% (+${result.bounty_earned} bounty)`
      : `Результат: ${result.score_percent}%. Потрібно ${result.pass_percent}%`,
  });
}
