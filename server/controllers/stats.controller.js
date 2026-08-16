import * as statsService from '../services/stats.service.js';

export async function getStatsOverview(req, res) {
  const data = statsService.getOverview(req.user.id, req.user.role);
  res.json(data);
}

export async function getStudentStats(req, res) {
  const data = statsService.getStudentDetail(
    req.user.id,
    req.user.role,
    parseInt(req.params.id, 10),
  );
  res.json(data);
}

export async function getTaskStats(req, res) {
  const data = statsService.getTaskDetail(
    req.user.id,
    req.user.role,
    parseInt(req.params.id, 10),
  );
  res.json(data);
}

export async function getQuizStats(req, res) {
  const data = statsService.getQuizDetail(
    req.user.id,
    req.user.role,
    parseInt(req.params.id, 10),
  );
  res.json(data);
}
