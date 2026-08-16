import { createReadStream, existsSync } from 'fs';
import * as recordingService from '../services/recording.service.js';
import * as storageService from '../services/storage.service.js';
import { NotFoundError } from '../utils/errors.js';

export async function list(req, res) {
  const { conferenceId } = req.query;
  res.json({ recordings: recordingService.list({ userId: req.user.id, conferenceId }) });
}

export async function getById(req, res) {
  const rec = recordingService.getById(parseInt(req.params.id, 10));
  if (!rec) throw new NotFoundError('Запис не знайдено');
  const notes = recordingService.getNotes(rec.id);
  res.json({ recording: rec, notes });
}

export async function upload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Файл не завантажено' });

  const { title, description, conferenceId, durationSeconds } = req.body;
  const rec = recordingService.create({
    conferenceId: conferenceId ? parseInt(conferenceId, 10) : null,
    userId: req.user.id,
    title: title || 'Запис конференції',
    description,
    filename: req.file.filename,
    mimeType: req.file.mimetype,
    durationSeconds: parseInt(durationSeconds, 10) || 0,
    fileSize: req.file.size,
  });

  storageService.registerRecording(rec.id, rec.filename, rec.file_size, rec.title);

  res.status(201).json({ recording: rec });
}

export async function stream(req, res) {
  const rec = recordingService.getById(parseInt(req.params.id, 10));
  if (!rec) throw new NotFoundError('Запис не знайдено');

  const filePath = recordingService.getFilePath(rec);
  if (!existsSync(filePath)) throw new NotFoundError('Файл запису не знайдено');

  const stat = await import('fs').then(fs => fs.promises.stat(filePath));
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': rec.mime_type,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': rec.mime_type,
    });
    createReadStream(filePath).pipe(res);
  }
}

export async function remove(req, res) {
  recordingService.remove(parseInt(req.params.id, 10), req.user.id);
  res.json({ ok: true });
}

export async function getNotes(req, res) {
  const notes = recordingService.getNotes(parseInt(req.params.id, 10));
  res.json({ notes });
}

export async function addNote(req, res) {
  const note = recordingService.addNote({
    recordingId: parseInt(req.params.id, 10),
    userId: req.user.id,
    ...req.body,
  });
  res.status(201).json({ note });
}

export async function updateNote(req, res) {
  const note = recordingService.updateNote(parseInt(req.params.noteId, 10), req.user.id, req.body);
  res.json({ note });
}

export async function deleteNote(req, res) {
  recordingService.deleteNote(parseInt(req.params.noteId, 10), req.user.id);
  res.json({ ok: true });
}
