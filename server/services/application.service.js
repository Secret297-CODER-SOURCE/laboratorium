import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import { isValidEmail } from '../utils/validators.js';
import * as referralService from './referral.service.js';
import * as crmService from './crm.service.js';
import * as notificationService from './notification.service.js';
import * as mailService from './mail.service.js';
import { getPolicy } from './access-policy.service.js';
import config from '../config/index.js';

function notifyOwnersAboutLead(application) {
  const owners = db.prepare(`
    SELECT id, email FROM users WHERE role IN ('owner', 'developer') AND IFNULL(is_frozen, 0) = 0
  `).all();
  if (!owners.length) return;

  const title = `Нова заявка: ${application.name}`;
  const body = [
    application.name,
    application.email,
    application.program,
  ].filter(Boolean).join(' · ');

  notificationService.notifyUsers(owners.map((o) => o.id), {
    type: 'crm_lead',
    title,
    body,
    link: '/admin.html?tab=applications',
    data: { applicationId: application.id },
  });

  const emails = [...new Set([
    ...owners.map((o) => o.email).filter(Boolean),
    config.contactEmail,
  ].filter(Boolean))];

  for (const to of emails) {
    mailService.sendNewLeadEmail(to, application).catch((err) => {
      console.error('[applications] lead mail failed:', err.message);
    });
  }
}

export async function create({
  name, email, program, message, phone, userId = null, direction_id = null, referral_code = '',
  company_name = '', job_title = '', team_size = '', intent = 'individual',
}) {
  if (!name?.trim() || !email?.trim()) {
    throw new ValidationError('Заповніть обов\'язкові поля');
  }
  const callbackPhone = typeof phone === 'string' ? phone.trim() : '';
  const phoneDigits = callbackPhone.match(/\d/g) || [];
  if (callbackPhone.length > 32 || !/^\+?[0-9][0-9\s().-]{5,30}$/.test(callbackPhone)
    || phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new ValidationError('Вкажіть номер телефону для зворотного зв’язку');
  }
  if (!program?.trim() && !direction_id) {
    throw new ValidationError('Оберіть напрямок');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Некоректний email');
  }

  const intentValue = ['individual', 'corporate', 'team'].includes(String(intent))
    ? String(intent)
    : 'individual';

  let programLabel = program?.trim() || '';
  if (direction_id) {
    const dir = db.prepare('SELECT name FROM directions WHERE id = ?').get(direction_id);
    if (dir) programLabel = dir.name;
  }

  let referrer = referralService.getReferrer(referral_code, { userId, email });
  if (!referrer) {
    const linkedUser = userId
      ? db.prepare('SELECT referred_by_user_id, referred_by_program_id FROM users WHERE id = ?').get(userId)
      : db.prepare('SELECT referred_by_user_id, referred_by_program_id FROM users WHERE email = ?').get(email.toLowerCase());
    const referrerId = linkedUser?.referred_by_user_id;
    const referrerUser = referrerId
      ? db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(referrerId)
      : null;
    if (referrerUser && referrerUser.id !== userId) {
      referrer = { userId: referrerUser.id, programId: linkedUser?.referred_by_program_id || null };
    }
  }

  const insert = db.prepare(`
    INSERT INTO applications (
      name, email, callback_phone, program, message, user_id, status, direction_id, referrer_id,
      referral_program_id, analytics_campaign_code, company_name, job_title, team_size, intent
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    email.toLowerCase(),
    callbackPhone,
    programLabel,
    message?.trim() || '',
    userId,
    direction_id || null,
    referrer?.userId || null,
    referrer?.programId || null,
    null,
    String(company_name || '').trim().slice(0, 160) || null,
    String(job_title || '').trim().slice(0, 120) || null,
    String(team_size || '').trim().slice(0, 40) || null,
    intentValue,
  );

  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(insert.lastInsertRowid);
  try {
    crmService.ingestApplication(application);
  } catch (err) {
    console.error('[applications] CRM ingest failed:', err.message);
  }

  try {
    notifyOwnersAboutLead(application);
  } catch (err) {
    console.error('[applications] owner notify failed:', err.message);
  }

  return true;
}

export function listForUser(userId) {
  return db.prepare(`
    SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId);
}

export function getLeaderboard(limit = 20, { viewerId = null, viewerRole = null } = {}) {
  const policy = getPolicy().leaderboard;

  const globalBoard = () => db.prepare(`
    SELECT id, handle, name, bounty_points, profile_public FROM users
    WHERE role = 'student'
    ORDER BY bounty_points DESC LIMIT ?
  `).all(limit);

  if (!viewerId) {
    return policy.guestMode === 'global' ? globalBoard() : [];
  }

  if (['owner', 'developer'].includes(viewerRole)
    || (viewerRole === 'teacher' && policy.teacherSeesGlobal)) {
    return globalBoard();
  }

  if (viewerRole === 'teacher') {
    return db.prepare(`
      SELECT DISTINCT u.id, u.handle, u.name, u.bounty_points, u.profile_public
      FROM users u
      JOIN study_group_members gm ON gm.user_id = u.id
      JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1 AND g.teacher_id = ?
      WHERE u.role = 'student'
      ORDER BY u.bounty_points DESC LIMIT ?
    `).all(viewerId, limit);
  }

  const mode = policy.studentMode || 'classmates';
  if (mode === 'hidden') return [];
  if (mode === 'global') return globalBoard();

  return db.prepare(`
    SELECT DISTINCT u.id, u.handle, u.name, u.bounty_points, u.profile_public
    FROM users u
    WHERE u.role = 'student'
      AND (
        u.id = ?
        OR u.id IN (
          SELECT gm2.user_id FROM study_group_members gm1
          JOIN study_group_members gm2 ON gm2.group_id = gm1.group_id
          JOIN study_groups g ON g.id = gm1.group_id AND g.is_active = 1
          WHERE gm1.user_id = ?
        )
      )
    ORDER BY u.bounty_points DESC
    LIMIT ?
  `).all(viewerId, viewerId, limit);
}
