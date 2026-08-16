import * as scheduleService from '../services/schedule.service.js';

export async function listLessons(req, res) {
  const lessons = scheduleService.listLessons(req.user.id, req.user.role, {
    groupId: req.query.groupId ? parseInt(req.query.groupId, 10) : null,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ lessons });
}

export async function createLesson(req, res) {
  const lesson = scheduleService.createLesson(req.user.id, req.user.role, req.body);
  res.status(201).json({ lesson, message: 'Заняття додано до розкладу' });
}

export async function updateLesson(req, res) {
  const lesson = scheduleService.updateLesson(
    parseInt(req.params.id, 10),
    req.user.id,
    req.user.role,
    req.body,
  );
  res.json({ lesson, message: 'Розклад оновлено' });
}

export async function deleteLesson(req, res) {
  const lesson = scheduleService.deleteLesson(
    parseInt(req.params.id, 10),
    req.user.id,
    req.user.role,
  );
  res.json({ lesson, message: 'Заняття скасовано' });
}

export async function listAbsences(req, res) {
  const absences = scheduleService.listAbsences(req.user.id, req.user.role, {
    groupId: req.query.groupId ? parseInt(req.query.groupId, 10) : null,
    status: req.query.status,
  });
  res.json({ absences });
}

export async function acknowledgeAbsence(req, res) {
  const absence = scheduleService.acknowledgeAbsence(
    parseInt(req.params.id, 10),
    req.user.id,
    req.user.role,
  );
  res.json({ absence, message: 'Відмітку переглянуто' });
}

export async function getStats(req, res) {
  const stats = scheduleService.getScheduleStats(req.user.id, req.user.role, {
    groupId: req.query.groupId ? parseInt(req.query.groupId, 10) : null,
    weeks: req.query.weeks,
  });
  res.json(stats);
}

export async function listStudentSchedule(req, res) {
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
  res.status(201).json({ absence, message: 'Відсутність зафіксовано' });
}
