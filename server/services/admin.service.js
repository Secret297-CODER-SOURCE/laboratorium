import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { canAssignRole, ROLES } from '../utils/roles.js';
import db from '../db/index.js';
import { getStats } from '../db/index.js';
import { sanitizeUser } from '../utils/tier.js';
import * as userService from './user.service.js';
import * as groupService from './group.service.js';

export function getPlatformStats() {
  const dbStats = getStats();
  const apps = db.prepare(`SELECT status, COUNT(*) as c FROM applications GROUP BY status`).all();
  const confs = db.prepare(`SELECT status, COUNT(*) as c FROM conferences GROUP BY status`).all();
  const recordings = db.prepare('SELECT COUNT(*) as c FROM recordings').get().c;
  return { db: dbStats, applications: apps, conferences: confs, recordings };
}

export function listUsers(actorRole) {
  const users = db.prepare(`
    SELECT id, email, name, handle, role, bounty_points, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  if (actorRole === 'owner') {
    return users.filter(u => u.role !== 'developer');
  }
  return users;
}

export function getOwnerDashboard() {
  const stats = getPlatformStats();
  const users = listUsers('owner');
  const applications = listApplications();

  const conferences = db.prepare(`
    SELECT c.*, u.name as host_name, u.handle as host_handle,
      (SELECT COUNT(*) FROM conference_participants cp WHERE cp.conference_id = c.id) as participant_count
    FROM conferences c
    JOIN users u ON u.id = c.host_user_id
    ORDER BY c.scheduled_at DESC LIMIT 50
  `).all();

  const recordings = db.prepare(`
    SELECT r.*, u.handle as uploader_handle, c.title as conference_title
    FROM recordings r
    JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN conferences c ON c.id = r.conference_id
    ORDER BY r.created_at DESC LIMIT 50
  `).all();

  const students = db.prepare(`
    SELECT u.id, u.name, u.handle, u.bounty_points, u.email, u.role,
      (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) as programs_count
    FROM users u
    WHERE u.role = 'student'
    ORDER BY u.created_at DESC LIMIT 100
  `).all();

  return { stats, users, applications, conferences, recordings, students };
}

export function updateUserRole(actorId, actorRole, userId, newRole) {
  if (!ROLES.includes(newRole)) throw new ValidationError('Невірна роль');
  if (!canAssignRole(actorRole, newRole)) throw new ForbiddenError('Немає прав змінювати цю роль');

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) throw new NotFoundError('Користувача не знайдено');
  if (target.id === actorId && newRole !== actorRole) {
    throw new ForbiddenError('Не можна змінити власну роль');
  }
  if (actorRole === 'owner' && target.role === 'developer') {
    throw new ForbiddenError('Немає доступу до цього користувача');
  }

  db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(newRole, userId);
  return sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

export function listApplications(status) {
  let sql = `SELECT a.*, u.name as user_name, u.handle as user_handle
    FROM applications a LEFT JOIN users u ON u.id = a.user_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  sql += ' ORDER BY a.created_at DESC';
  return db.prepare(sql).all(...params);
}

export async function updateApplicationStatus(id, status, createAccount = false, actor = null) {
  const valid = ['pending', 'approved', 'rejected'];
  if (!valid.includes(status)) throw new ValidationError('Невірний статус');
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!app) throw new NotFoundError('Заявку не знайдено');
  db.prepare(`UPDATE applications SET status = ? WHERE id = ?`).run(status, id);

  let account = null;
  if (createAccount && status === 'approved' && actor) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(app.email);
    if (!existing) {
      account = await userService.adminCreateUser({
        name: app.name,
        email: app.email,
        role: 'student',
        sendEmail: true,
      });
    }
  }

  return {
    application: db.prepare('SELECT * FROM applications WHERE id = ?').get(id),
    account: account ? { user: userService.toPublic(account.user) } : null,
  };
}

export function getTeacherDashboard(teacherId) {
  const conferences = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM conference_participants cp WHERE cp.conference_id = c.id) as participant_count
    FROM conferences c WHERE c.host_user_id = ? ORDER BY c.scheduled_at DESC LIMIT 20
  `).all(teacherId);

  const groups = groupService.listGroups(teacherId, 'teacher');
  const students = groupService.getTeacherStudents(teacherId);

  const recordings = db.prepare(`
    SELECT r.*, c.title as conference_title
    FROM recordings r LEFT JOIN conferences c ON c.id = r.conference_id
    WHERE r.uploaded_by = ? OR c.host_user_id = ?
    ORDER BY r.created_at DESC LIMIT 20
  `).all(teacherId, teacherId);

  return { conferences, students, recordings, groups };
}

export function getDeveloperInfo() {
  const stats = getPlatformStats();
  const recentUsers = db.prepare(`
    SELECT id, email, name, handle, role, created_at FROM users ORDER BY created_at DESC LIMIT 10
  `).all();
  return {
    ...stats,
    recentUsers,
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}
