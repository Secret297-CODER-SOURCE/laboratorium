import db from '../db/index.js';
import * as groupService from './group.service.js';
import * as conferenceService from './conference.service.js';
import * as recordingService from './recording.service.js';
import { parseSqliteDate } from '../utils/time.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

export function logEvent(conferenceId, userId, eventType) {
  db.prepare(`
    INSERT INTO conference_attendance_events (conference_id, user_id, event_type)
    VALUES (?, ?, ?)
  `).run(conferenceId, userId, eventType);
}

function assertConferenceManage(conf, actorId, actorRole) {
  if (['owner', 'developer'].includes(actorRole)) return;
  if (conf.group_id) {
    // Throws ForbiddenError itself if actor doesn't teach this group.
    groupService.listGroupMembers(conf.group_id, actorId, actorRole);
    return;
  }
  if (conf.host_user_id !== actorId) {
    throw new ForbiddenError('Немає доступу до цієї конференції');
  }
}

/**
 * Reconstructs one user's presence timeline from their raw event log.
 * conference_attendance_events is append-only, so this — unlike
 * conference_participants.joined_at, which gets overwritten on reconnect —
 * can represent multiple join/leave cycles and tab-focus changes within a
 * single conference.
 */
function computeUserAttendance(events, durationSeconds, fallbackEnd) {
  let presentMs = 0;
  let awayMs = 0;
  let switchCount = 0;
  let firstJoinedAt = null;
  let lastLeftAt = null;

  // Cursor-based state machine: at each event, first credit the elapsed
  // time since the last event to whatever state we were already in
  // (present or away), *then* apply the new event's state change. This is
  // what avoids double-counting a hidden span that gets closed by 'leave'
  // after a 'tab_visible' already fired for it.
  let connected = false;
  let hidden = false;
  let cursorAt = null;

  function advanceTo(t) {
    if (connected && cursorAt) {
      const dt = Math.max(0, t - cursorAt);
      if (hidden) awayMs += dt; else presentMs += dt;
    }
    cursorAt = t;
  }

  for (const ev of events) {
    const t = parseSqliteDate(ev.created_at);
    if (!t) continue;
    advanceTo(t);

    if (ev.event_type === 'join') {
      if (!firstJoinedAt) firstJoinedAt = t;
      connected = true;
      hidden = false;
    } else if (ev.event_type === 'leave') {
      lastLeftAt = t;
      connected = false;
      hidden = false;
    } else if (ev.event_type === 'tab_hidden') {
      if (connected && !hidden) { hidden = true; switchCount += 1; }
    } else if (ev.event_type === 'tab_visible') {
      if (connected && hidden) hidden = false;
    }
  }

  // Still connected with no closing 'leave' (e.g. a live conference, or a
  // disconnect that never made it through) — close the open interval
  // against the fallback end (conference.ended_at, or now).
  if (connected) advanceTo(fallbackEnd);

  const presentSeconds = Math.round(presentMs / 1000);
  const awaySeconds = Math.round(awayMs / 1000);
  const attendancePct = durationSeconds > 0
    ? Math.min(100, Math.round((presentSeconds / durationSeconds) * 100))
    : 0;

  let status = 'absent';
  if (attendancePct >= 80) status = 'present';
  else if (presentSeconds > 0) status = 'partial';

  return {
    present_seconds: presentSeconds,
    away_seconds: awaySeconds,
    switch_count: switchCount,
    first_joined_at: firstJoinedAt ? firstJoinedAt.toISOString() : null,
    last_left_at: lastLeftAt ? lastLeftAt.toISOString() : null,
    attendance_pct: attendancePct,
    status,
  };
}

export function getConferenceAttendance(conferenceId, actorId, actorRole) {
  const conf = conferenceService.getById(conferenceId);
  if (!conf) throw new NotFoundError('Конференцію не знайдено');
  assertConferenceManage(conf, actorId, actorRole);

  const roster = new Map();
  if (conf.group_id) {
    for (const m of groupService.listGroupMembers(conf.group_id, actorId, actorRole)) {
      roster.set(m.id, { id: m.id, name: m.name, handle: m.handle });
    }
  }
  for (const p of conferenceService.getParticipants(conferenceId)) {
    if (p.role === 'host') continue;
    if (!roster.has(p.user_id)) {
      roster.set(p.user_id, { id: p.user_id, name: p.name, handle: p.handle });
    }
  }

  const events = db.prepare(`
    SELECT user_id, event_type, created_at FROM conference_attendance_events
    WHERE conference_id = ? ORDER BY created_at ASC
  `).all(conferenceId);
  const eventsByUser = new Map();
  for (const ev of events) {
    if (!eventsByUser.has(ev.user_id)) eventsByUser.set(ev.user_id, []);
    eventsByUser.get(ev.user_id).push(ev);
  }

  const durationSeconds = (conf.duration_minutes || 60) * 60;
  const fallbackEnd = conf.ended_at ? parseSqliteDate(conf.ended_at) : new Date();

  const recordings = recordingService.list({ conferenceId });
  const recordingIds = recordings.map(r => r.id);
  const viewsByUser = new Map();
  if (recordingIds.length) {
    const placeholders = recordingIds.map(() => '?').join(',');
    const views = db.prepare(`
      SELECT * FROM recording_views WHERE recording_id IN (${placeholders})
    `).all(...recordingIds);
    for (const v of views) {
      const totalDuration = recordings.find(r => r.id === v.recording_id)?.duration_seconds || 0;
      const existing = viewsByUser.get(v.user_id);
      const pct = totalDuration > 0 ? Math.min(100, Math.round((v.max_position_seconds / totalDuration) * 100)) : 0;
      const entry = {
        max_position_seconds: v.max_position_seconds,
        watched_seconds: v.watched_seconds,
        completed: !!v.completed,
        pct,
      };
      // A user may have views on more than one recording for this
      // conference (rare, e.g. a re-upload) — keep the furthest-watched one.
      if (!existing || entry.pct > existing.pct) viewsByUser.set(v.user_id, entry);
    }
  }

  const students = [...roster.values()].map(u => {
    const attendance = computeUserAttendance(eventsByUser.get(u.id) || [], durationSeconds, fallbackEnd);
    return {
      ...u,
      ...attendance,
      recording_watch: viewsByUser.get(u.id) || null,
    };
  });

  students.sort((a, b) => a.attendance_pct - b.attendance_pct);

  const summary = students.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    if (s.recording_watch) acc.watched_recording = (acc.watched_recording || 0) + 1;
    return acc;
  }, { present: 0, partial: 0, absent: 0, watched_recording: 0 });

  return { conference: conf, students, summary, has_recording: recordingIds.length > 0 };
}

export function getGroupAttendanceOverview(actorId, actorRole, { groupId, from, to } = {}) {
  const params = [];
  let sql = `
    SELECT c.*, g.name as group_name, g.color as group_color,
      (SELECT COUNT(*) FROM conference_participants cp WHERE cp.conference_id = c.id) as participant_count
    FROM conferences c
    LEFT JOIN study_groups g ON g.id = c.group_id
    WHERE c.status IN ('live', 'ended')
  `;

  if (groupId) {
    const group = groupService.getGroupById(groupId);
    if (!group) throw new NotFoundError('Групу не знайдено');
    if (!['owner', 'developer'].includes(actorRole) && group.teacher_id !== actorId) {
      throw new ForbiddenError('Немає доступу до групи');
    }
    sql += ' AND c.group_id = ?';
    params.push(groupId);
  } else if (actorRole === 'teacher') {
    sql += ` AND c.group_id IN (SELECT id FROM study_groups WHERE teacher_id = ?)`;
    params.push(actorId);
  }

  if (from) { sql += ' AND c.scheduled_at >= ?'; params.push(from); }
  if (to) { sql += ' AND c.scheduled_at <= ?'; params.push(to); }

  sql += ' ORDER BY c.scheduled_at DESC LIMIT 100';
  const conferences = db.prepare(sql).all(...params);

  // Cheap per-conference summary (counts only) without pulling every event —
  // good enough for the list view; the full breakdown lives behind
  // getConferenceAttendance() once a teacher drills into one row.
  return conferences.map(c => {
    const detail = getConferenceAttendance(c.id, actorId, actorRole);
    return { ...c, summary: detail.summary, has_recording: detail.has_recording };
  });
}
