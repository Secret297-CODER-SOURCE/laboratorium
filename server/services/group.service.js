import db from '../db/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { STUDENT_MEMBER_ROLES } from '../utils/roles.js';

function mapGroup(row) {
  if (!row) return null;
  return { ...row, is_active: !!row.is_active, member_count: row.member_count ?? 0 };
}

function assertTeacherAccess(group, actorId, actorRole) {
  if (!group) throw new NotFoundError('Групу не знайдено');
  if (actorRole === 'owner' || actorRole === 'developer') return;
  if (group.teacher_id !== actorId) throw new ForbiddenError('Немає доступу до цієї групи');
}

export function listGroups(actorId, actorRole, { all = false } = {}) {
  let sql = `
    SELECT g.*, p.name as program_name,
      (SELECT COUNT(*) FROM study_group_members gm WHERE gm.group_id = g.id) as member_count
    FROM study_groups g
    LEFT JOIN programs p ON p.id = g.program_id
    WHERE g.is_active = 1
  `;
  const params = [];

  if (!all && actorRole === 'teacher') {
    sql += ' AND g.teacher_id = ?';
    params.push(actorId);
  }

  sql += ' ORDER BY g.sort_order, g.name';
  return db.prepare(sql).all(...params).map(mapGroup);
}

export function getGroupById(id) {
  const row = db.prepare(`
    SELECT g.*, p.name as program_name,
      (SELECT COUNT(*) FROM study_group_members gm WHERE gm.group_id = g.id) as member_count
    FROM study_groups g
    LEFT JOIN programs p ON p.id = g.program_id
    WHERE g.id = ?
  `).get(id);
  return mapGroup(row);
}

export function createGroup(actorId, actorRole, data) {
  if (!['teacher', 'owner', 'developer'].includes(actorRole)) {
    throw new ForbiddenError();
  }
  const name = data.name?.trim();
  if (!name) throw new ValidationError('Вкажіть назву групи');

  const teacherId = actorRole === 'teacher' ? actorId : (parseInt(data.teacher_id, 10) || actorId);
  const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role IN ('teacher','owner')").get(teacherId);
  if (!teacher && actorRole === 'teacher') throw new ValidationError('Невірний викладач');

  const result = db.prepare(`
    INSERT INTO study_groups (name, description, teacher_id, program_id, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    data.description?.trim() || null,
    teacherId,
    data.program_id ? parseInt(data.program_id, 10) : null,
    data.color?.trim() || null,
    parseInt(data.sort_order, 10) || 0,
  );

  return getGroupById(result.lastInsertRowid);
}

export function updateGroup(id, actorId, actorRole, data) {
  const group = getGroupById(id);
  assertTeacherAccess(group, actorId, actorRole);

  const name = data.name?.trim() || group.name;
  db.prepare(`
    UPDATE study_groups SET name = ?, description = ?, program_id = ?, color = ?,
      sort_order = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name,
    data.description !== undefined ? (data.description?.trim() || null) : group.description,
    data.program_id !== undefined ? (data.program_id ? parseInt(data.program_id, 10) : null) : group.program_id,
    data.color !== undefined ? (data.color?.trim() || null) : group.color,
    data.sort_order !== undefined ? (parseInt(data.sort_order, 10) || 0) : group.sort_order,
    data.is_active === false ? 0 : 1,
    id,
  );

  return getGroupById(id);
}

export function deleteGroup(id, actorId, actorRole) {
  const group = getGroupById(id);
  assertTeacherAccess(group, actorId, actorRole);
  db.prepare(`UPDATE study_groups SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  return { ok: true };
}

export function listGroupMembers(groupId, actorId, actorRole) {
  const group = getGroupById(groupId);
  assertTeacherAccess(group, actorId, actorRole);

  return db.prepare(`
    SELECT u.id, u.name, u.handle, u.email, u.bounty_points, gm.joined_at, gm.member_role
    FROM study_group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND u.role = 'student'
    ORDER BY u.name
  `).all(groupId);
}

export function listAvailableStudents(actorId, actorRole, groupId = null) {
  let excludeSql = '';
  const params = [];
  if (groupId) {
    const group = getGroupById(groupId);
    assertTeacherAccess(group, actorId, actorRole);
    excludeSql = ' AND u.id NOT IN (SELECT user_id FROM study_group_members WHERE group_id = ?)';
    params.push(groupId);
  }

  return db.prepare(`
    SELECT u.id, u.name, u.handle, u.email, u.bounty_points
    FROM users u
    WHERE u.role = 'student' ${excludeSql}
    ORDER BY u.name LIMIT 200
  `).all(...params);
}

export function addGroupMembers(groupId, actorId, actorRole, userIds) {
  const group = getGroupById(groupId);
  assertTeacherAccess(group, actorId, actorRole);

  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(id => parseInt(id, 10)).filter(Boolean))];
  if (!ids.length) throw new ValidationError('Оберіть учнів');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `);

  const tx = db.transaction((items) => {
    for (const uid of items) {
      const student = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(uid);
      if (student) insert.run(groupId, uid, actorId);
    }
  });
  tx(ids);

  return listGroupMembers(groupId, actorId, actorRole);
}

export function removeGroupMember(groupId, userId, actorId, actorRole) {
  const group = getGroupById(groupId);
  assertTeacherAccess(group, actorId, actorRole);
  db.prepare('DELETE FROM study_group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  return { ok: true };
}

export function updateMemberRole(groupId, userId, memberRole, actorId, actorRole) {
  const group = getGroupById(groupId);
  assertTeacherAccess(group, actorId, actorRole);

  if (!STUDENT_MEMBER_ROLES.includes(memberRole)) {
    throw new ValidationError('Невідома роль учня');
  }

  const member = db.prepare(`
    SELECT gm.id FROM study_group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND gm.user_id = ? AND u.role = 'student'
  `).get(groupId, userId);

  if (!member) throw new NotFoundError('Учня не знайдено в групі');

  db.prepare('UPDATE study_group_members SET member_role = ? WHERE group_id = ? AND user_id = ?')
    .run(memberRole, groupId, userId);

  return listGroupMembers(groupId, actorId, actorRole).find(m => m.id === userId);
}

export function getTeacherStudents(teacherId) {
  return db.prepare(`
    SELECT DISTINCT u.id, u.name, u.handle, u.bounty_points, u.email,
      GROUP_CONCAT(g.name, ', ') as group_names
    FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    JOIN users u ON u.id = gm.user_id
    WHERE g.teacher_id = ? AND u.role = 'student'
    GROUP BY u.id
    ORDER BY u.name
    LIMIT 200
  `).all(teacherId);
}
