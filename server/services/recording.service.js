import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import config from '../config/index.js';
import db from '../db/index.js';
import * as storageService from './storage.service.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { userHasGroupAccess } from './chat.service.js';

if (!existsSync(config.uploads.recordingsDir)) {
  mkdirSync(config.uploads.recordingsDir, { recursive: true });
}

export function hasPlayableFile(recording) {
  if (!recording?.filename || !recording.file_size) return false;
  try {
    return existsSync(getFilePath(recording));
  } catch {
    return false;
  }
}

function enrichRecording(row) {
  if (!row) return row;
  return { ...row, has_file: hasPlayableFile(row) };
}

function canAccessRecording(rec, userId, userRole) {
  if (!rec || !userId) return false;
  if (['owner', 'developer'].includes(userRole)) return true;
  if (rec.uploaded_by === userId) return true;
  if (!rec.conference_id) return false;
  const participant = db.prepare(
    'SELECT 1 FROM conference_participants WHERE conference_id = ? AND user_id = ?',
  ).get(rec.conference_id, userId);
  if (participant) return true;
  const conf = db.prepare('SELECT host_user_id, group_id FROM conferences WHERE id = ?').get(rec.conference_id);
  if (!conf) return false;
  if (conf.host_user_id === userId) return true;
  if (conf.group_id && userHasGroupAccess(conf.group_id, userId, userRole)) return true;
  return false;
}

export function assertCanAccessRecording(id, userId, userRole) {
  const rec = getById(id);
  if (!rec || !canAccessRecording(rec, userId, userRole)) {
    throw new NotFoundError('Запис не знайдено');
  }
  return rec;
}

export function list({ userId, userRole, conferenceId } = {}) {
  let sql = `
    SELECT r.*, u.name as uploader_name, u.handle as uploader_handle,
      c.title as conference_title, c.room_code,
      (SELECT COUNT(*) FROM recording_notes rn WHERE rn.recording_id = r.id) as notes_count
    FROM recordings r
    JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN conferences c ON c.id = r.conference_id
    WHERE 1=1
  `;
  const params = [];
  if (conferenceId) { sql += ' AND r.conference_id = ?'; params.push(conferenceId); }
  if (userId && !['owner', 'developer'].includes(userRole)) {
    sql += ` AND (
      r.uploaded_by = ?
      OR EXISTS (
        SELECT 1 FROM conference_participants cp
        WHERE cp.conference_id = r.conference_id AND cp.user_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM conferences c2
        WHERE c2.id = r.conference_id AND c2.host_user_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM conferences c2
        JOIN study_group_members gm ON gm.group_id = c2.group_id
        WHERE c2.id = r.conference_id AND gm.user_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM conferences c2
        JOIN study_groups g ON g.id = c2.group_id
        WHERE c2.id = r.conference_id AND g.teacher_id = ?
      )
    )`;
    params.push(userId, userId, userId, userId, userId);
  }
  sql += ' ORDER BY r.created_at DESC';
  return db.prepare(sql).all(...params).map(enrichRecording);
}

export function getById(id) {
  const row = db.prepare(`
    SELECT r.*, u.name as uploader_name, u.handle as uploader_handle,
      c.title as conference_title, c.room_code, c.scheduled_at as conference_date
    FROM recordings r
    JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN conferences c ON c.id = r.conference_id
    WHERE r.id = ?
  `).get(id);
  return enrichRecording(row);
}

export function getFilePath(recording) {
  return storageService.getRecordingPath(recording);
}

export function create({ conferenceId, userId, title, description, filename, mimeType, durationSeconds, fileSize }) {
  if (!title?.trim()) throw new ValidationError('Вкажіть назву запису');

  const result = db.prepare(`
    INSERT INTO recordings (conference_id, uploaded_by, title, description, filename, mime_type, duration_seconds, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conferenceId || null,
    userId,
    title.trim(),
    description?.trim() || null,
    filename,
    mimeType || 'video/webm',
    durationSeconds || 0,
    fileSize || 0,
  );

  return getById(result.lastInsertRowid);
}

export function generateFilename() {
  return `${Date.now()}-${randomBytes(8).toString('hex')}.webm`;
}

export function remove(id, userId) {
  const rec = getById(id);
  if (!rec) throw new NotFoundError('Запис не знайдено');
  if (rec.uploaded_by !== userId) throw new ForbiddenError('Немає прав на видалення');

  const filePath = getFilePath(rec);
  if (existsSync(filePath)) unlinkSync(filePath);

  db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
  return true;
}

export function getNotes(recordingId) {
  return db.prepare(`
    SELECT rn.*, u.name as author_name, u.handle as author_handle
    FROM recording_notes rn
    JOIN users u ON u.id = rn.user_id
    WHERE rn.recording_id = ?
    ORDER BY rn.is_pinned DESC, CASE WHEN rn.timestamp_seconds IS NULL THEN 1 ELSE 0 END, rn.timestamp_seconds, rn.created_at ASC
  `).all(recordingId);
}

export function addNote({ recordingId, userId, content, timestampSeconds, isPinned }) {
  if (!content?.trim()) throw new ValidationError('Нотатка не може бути порожньою');

  const result = db.prepare(`
    INSERT INTO recording_notes (recording_id, user_id, content, timestamp_seconds, is_pinned)
    VALUES (?, ?, ?, ?, ?)
  `).run(recordingId, userId, content.trim(), timestampSeconds ?? null, isPinned ? 1 : 0);

  return db.prepare(`
    SELECT rn.*, u.name as author_name, u.handle as author_handle
    FROM recording_notes rn JOIN users u ON u.id = rn.user_id WHERE rn.id = ?
  `).get(result.lastInsertRowid);
}

export function updateNote(noteId, userId, { content, timestampSeconds, isPinned }) {
  const note = db.prepare('SELECT * FROM recording_notes WHERE id = ?').get(noteId);
  if (!note) throw new NotFoundError('Нотатку не знайдено');
  if (note.user_id !== userId) throw new ForbiddenError('Немає прав на редагування');

  db.prepare(`
    UPDATE recording_notes SET
      content = COALESCE(?, content),
      timestamp_seconds = COALESCE(?, timestamp_seconds),
      is_pinned = COALESCE(?, is_pinned),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(content?.trim(), timestampSeconds, isPinned !== undefined ? (isPinned ? 1 : 0) : null, noteId);

  return db.prepare(`
    SELECT rn.*, u.name as author_name, u.handle as author_handle
    FROM recording_notes rn JOIN users u ON u.id = rn.user_id WHERE rn.id = ?
  `).get(noteId);
}

export function deleteNote(noteId, userId) {
  const note = db.prepare('SELECT * FROM recording_notes WHERE id = ?').get(noteId);
  if (!note) throw new NotFoundError('Нотатку не знайдено');
  if (note.user_id !== userId) throw new ForbiddenError('Немає прав на видалення');
  db.prepare('DELETE FROM recording_notes WHERE id = ?').run(noteId);
  return true;
}
