import * as calendarService from '../services/calendar.service.js';
import * as scheduleService from '../services/schedule.service.js';
import * as conferenceService from '../services/conference.service.js';

function conferenceEvent(conf) {
  const minutes = Number(conf.duration_minutes) || 60;
  const startsAt = new Date(conf.scheduled_at.includes('T') ? conf.scheduled_at : `${conf.scheduled_at.replace(' ', 'T')}Z`);
  return {
    id: `conference-${conf.id}`,
    source: 'conference',
    title: conf.title,
    description: conf.description || '',
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + minutes * 60000).toISOString(),
    url: `/room.html?id=${conf.id}`,
    source_url: null,
    audience_label: conf.group_name || 'Конференція',
    group_color: conf.group_color || null,
  };
}

function requestedMonth(value) {
  return value || new Date().toISOString().slice(0, 7);
}

function lessonEvent(lesson) {
  return {
    id: `lesson-${lesson.id}`,
    source: 'lesson',
    title: lesson.title,
    description: lesson.topic || '',
    starts_at: lesson.lesson_at,
    ends_at: new Date(new Date(lesson.lesson_at).getTime() + lesson.duration_minutes * 60000).toISOString(),
    url: null,
    source_url: null,
    audience_label: lesson.group_name,
    group_color: lesson.group_color,
    is_exception: lesson.is_exception,
  };
}

export async function listStudentEvents(req, res) {
  const month = requestedMonth(req.query.month);
  const { from, to } = calendarService.getMonthRange(month);
  const isStaff = ['owner', 'developer', 'teacher'].includes(req.user.role);
  const events = isStaff
    ? calendarService.listForAdmin(month)
    : calendarService.listForStudent(req.user.id, month);
  const lessonRows = isStaff
    ? scheduleService.listLessons(req.user.id, req.user.role, { from, to })
    : scheduleService.listStudentLessons(req.user.id, { from, to });
  const conferences = conferenceService
    .list({ userId: req.user.id, userRole: req.user.role, from, to })
    .filter((conf) => conf.status !== 'cancelled' && conf.scheduled_at)
    .map(conferenceEvent);
  res.json({
    events: [...events, ...lessonRows.map(lessonEvent), ...conferences]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
  });
}

export async function listAdminEvents(req, res) {
  res.json({
    events: calendarService.listForAdmin(req.query.month),
    sync: calendarService.getCtfSyncStatus(),
  });
}

export async function createEvent(req, res) {
  const event = calendarService.createManualEvent(req.user.id, req.body);
  res.status(201).json({ event, message: 'Подію додано до календаря учнів' });
}

export async function deleteEvent(req, res) {
  calendarService.deleteManualEvent(Number.parseInt(req.params.id, 10));
  res.json({ message: 'Подію видалено з календаря' });
}

export async function syncCtfEvents(_req, res) {
  const result = await calendarService.syncCtfEvents();
  res.json({ result, sync: calendarService.getCtfSyncStatus() });
}
