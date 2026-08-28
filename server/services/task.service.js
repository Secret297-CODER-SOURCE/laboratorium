import { unlinkSync } from 'fs';
import { join } from 'path';
import db from '../db/index.js';
import config from '../config/index.js';
import * as groupService from './group.service.js';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

const TASK_STATUSES = ['available', 'taken', 'review', 'completed'];

function getSubmissionFiles(assignmentId) {
  return db.prepare(`
    SELECT id, filename, original_name, mime_type, size_bytes, created_at
    FROM task_submission_files WHERE assignment_id = ? ORDER BY id ASC
  `).all(assignmentId).map(f => ({
    ...f,
    url: `/uploads/task-submissions/${f.filename}`,
  }));
}

function mapAssignment(row) {
  if (!row) return null;
  const id = row.assignment_id ?? row.id;
  return {
    id,
    task_id: row.task_id,
    user_id: row.user_id,
    status: row.status,
    taken_at: row.taken_at,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    work_duration_seconds: row.work_duration_seconds,
    duration_seconds: row.duration_seconds,
    submission_note: row.submission_note,
    submission_files: getSubmissionFiles(id),
    title: row.title,
    description: row.description,
    bounty_reward: row.bounty_reward,
    due_at: row.due_at,
    time_limit_minutes: row.time_limit_minutes,
    group_id: row.group_id,
    group_name: row.group_name,
    group_color: row.group_color,
    student_handle: row.student_handle,
    student_name: row.student_name,
    created_at: row.task_created_at ?? row.created_at,
  };
}

const assignmentSelect = `
  SELECT
    ta.id as assignment_id,
    ta.task_id,
    ta.user_id,
    ta.status,
    ta.taken_at,
    ta.submitted_at,
    ta.completed_at,
    ta.submission_note,
    t.title,
    t.description,
    t.bounty_reward,
    t.due_at,
    t.time_limit_minutes,
    t.group_id,
    t.created_at as task_created_at,
    g.name as group_name,
    g.color as group_color,
    u.handle as student_handle,
    u.name as student_name
  FROM task_assignments ta
  JOIN tasks t ON t.id = ta.task_id
  JOIN study_groups g ON g.id = t.group_id
  LEFT JOIN users u ON u.id = ta.user_id
`;

export function listForStudent(userId) {
  return db.prepare(`
    ${assignmentSelect}
    WHERE ta.user_id = ?
      AND t.is_active = 1
      AND EXISTS (
        SELECT 1 FROM study_group_members gm
        WHERE gm.group_id = t.group_id AND gm.user_id = ?
      )
    ORDER BY
      CASE ta.status
        WHEN 'available' THEN 0
        WHEN 'taken' THEN 1
        WHEN 'review' THEN 2
        WHEN 'completed' THEN 3
      END,
      t.created_at DESC
  `).all(userId, userId).map(mapAssignment);
}

export function listForTeacher(actorId, actorRole) {
  const groups = groupService.listGroups(actorId, actorRole);
  if (!groups.length) return { tasks: [], reviewQueue: [] };

  const groupIds = groups.map(g => g.id);
  const placeholders = groupIds.map(() => '?').join(',');

  const tasks = db.prepare(`
    SELECT t.*, g.name as group_name, g.color as group_color,
      (SELECT COUNT(*) FROM task_assignments ta WHERE ta.task_id = t.id) as assignment_count,
      (SELECT COUNT(*) FROM task_assignments ta WHERE ta.task_id = t.id AND ta.status = 'review') as review_count,
      (SELECT COUNT(*) FROM task_assignments ta WHERE ta.task_id = t.id AND ta.status = 'completed') as completed_count
    FROM tasks t
    JOIN study_groups g ON g.id = t.group_id
    WHERE t.group_id IN (${placeholders}) AND t.is_active = 1
    ORDER BY t.created_at DESC
  `).all(...groupIds);

  const reviewQueue = db.prepare(`
    ${assignmentSelect}
    WHERE t.group_id IN (${placeholders})
      AND ta.status = 'review'
      AND t.is_active = 1
    ORDER BY ta.submitted_at ASC
  `).all(...groupIds).map(mapAssignment);

  return { tasks, reviewQueue };
}

export function createTask(actorId, actorRole, data) {
  const groupId = parseInt(data.group_id, 10);
  const group = groupService.getGroupById(groupId);
  if (!group) throw new NotFoundError('Групу не знайдено');
  if (actorRole === 'teacher' && group.teacher_id !== actorId) {
    throw new ForbiddenError('Немає доступу до цієї групи');
  }

  const title = data.title?.trim();
  if (!title) throw new ValidationError('Вкажіть назву задачі');

  const bounty_reward = parseInt(data.bounty_reward, 10) || 0;
  const due_at = data.due_at || null;
  const description = data.description?.trim() || null;
  const time_limit_minutes = data.time_limit_minutes
    ? parseInt(data.time_limit_minutes, 10)
    : null;

  const result = db.prepare(`
    INSERT INTO tasks (group_id, created_by, title, description, bounty_reward, due_at, time_limit_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, actorId, title, description, bounty_reward, due_at, time_limit_minutes);

  const taskId = result.lastInsertRowid;
  const members = groupService.listGroupMembers(groupId, actorId, actorRole);
  const insertAssignment = db.prepare(`
    INSERT INTO task_assignments (task_id, user_id, status)
    VALUES (?, ?, 'available')
  `);

  const tx = db.transaction(() => {
    for (const m of members) {
      insertAssignment.run(taskId, m.id);
    }
  });
  tx();

  return getTaskById(taskId);
}

function getTaskById(taskId) {
  return db.prepare(`
    SELECT t.*, g.name as group_name, g.color as group_color
    FROM tasks t
    JOIN study_groups g ON g.id = t.group_id
    WHERE t.id = ?
  `).get(taskId);
}

function getAssignment(assignmentId) {
  return db.prepare(`
    ${assignmentSelect}
    WHERE ta.id = ?
  `).get(assignmentId);
}

function assertStudentAssignment(assignmentId, userId) {
  const row = getAssignment(assignmentId);
  if (!row) throw new NotFoundError('Задачу не знайдено');
  if (row.user_id !== userId) throw new ForbiddenError();
  return mapAssignment(row);
}

function assertTeacherCanManageAssignment(assignmentId, actorId, actorRole) {
  const row = getAssignment(assignmentId);
  if (!row) throw new NotFoundError('Задачу не знайдено');
  const group = groupService.getGroupById(row.group_id);
  if (actorRole === 'teacher' && group.teacher_id !== actorId) {
    throw new ForbiddenError();
  }
  return mapAssignment(row);
}

export function takeTask(userId, assignmentId) {
  const assignment = assertStudentAssignment(assignmentId, userId);
  if (assignment.status !== 'available') {
    throw new ConflictError('Задачу вже взято');
  }

  db.prepare(`
    UPDATE task_assignments
    SET status = 'taken', taken_at = datetime('now')
    WHERE id = ?
  `).run(assignmentId);

  return mapAssignment(getAssignment(assignmentId));
}

export function submitTask(userId, assignmentId, note = '', files = []) {
  const assignment = assertStudentAssignment(assignmentId, userId);
  if (assignment.status !== 'taken') {
    throw new ConflictError('Задачу можна надіслати лише після того, як ви її взяли');
  }

  const trimmedNote = note?.trim() || null;
  if (!trimmedNote && !files.length) {
    throw new ValidationError('Додайте коментар, файл або фото до здачі');
  }

  const insertFile = db.prepare(`
    INSERT INTO task_submission_files (assignment_id, filename, original_name, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE task_assignments
      SET status = 'review', submitted_at = datetime('now'), submission_note = ?,
        work_duration_seconds = CAST((strftime('%s', datetime('now')) - strftime('%s', taken_at)) AS INTEGER)
      WHERE id = ?
    `).run(trimmedNote, assignmentId);

    for (const file of files) {
      insertFile.run(assignmentId, file.filename, file.originalname, file.mimetype || null, file.size || 0);
    }
  });
  tx();

  return mapAssignment(getAssignment(assignmentId));
}

function deleteSubmissionFiles(assignmentId) {
  const files = getSubmissionFiles(assignmentId);
  if (!files.length) return;
  db.prepare('DELETE FROM task_submission_files WHERE assignment_id = ?').run(assignmentId);
  for (const file of files) {
    try {
      unlinkSync(join(config.uploads.tasksDir, file.filename));
    } catch { /* файл вже відсутній на диску — не критично */ }
  }
}

export function approveTask(actorId, actorRole, assignmentId) {
  const assignment = assertTeacherCanManageAssignment(assignmentId, actorId, actorRole);
  if (assignment.status !== 'review') {
    throw new ConflictError('Задача не на перевірці');
  }

  db.prepare(`
    UPDATE task_assignments
    SET status = 'completed', completed_at = datetime('now'), reviewer_id = ?,
      duration_seconds = CAST((strftime('%s', datetime('now')) - strftime('%s', taken_at)) AS INTEGER)
    WHERE id = ?
  `).run(actorId, assignmentId);

  return {
    assignment: mapAssignment(getAssignment(assignmentId)),
    bounty_reward: assignment.bounty_reward,
    user_id: assignment.user_id,
    title: assignment.title,
  };
}

export function rejectTask(actorId, actorRole, assignmentId) {
  const assignment = assertTeacherCanManageAssignment(assignmentId, actorId, actorRole);
  if (assignment.status !== 'review') {
    throw new ConflictError('Задача не на перевірці');
  }

  deleteSubmissionFiles(assignmentId);
  db.prepare(`
    UPDATE task_assignments
    SET status = 'taken', submitted_at = NULL, submission_note = NULL
    WHERE id = ?
  `).run(assignmentId);

  return mapAssignment(getAssignment(assignmentId));
}

export function deleteTask(taskId, actorId, actorRole) {
  const task = getTaskById(taskId);
  if (!task) throw new NotFoundError('Задачу не знайдено');
  const group = groupService.getGroupById(task.group_id);
  if (actorRole === 'teacher' && group.teacher_id !== actorId) {
    throw new ForbiddenError();
  }
  db.prepare('UPDATE tasks SET is_active = 0 WHERE id = ?').run(taskId);
  return { ok: true };
}

export { TASK_STATUSES };
