import multer from 'multer';
import { join, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import config from '../config/index.js';
import * as recordingService from '../services/recording.service.js';
import * as storageService from '../services/storage.service.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      cb(null, storageService.getDefaultRecordingsDir());
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, _file, cb) => cb(null, recordingService.generateFilename()),
});

export const uploadRecording = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/webm', 'video/mp4', 'video/ogg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Допустимі формати: webm, mp4, ogg'));
  },
}).single('recording');

const CHAT_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'video/ogg': '.ogv',
  'video/quicktime': '.mov',
};

const DANGEROUS_UPLOAD_EXT = ['.html', '.htm', '.svg', '.js', '.mjs', '.xml', '.xhtml', '.php'];

const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      cb(null, storageService.getDefaultChatDir());
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = CHAT_MIME_EXT[file.mimetype] || '.bin';
    cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
  },
});

export const uploadChatMedia = multer({
  storage: chatStorage,
  limits: { fileSize: config.uploads.maxChatFileSize },
  fileFilter: (_req, file, cb) => {
    const origExt = extname(file.originalname || '').toLowerCase();
    if (DANGEROUS_UPLOAD_EXT.includes(origExt)) {
      return cb(new Error('Недопустиме розширення файлу'));
    }
    if (CHAT_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Допустимі формати: jpg, png, webp, gif, webm, mp4'));
  },
}).single('file');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const ctfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      cb(null, ensureDir(config.uploads.ctfDir));
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname || '') || '.bin';
    cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
  },
});

const CTF_BLOCKED_EXTENSIONS = ['.html', '.htm', '.svg', '.js', '.mjs', '.php'];

export const uploadCtfAttachment = multer({
  storage: ctfStorage,
  limits: { fileSize: config.uploads.maxCtfAttachmentSize },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase();
    if (CTF_BLOCKED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`Формат ${ext} не дозволено`));
    }
    cb(null, true);
  },
}).single('file');
