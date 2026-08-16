import { mkdirSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';
import db from '../db/index.js';
import * as storageService from './storage.service.js';
import * as groupService from './group.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import config from '../config/index.js';

if (!existsSync(config.uploads.chatDir)) {
  mkdirSync(config.uploads.chatDir, { recursive: true });
}

const MSG_TYPES = ['text', 'sticker', 'gif', 'video', 'image', 'system'];

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    channel_id: row.channel_id,
    user_id: row.user_id,
    handle: row.handle,
    name: row.name,
    body: row.body,
    msg_type: row.msg_type,
    attachment_url: row.attachment_url,
    created_at: row.created_at,
  };
}

function normalizePair(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function userHasGroupAccess(groupId, userId, userRole) {
  const group = groupService.getGroupById(groupId);
  if (!group) return false;
  if (['owner', 'developer'].includes(userRole)) return true;
  if (group.teacher_id === userId) return true;
  const member = db.prepare(
    'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?',
  ).get(groupId, userId);
  return !!member;
}

function assertChannelAccess(channelId, userId, userRole) {
  const channel = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(channelId);
  if (!channel) throw new NotFoundError('Чат не знайдено');

  if (channel.type === 'group') {
    if (!userHasGroupAccess(channel.group_id, userId, userRole)) {
      throw new ForbiddenError('Немає доступу до чату групи');
    }
    return channel;
  }

  const member = db.prepare(
    'SELECT 1 FROM chat_channel_members WHERE channel_id = ? AND user_id = ?',
  ).get(channelId, userId);
  if (!member && !['owner', 'developer'].includes(userRole)) {
    throw new ForbiddenError('Немає доступу до чату');
  }
  return channel;
}

function usersShareGroup(userA, userB) {
  const row = db.prepare(`
    SELECT 1 FROM study_group_members gm1
    JOIN study_group_members gm2 ON gm2.group_id = gm1.group_id
  JOIN study_groups g ON g.id = gm1.group_id AND g.is_active = 1
    WHERE gm1.user_id = ? AND gm2.user_id = ?
    LIMIT 1
  `).get(userA, userB);
  if (row) return true;

  return !!db.prepare(`
    SELECT 1 FROM study_groups g
    WHERE g.is_active = 1 AND (
      (g.teacher_id = ? AND EXISTS (SELECT 1 FROM study_group_members gm WHERE gm.group_id = g.id AND gm.user_id = ?))
      OR (g.teacher_id = ? AND EXISTS (SELECT 1 FROM study_group_members gm WHERE gm.group_id = g.id AND gm.user_id = ?))
    )
    LIMIT 1
  `).get(userA, userB, userB, userA);
}

function syncGroupChannelMembers(channelId, groupId) {
  const group = groupService.getGroupById(groupId);
  if (!group) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO chat_channel_members (channel_id, user_id) VALUES (?, ?)
  `);
  insert.run(channelId, group.teacher_id);

  const members = db.prepare(`
    SELECT user_id FROM study_group_members WHERE group_id = ?
  `).all(groupId);
  for (const m of members) insert.run(channelId, m.user_id);
}

export function ensureGroupChannel(groupId) {
  let channel = db.prepare("SELECT * FROM chat_channels WHERE type = 'group' AND group_id = ?").get(groupId);
  if (!channel) {
    const result = db.prepare(`
      INSERT INTO chat_channels (type, group_id) VALUES ('group', ?)
    `).run(groupId);
    channel = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(result.lastInsertRowid);
  }
  syncGroupChannelMembers(channel.id, groupId);
  return channel;
}

function getLastMessage(channelId) {
  return db.prepare(`
    SELECT m.*, u.handle, u.name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ?
    ORDER BY m.created_at DESC LIMIT 1
  `).get(channelId);
}

export function getInbox(userId, userRole) {
  const groups = listMyGroups(userId, userRole).map(g => {
    const channel = ensureGroupChannel(g.id);
    const last = getLastMessage(channel.id);
    return {
      ...g,
      channel_id: channel.id,
      last_message: last ? mapMessage(last) : null,
    };
  });

  const dms = db.prepare(`
    SELECT c.id as channel_id, dp.user_a_id, dp.user_b_id,
      CASE WHEN dp.user_a_id = ? THEN dp.user_b_id ELSE dp.user_a_id END as peer_id
    FROM chat_dm_pairs dp
    JOIN chat_channels c ON c.id = dp.channel_id
    WHERE dp.user_a_id = ? OR dp.user_b_id = ?
    ORDER BY c.created_at DESC
  `).all(userId, userId, userId).map(row => {
    const peer = db.prepare('SELECT id, name, handle FROM users WHERE id = ?').get(row.peer_id);
    const last = getLastMessage(row.channel_id);
    return {
      channel_id: row.channel_id,
      peer,
      last_message: last ? mapMessage(last) : null,
    };
  });

  return { groups, dms };
}

export function listMyGroups(userId, userRole) {
  if (['owner', 'developer'].includes(userRole)) {
    return groupService.listGroups(userId, userRole, { all: true }).map(g => {
      const isMember = !!db.prepare(
        'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?',
      ).get(g.id, userId);
      const isTeacher = g.teacher_id === userId;
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        description: g.description,
        program_name: g.program_name,
        member_count: g.member_count,
        role: isTeacher ? 'teacher' : (isMember ? 'student' : 'observer'),
        is_observer: !isMember && !isTeacher,
      };
    });
  }

  if (userRole === 'teacher') {
    return groupService.listGroups(userId, userRole).map(g => ({
      id: g.id,
      name: g.name,
      color: g.color,
      description: g.description,
      program_name: g.program_name,
      member_count: g.member_count,
      role: 'teacher',
      is_observer: false,
    }));
  }

  return db.prepare(`
    SELECT g.id, g.name, g.color, g.description, p.name as program_name,
      (SELECT COUNT(*) FROM study_group_members gm2 WHERE gm2.group_id = g.id) as member_count,
      gm.member_role,
      u.name as teacher_name, u.handle as teacher_handle
    FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    LEFT JOIN programs p ON p.id = g.program_id
    JOIN users u ON u.id = g.teacher_id
    WHERE gm.user_id = ?
    ORDER BY g.name
  `).all(userId).map(g => ({ ...g, role: g.member_role || 'student' }));
}

export function getGroupChannel(groupId, userId, userRole) {
  if (!userHasGroupAccess(groupId, userId, userRole)) {
    throw new ForbiddenError('Немає доступу до групи');
  }
  const channel = ensureGroupChannel(groupId);
  const group = groupService.getGroupById(groupId);
  const members = db.prepare(`
    SELECT u.id, u.name, u.handle, gm.member_role
    FROM study_group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    UNION
    SELECT u.id, u.name, u.handle, 'teacher' as member_role
    FROM users u WHERE u.id = ?
  `).all(groupId, group.teacher_id);

  return { channel, group, members };
}

export function getGroupRanking(groupId, userId, userRole) {
  if (!userHasGroupAccess(groupId, userId, userRole)) {
    throw new ForbiddenError('Немає доступу до групи');
  }

  const group = groupService.getGroupById(groupId);
  const teacher = db.prepare(`
    SELECT id, name, handle, bounty_points FROM users WHERE id = ?
  `).get(group.teacher_id);

  const students = db.prepare(`
    SELECT u.id, u.name, u.handle, u.bounty_points, gm.member_role,
      (SELECT COUNT(*) FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE ta.user_id = u.id AND t.group_id = ? AND ta.status = 'completed') AS tasks_completed,
      (SELECT COUNT(*) FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        WHERE ta.user_id = u.id AND t.group_id = ? AND ta.status IN ('taken','review')) AS tasks_active
    FROM study_group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.bounty_points DESC, tasks_completed DESC, u.handle ASC
  `).all(groupId, groupId, groupId).map((m, i) => ({
    ...m,
    rank: i + 1,
    tier: m.bounty_points >= 2000 ? 'Elite' : m.bounty_points >= 1000 ? 'Pro' : m.bounty_points >= 500 ? 'Rising' : 'Starter',
  }));

  const isObserver = ['owner', 'developer'].includes(userRole)
    && !db.prepare('SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId)
    && group.teacher_id !== userId;

  return {
    group,
    teacher,
    students,
    is_observer: !!isObserver,
  };
}

export function listGroupDms(groupId, userId, userRole) {
  if (!userHasGroupAccess(groupId, userId, userRole)) {
    throw new ForbiddenError('Немає доступу до групи');
  }

  const candidates = listDmCandidates(userId, userRole, groupId);
  const candidateIds = new Set(candidates.map(c => c.id));

  return db.prepare(`
    SELECT c.id as channel_id, dp.user_a_id, dp.user_b_id,
      CASE WHEN dp.user_a_id = ? THEN dp.user_b_id ELSE dp.user_a_id END as peer_id
    FROM chat_dm_pairs dp
    JOIN chat_channels c ON c.id = dp.channel_id
    WHERE dp.user_a_id = ? OR dp.user_b_id = ?
  `).all(userId, userId, userId)
    .filter(row => candidateIds.has(row.peer_id))
    .map(row => {
      const peer = db.prepare('SELECT id, name, handle FROM users WHERE id = ?').get(row.peer_id);
      const last = getLastMessage(row.channel_id);
      return {
        channel_id: row.channel_id,
        peer,
        last_message: last ? mapMessage(last) : null,
      };
    });
}

export function getOrCreateDm(userId, targetUserId, userRole) {
  const targetId = parseInt(targetUserId, 10);
  if (!targetId || targetId === userId) {
    throw new ValidationError('Оберіть користувача для повідомлення');
  }

  const target = db.prepare('SELECT id, name, handle FROM users WHERE id = ?').get(targetId);
  if (!target) throw new NotFoundError('Користувача не знайдено');

  if (!usersShareGroup(userId, targetId) && !['owner', 'developer'].includes(userRole)) {
    throw new ForbiddenError('Особисті повідомлення лише між учасниками однієї групи');
  }

  const [userA, userB] = normalizePair(userId, targetId);
  let pair = db.prepare('SELECT * FROM chat_dm_pairs WHERE user_a_id = ? AND user_b_id = ?').get(userA, userB);

  if (!pair) {
    const tx = db.transaction(() => {
      const ch = db.prepare("INSERT INTO chat_channels (type) VALUES ('dm')").run();
      const channelId = ch.lastInsertRowid;
      db.prepare('INSERT INTO chat_dm_pairs (channel_id, user_a_id, user_b_id) VALUES (?, ?, ?)')
        .run(channelId, userA, userB);
      db.prepare('INSERT INTO chat_channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, userA);
      db.prepare('INSERT INTO chat_channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, userB);
      return channelId;
    });
    const channelId = tx();
    pair = db.prepare('SELECT * FROM chat_dm_pairs WHERE channel_id = ?').get(channelId);
  }

  return {
    channel_id: pair.channel_id,
    peer: target,
  };
}

export function listDmCandidates(userId, userRole, groupId = null) {
  if (groupId) {
    if (!userHasGroupAccess(groupId, userId, userRole)) throw new ForbiddenError();
    const group = groupService.getGroupById(groupId);
    const members = db.prepare(`
      SELECT u.id, u.name, u.handle FROM study_group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? AND u.id != ?
    `).all(groupId, userId);
    if (group.teacher_id !== userId) {
      const teacher = db.prepare('SELECT id, name, handle FROM users WHERE id = ?').get(group.teacher_id);
      if (teacher) members.unshift(teacher);
    }
    return members;
  }

  const seen = new Set([userId]);
  const result = [];
  for (const g of listMyGroups(userId, userRole)) {
    const ch = ensureGroupChannel(g.id);
    const members = db.prepare(`
      SELECT u.id, u.name, u.handle FROM chat_channel_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = ? AND u.id != ?
    `).all(ch.id, userId);
    for (const m of members) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        result.push(m);
      }
    }
  }
  return result;
}

export function getMessages(channelId, userId, userRole, { limit = 80, before } = {}) {
  assertChannelAccess(channelId, userId, userRole);
  let sql = `
    SELECT m.*, u.handle, u.name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ?
  `;
  const params = [channelId];
  if (before) {
    sql += ' AND m.id < ?';
    params.push(parseInt(before, 10));
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 80, 200));

  const rows = db.prepare(sql).all(...params).reverse();
  db.prepare(`
    UPDATE chat_channel_members SET last_read_at = datetime('now')
    WHERE channel_id = ? AND user_id = ?
  `).run(channelId, userId);

  return rows.map(mapMessage);
}

export function sendMessage(channelId, userId, userRole, { body, msg_type = 'text', attachment_url }) {
  assertChannelAccess(channelId, userId, userRole);

  const type = MSG_TYPES.includes(msg_type) ? msg_type : 'text';
  const text = body?.trim() || null;
  const url = attachment_url?.trim() || null;

  if (type === 'text' && !text) throw new ValidationError('Порожнє повідомлення');
  if (['sticker', 'gif', 'video', 'image'].includes(type) && !text && !url) {
    throw new ValidationError('Додайте вкладення або текст');
  }

  if (url && !url.startsWith('/uploads/') && !url.startsWith('http://') && !url.startsWith('https://')) {
    throw new ValidationError('Некоректне посилання');
  }

  const user = db.prepare('SELECT handle, name FROM users WHERE id = ?').get(userId);
  const result = db.prepare(`
    INSERT INTO chat_messages (channel_id, user_id, body, msg_type, attachment_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(channelId, userId, text, type, url);

  const messageId = result.lastInsertRowid;

  if (url?.startsWith('/uploads/chat/')) {
    const filename = url.replace('/uploads/chat/', '');
    let size = 0;
    try {
      const path = storageService.getChatFilePath(url);
      if (existsSync(path)) size = statSync(path).size;
    } catch { /* ignore */ }
    try {
      storageService.registerChat(messageId, filename, size);
    } catch { /* ignore */ }
  }

  return mapMessage({
    id: messageId,
    channel_id: channelId,
    user_id: userId,
    body: text,
    msg_type: type,
    attachment_url: url,
    created_at: new Date().toISOString(),
    handle: user?.handle,
    name: user?.name,
  });
}

export function chatUploadUrl(filename) {
  return `/uploads/chat/${filename}`;
}
