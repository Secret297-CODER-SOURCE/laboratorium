import {
  copyFileSync, existsSync, mkdirSync, unlinkSync, statSync,
} from 'fs';
import { join, dirname } from 'path';
import config from '../config/index.js';
import db from '../db/index.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

function slugify(name) {
  return String(name || 'server').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'server';
}

function mapServer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    root_path: row.root_path,
    is_default: !!row.is_default,
    is_active: !!row.is_active,
    notes: row.notes,
    created_at: row.created_at,
  };
}

export function recordingsDir(server) {
  const dir = join(server.root_path, 'recordings');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function chatDir(server) {
  const dir = join(server.root_path, 'chat');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDefaultServer() {
  let server = db.prepare(`
    SELECT * FROM storage_servers WHERE is_default = 1 AND is_active = 1 LIMIT 1
  `).get();
  if (!server) {
    server = db.prepare(`
      SELECT * FROM storage_servers WHERE is_active = 1 ORDER BY id LIMIT 1
    `).get();
  }
  if (!server) throw new ValidationError('Немає активного сервера сховища');
  return mapServer(server);
}

export function getDefaultRecordingsDir() {
  return recordingsDir(getDefaultServer());
}

export function getDefaultChatDir() {
  return chatDir(getDefaultServer());
}

export function getAssetAbsolutePath(asset) {
  const server = db.prepare('SELECT * FROM storage_servers WHERE id = ?').get(asset.server_id);
  if (!server) throw new NotFoundError('Сервер сховища не знайдено');
  return join(server.root_path, asset.relative_path);
}

export function getRecordingPath(recording) {
  const asset = db.prepare(`
    SELECT * FROM storage_assets WHERE asset_type = 'recording' AND ref_id = ?
  `).get(recording.id);
  if (asset) return getAssetAbsolutePath(asset);
  return join(config.uploads.recordingsDir, recording.filename);
}

export function getChatFilePath(attachmentUrl) {
  if (!attachmentUrl?.startsWith('/uploads/chat/')) {
    return join(config.uploads.chatDir, attachmentUrl.split('/').pop() || '');
  }
  const filename = attachmentUrl.replace('/uploads/chat/', '');
  const asset = db.prepare(`
    SELECT a.* FROM storage_assets a
    WHERE a.asset_type = 'chat' AND a.filename = ?
    ORDER BY a.id DESC LIMIT 1
  `).get(filename);
  if (asset) return getAssetAbsolutePath(asset);
  return join(config.uploads.chatDir, filename);
}

function upsertAsset({
  serverId, assetType, refId, filename, relativePath, sizeBytes, label,
}) {
  const existing = refId
    ? db.prepare('SELECT id FROM storage_assets WHERE asset_type = ? AND ref_id = ?').get(assetType, refId)
    : null;

  if (existing) {
    db.prepare(`
      UPDATE storage_assets SET server_id = ?, filename = ?, relative_path = ?,
        size_bytes = ?, label = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(serverId, filename, relativePath, sizeBytes || 0, label || null, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO storage_assets (server_id, asset_type, ref_id, filename, relative_path, size_bytes, label)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(serverId, assetType, refId, filename, relativePath, sizeBytes || 0, label || null);
  return result.lastInsertRowid;
}

export function registerRecording(recordingId, filename, sizeBytes, title) {
  const server = getDefaultServer();
  upsertAsset({
    serverId: server.id,
    assetType: 'recording',
    refId: recordingId,
    filename,
    relativePath: `recordings/${filename}`,
    sizeBytes,
    label: title || null,
  });
}

export function registerChat(messageId, filename, sizeBytes) {
  const server = getDefaultServer();
  upsertAsset({
    serverId: server.id,
    assetType: 'chat',
    refId: messageId,
    filename,
    relativePath: `chat/${filename}`,
    sizeBytes,
    label: filename,
  });
}

export function ensureStorageReady() {
  const count = db.prepare('SELECT COUNT(*) as c FROM storage_servers').get().c;
  if (count === 0) {
    const root = config.uploads.dir;
    mkdirSync(join(root, 'recordings'), { recursive: true });
    mkdirSync(join(root, 'chat'), { recursive: true });
    db.prepare(`
      INSERT INTO storage_servers (name, slug, root_path, is_default, is_active, notes)
      VALUES (?, ?, ?, 1, 1, ?)
    `).run('Локальний сервер', 'local-primary', root, 'Основне сховище застосунку');
  }
  syncExistingAssets();
}

export function syncExistingAssets() {
  const server = getDefaultServer();

  const recordings = db.prepare('SELECT id, filename, file_size, title FROM recordings').all();
  for (const r of recordings) {
    if (!r.filename) continue;
    const rel = `recordings/${r.filename}`;
    const abs = join(server.root_path, rel);
    let size = r.file_size || 0;
    if (existsSync(abs)) {
      try { size = statSync(abs).size; } catch { /* ignore */ }
    }
    upsertAsset({
      serverId: server.id,
      assetType: 'recording',
      refId: r.id,
      filename: r.filename,
      relativePath: rel,
      sizeBytes: size,
      label: r.title,
    });
  }

  const chatFiles = db.prepare(`
    SELECT id, attachment_url FROM chat_messages
    WHERE attachment_url IS NOT NULL AND attachment_url != ''
  `).all();
  for (const m of chatFiles) {
    const filename = m.attachment_url.split('/').pop();
    if (!filename) continue;
    const rel = `chat/${filename}`;
    const abs = join(server.root_path, rel);
    const fallback = join(config.uploads.chatDir, filename);
    const path = existsSync(abs) ? abs : (existsSync(fallback) ? fallback : null);
    let size = 0;
    if (path) {
      try { size = statSync(path).size; } catch { /* ignore */ }
    }
    upsertAsset({
      serverId: server.id,
      assetType: 'chat',
      refId: m.id,
      filename,
      relativePath: rel,
      sizeBytes: size,
      label: filename,
    });
  }
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function listServersAdmin() {
  return db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM storage_assets a WHERE a.server_id = s.id) as asset_count,
      (SELECT COALESCE(SUM(size_bytes), 0) FROM storage_assets a WHERE a.server_id = s.id) as total_bytes,
      (SELECT COUNT(*) FROM storage_assets a WHERE a.server_id = s.id AND a.asset_type = 'recording') as recordings_count,
      (SELECT COUNT(*) FROM storage_assets a WHERE a.server_id = s.id AND a.asset_type = 'chat') as chat_count
    FROM storage_servers s
    ORDER BY s.is_default DESC, s.name
  `).all().map(row => ({
    ...mapServer(row),
    asset_count: row.asset_count,
    total_bytes: row.total_bytes,
    total_size_label: formatBytes(row.total_bytes),
    recordings_count: row.recordings_count,
    chat_count: row.chat_count,
  }));
}

export function createServer(data) {
  const name = data.name?.trim();
  const root_path = data.root_path?.trim();
  if (!name) throw new ValidationError('Вкажіть назву сервера');
  if (!root_path) throw new ValidationError('Вкажіть шлях root_path');

  let slug = slugify(data.slug || name);
  const taken = db.prepare('SELECT id FROM storage_servers WHERE slug = ?').get(slug);
  if (taken) slug = `${slug}-${Date.now().toString(36)}`;

  mkdirSync(join(root_path, 'recordings'), { recursive: true });
  mkdirSync(join(root_path, 'chat'), { recursive: true });

  const isDefault = data.is_default ? 1 : 0;
  if (isDefault) {
    db.prepare('UPDATE storage_servers SET is_default = 0').run();
  }

  const result = db.prepare(`
    INSERT INTO storage_servers (name, slug, root_path, is_default, is_active, notes)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(name, slug, root_path, isDefault, data.notes?.trim() || null);

  return mapServer(db.prepare('SELECT * FROM storage_servers WHERE id = ?').get(result.lastInsertRowid));
}

export function updateServer(id, data) {
  const row = db.prepare('SELECT * FROM storage_servers WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('Сервер не знайдено');

  const isDefault = data.is_default ? 1 : 0;
  if (isDefault) {
    db.prepare('UPDATE storage_servers SET is_default = 0').run();
  }

  db.prepare(`
    UPDATE storage_servers SET
      name = ?, root_path = ?, is_default = ?, is_active = ?, notes = ?
    WHERE id = ?
  `).run(
    data.name?.trim() || row.name,
    data.root_path?.trim() || row.root_path,
    data.is_default !== undefined ? isDefault : row.is_default,
    data.is_active === false ? 0 : (data.is_active === true ? 1 : row.is_active),
    data.notes !== undefined ? (data.notes?.trim() || null) : row.notes,
    id,
  );

  return mapServer(db.prepare('SELECT * FROM storage_servers WHERE id = ?').get(id));
}

export function deleteServer(id) {
  const row = db.prepare('SELECT * FROM storage_servers WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('Сервер не знайдено');
  if (row.is_default) throw new ConflictError('Не можна видалити сервер за замовчуванням');

  const assets = db.prepare('SELECT COUNT(*) as c FROM storage_assets WHERE server_id = ?').get(id).c;
  if (assets > 0) throw new ConflictError('Спочатку перемістіть файли на інший сервер');

  db.prepare('DELETE FROM storage_servers WHERE id = ?').run(id);
  return { ok: true };
}

export function listAssets({ serverId, assetType, limit = 100 } = {}) {
  let sql = `
    SELECT a.*, s.name as server_name
    FROM storage_assets a
    JOIN storage_servers s ON s.id = a.server_id
    WHERE 1=1
  `;
  const params = [];
  if (serverId) { sql += ' AND a.server_id = ?'; params.push(serverId); }
  if (assetType) { sql += ' AND a.asset_type = ?'; params.push(assetType); }
  sql += ' ORDER BY a.updated_at DESC, a.id DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 100, 500));

  return db.prepare(sql).all(...params).map(a => ({
    ...a,
    size_label: formatBytes(a.size_bytes),
    type_label: a.asset_type === 'recording' ? 'Запис' : 'Чат',
  }));
}

export function moveAssets(assetIds, targetServerId) {
  if (!Array.isArray(assetIds) || !assetIds.length) {
    throw new ValidationError('Оберіть файли для переміщення');
  }

  const target = db.prepare('SELECT * FROM storage_servers WHERE id = ? AND is_active = 1').get(targetServerId);
  if (!target) throw new NotFoundError('Цільовий сервер не знайдено');

  recordingsDir(target);
  chatDir(target);

  const moved = [];
  const errors = [];

  const tx = db.transaction(() => {
    for (const assetId of assetIds) {
      const asset = db.prepare('SELECT * FROM storage_assets WHERE id = ?').get(assetId);
      if (!asset) {
        errors.push({ assetId, error: 'not_found' });
        continue;
      }
      if (asset.server_id === target.id) continue;

      const source = db.prepare('SELECT * FROM storage_servers WHERE id = ?').get(asset.server_id);
      if (!source) {
        errors.push({ assetId, error: 'source_missing' });
        continue;
      }

      const srcPath = join(source.root_path, asset.relative_path);
      const destPath = join(target.root_path, asset.relative_path);

      if (!existsSync(srcPath)) {
        errors.push({ assetId, error: 'file_missing', path: srcPath });
        continue;
      }

      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
      unlinkSync(srcPath);

      db.prepare(`
        UPDATE storage_assets SET server_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(target.id, asset.id);

      moved.push(asset.id);
    }
  });

  tx();

  return { moved: moved.length, errors };
}

export { formatBytes };
