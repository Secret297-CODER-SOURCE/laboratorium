import * as quizService from '../services/quiz.service.js';
import * as challengeService from '../services/challenge.service.js';
import * as notificationService from '../services/notification.service.js';

export async function listQuizzes(req, res) {
  res.json({ quizzes: quizService.listForTeacher(req.user.id, req.user.role) });
}

export async function createQuiz(req, res) {
  const quiz = quizService.createQuiz(req.user.id, req.body);
  res.status(201).json({ quiz, message: 'Тест створено' });
}

export async function deleteQuiz(req, res) {
  await quizService.deleteQuiz(req.user.id, req.user.role, parseInt(req.params.id, 10));
  res.json({ ok: true, message: 'Тест видалено' });
}

export async function listChallenges(req, res) {
  res.json({ challenges: challengeService.listForManage(req.user) });
}

export async function getChallengeStages(req, res) {
  const stages = challengeService.getStagesForManage(parseInt(req.params.id, 10), req.user);
  res.json({ stages });
}

export async function createChallenge(req, res) {
  const challenge = challengeService.createAdmin(req.body, req.user);
  if (challenge.ctf_enabled && challenge.is_active) {
    const studentIds = notificationService.resolveStudentAudience({ audienceType: 'all' });
    notificationService.notifyUsers(studentIds, {
      type: 'ctf_new',
      title: 'Новий CTF-виклик',
      body: challenge.title,
      link: '/dashboard.html?tab=ctf',
    });
  }
  res.status(201).json({ challenge, message: 'CTF додано' });
}

export async function updateChallenge(req, res) {
  const challenge = challengeService.updateAdmin(parseInt(req.params.id, 10), req.body, req.user);
  res.json({ challenge, message: 'Збережено' });
}

export async function deleteChallenge(req, res) {
  await challengeService.deleteAdmin(parseInt(req.params.id, 10), req.user);
  res.json({ ok: true, message: 'CTF видалено' });
}
