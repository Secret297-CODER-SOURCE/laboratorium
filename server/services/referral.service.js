import { randomBytes } from 'node:crypto';
import config from '../config/index.js';
import db from '../db/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase().slice(0, 32) : '';
}

export function getReferrer(code, { userId = null, email = '' } = {}) {
  const value = normalizeCode(code);
  if (!value) return null;
  const programRow = db.prepare(`
    SELECT rpc.user_id, rpc.program_id, u.email, u.role
    FROM referral_program_codes rpc
    JOIN referral_programs rp ON rp.id = rpc.program_id
    JOIN users u ON u.id = rpc.user_id
    WHERE rpc.code = ? AND rpc.is_active = 1 AND rp.is_active = 1
  `).get(value);
  if (programRow) {
    if (programRow.role !== 'student' || programRow.user_id === userId
      || (email && programRow.email.toLowerCase() === email.toLowerCase())) return null;
    return { userId: programRow.user_id, code: value, programId: programRow.program_id };
  }
  const row = db.prepare(`
    SELECT rc.user_id, u.email, u.role
    FROM referral_codes rc JOIN users u ON u.id = rc.user_id
    WHERE rc.code = ? AND rc.is_active = 1
  `).get(value);
  if (!row || row.role !== 'student' || row.user_id === userId
    || (email && row.email.toLowerCase() === email.toLowerCase())) return null;
  return { userId: row.user_id, code: value, programId: null };
}

export function assignReferrerToUser(userId, code) {
  const referrer = getReferrer(code, { userId });
  if (!referrer) return null;
  db.prepare(`
    UPDATE users SET referred_by_user_id = ?, referred_by_program_id = ?
    WHERE id = ? AND referred_by_user_id IS NULL
  `).run(referrer.userId, referrer.programId, userId);
  return referrer.userId;
}

export function ensureReferralCode(userId) {
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!user || user.role !== 'student') throw new NotFoundError('Учня не знайдено');
  const existing = db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').get(userId);
  if (existing) return existing.code;

  let code;
  do {
    code = randomBytes(5).toString('hex').toUpperCase();
  } while (db.prepare('SELECT id FROM referral_codes WHERE code = ?').get(code));
  db.prepare('INSERT INTO referral_codes (user_id, code) VALUES (?, ?)').run(userId, code);
  return code;
}

function programAppliesToStudent(programId, userId) {
  return !!db.prepare(`
    SELECT rp.id FROM referral_programs rp
    WHERE rp.id = ? AND rp.is_active = 1
      AND (rp.apply_to_all = 1 OR EXISTS (
        SELECT 1 FROM referral_program_assignments rpa
        WHERE rpa.program_id = rp.id AND rpa.user_id = ?
      ))
  `).get(programId, userId);
}

function ensureProgramCode(userId, programId) {
  if (!programAppliesToStudent(programId, userId)) return null;
  let row = db.prepare(`
    SELECT code FROM referral_program_codes WHERE program_id = ? AND user_id = ?
  `).get(programId, userId);
  if (row) {
    db.prepare('UPDATE referral_program_codes SET is_active = 1 WHERE program_id = ? AND user_id = ?')
      .run(programId, userId);
    return row.code;
  }
  let code;
  do {
    code = randomBytes(5).toString('hex').toUpperCase();
  } while (db.prepare('SELECT id FROM referral_program_codes WHERE code = ?').get(code)
    || db.prepare('SELECT id FROM referral_codes WHERE code = ?').get(code));
  db.prepare(`
    INSERT INTO referral_program_codes (program_id, user_id, code) VALUES (?, ?, ?)
  `).run(programId, userId, code);
  return code;
}

export function listStudentReferralPrograms(userId) {
  const programs = db.prepare(`
    SELECT rp.* FROM referral_programs rp
    WHERE rp.is_active = 1 AND (
      rp.apply_to_all = 1 OR EXISTS (
        SELECT 1 FROM referral_program_assignments rpa
        WHERE rpa.program_id = rp.id AND rpa.user_id = ?
      )
    )
    ORDER BY rp.id
  `).all(userId);
  return programs.map(program => {
    const code = ensureProgramCode(userId, program.id);
    return {
      id: program.id,
      name: program.name,
      description: program.description,
      reward_points: program.reward_points,
      credit_amount: program.credit_amount,
      link: `${config.siteUrl.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`,
    };
  }).filter(program => !!program.link);
}

export function listOwnerReferralPrograms() {
  const students = db.prepare(`
    SELECT id, name, handle FROM users WHERE role = 'student' ORDER BY name COLLATE NOCASE
  `).all();
  const assignments = db.prepare(`
    SELECT program_id, user_id FROM referral_program_assignments
  `).all();
  const byProgram = new Map();
  for (const assignment of assignments) {
    if (!byProgram.has(assignment.program_id)) byProgram.set(assignment.program_id, []);
    byProgram.get(assignment.program_id).push(assignment.user_id);
  }
  const programs = db.prepare('SELECT * FROM referral_programs ORDER BY id DESC').all()
    .map(program => ({
      ...program,
      is_active: !!program.is_active,
      apply_to_all: !!program.apply_to_all,
      user_ids: byProgram.get(program.id) || [],
    }));
  return { programs, students };
}

export function saveReferralProgram(input = {}, id = null) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const rewardPoints = Number(input.reward_points);
  const creditAmount = Number(input.credit_amount);
  const maxRewards = Number(input.max_rewards_per_user);
  const applyToAll = input.apply_to_all === true;
  const isActive = input.is_active !== false;
  const rawUserIds = input.user_ids ?? [];
  if (!name || name.length > 100 || description.length > 500
    || !Number.isInteger(rewardPoints) || rewardPoints < 0 || rewardPoints > 100000
    || !Number.isFinite(creditAmount) || creditAmount < 0 || creditAmount > 10000000
    || !Number.isInteger(maxRewards) || maxRewards < 0 || maxRewards > 100000
    || typeof applyToAll !== 'boolean' || typeof isActive !== 'boolean'
    || !Array.isArray(rawUserIds) || rawUserIds.length > 500
    || (!applyToAll && rawUserIds.length === 0)
    || (isActive && rewardPoints === 0 && creditAmount === 0)) {
    throw new ValidationError('Перевірте назву, аудиторію та параметри нагороди');
  }
  const userIds = [...new Set(rawUserIds.map(value => Number(value)))];
  if (userIds.some(userId => !Number.isInteger(userId) || userId < 1)) {
    throw new ValidationError('Некоректний список учнів');
  }
  const validCount = userIds.length
    ? db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'student' AND id IN (${userIds.map(() => '?').join(',')})`)
      .get(...userIds).count
    : 0;
  if (validCount !== userIds.length) throw new ValidationError('Список містить неіснуючого учня');
  if (id && !db.prepare('SELECT id FROM referral_programs WHERE id = ?').get(id)) {
    throw new NotFoundError('Реферальну програму не знайдено');
  }

  return db.transaction(() => {
    let programId = id;
    if (programId) {
      db.prepare(`
        UPDATE referral_programs
        SET name = ?, description = ?, reward_points = ?, credit_amount = ?,
            max_rewards_per_user = ?, is_active = ?, apply_to_all = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name, description, rewardPoints, creditAmount, maxRewards, isActive ? 1 : 0,
        applyToAll ? 1 : 0, programId);
      db.prepare('DELETE FROM referral_program_assignments WHERE program_id = ?').run(programId);
    } else {
      const result = db.prepare(`
        INSERT INTO referral_programs
          (name, description, reward_points, credit_amount, max_rewards_per_user, is_active, apply_to_all)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(name, description, rewardPoints, creditAmount, maxRewards, isActive ? 1 : 0, applyToAll ? 1 : 0);
      programId = result.lastInsertRowid;
    }
    const assign = db.prepare(`
      INSERT INTO referral_program_assignments (program_id, user_id) VALUES (?, ?)
    `);
    for (const userId of userIds) assign.run(programId, userId);
    db.prepare(`
      UPDATE referral_program_codes SET is_active = 0
      WHERE program_id = ? AND ? = 0
        AND user_id NOT IN (SELECT user_id FROM referral_program_assignments WHERE program_id = ?)
    `).run(programId, applyToAll ? 1 : 0, programId);
    return db.prepare('SELECT * FROM referral_programs WHERE id = ?').get(programId);
  })();
}

export function getSettings() {
  const settings = db.prepare('SELECT * FROM referral_settings WHERE id = 1').get();
  return {
    enabled: !!settings.enabled,
    reward_points: settings.reward_points,
    credit_amount: settings.credit_amount,
    max_rewards_per_user: settings.max_rewards_per_user,
  };
}

export function updateSettings(input = {}) {
  const enabled = input.enabled;
  const rewardPoints = Number(input.reward_points);
  const creditAmount = Number(input.credit_amount);
  const maxRewards = Number(input.max_rewards_per_user);
  if (typeof enabled !== 'boolean'
    || !Number.isInteger(rewardPoints) || rewardPoints < 0 || rewardPoints > 100000
    || !Number.isFinite(creditAmount) || creditAmount < 0 || creditAmount > 10000000
    || !Number.isInteger(maxRewards) || maxRewards < 0 || maxRewards > 100000
    || (enabled && rewardPoints === 0 && creditAmount === 0)) {
    throw new ValidationError('Перевірте параметри реферальної програми та нагороди');
  }
  db.prepare(`
    UPDATE referral_settings
    SET enabled = ?, reward_points = ?, credit_amount = ?, max_rewards_per_user = ?,
        updated_at = datetime('now')
    WHERE id = 1
  `).run(enabled ? 1 : 0, rewardPoints, creditAmount, maxRewards);
  return getSettings();
}

export function awardForApprovedApplication(applicationId, referredUserId = null) {
  return db.transaction(() => {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!application || application.status !== 'approved' || !application.referrer_id) return null;
    const referredId = referredUserId || application.user_id || null;
    if (referredId && referredId === application.referrer_id) return null;
    let settings;
    if (application.referral_program_id) {
      settings = db.prepare(`
        SELECT id AS program_id, is_active AS enabled, reward_points, credit_amount, max_rewards_per_user
        FROM referral_programs WHERE id = ?
      `).get(application.referral_program_id);
      if (!settings?.enabled) return null;
      if (!programAppliesToStudent(application.referral_program_id, application.referrer_id)) return null;
    } else {
      settings = { ...getSettings(), program_id: null };
      if (!settings.enabled) return null;
    }
    if (!settings.reward_points && !settings.credit_amount) return null;
    if (db.prepare('SELECT id FROM referral_rewards WHERE application_id = ?').get(applicationId)) return null;
    const referrer = db.prepare('SELECT role FROM users WHERE id = ?').get(application.referrer_id);
    if (!referrer || referrer.role !== 'student') return null;
    if (settings.max_rewards_per_user > 0) {
      const count = db.prepare('SELECT COUNT(*) AS count FROM referral_rewards WHERE referrer_id = ?')
        .get(application.referrer_id).count;
      const programCount = settings.program_id
        ? db.prepare('SELECT COUNT(*) AS count FROM referral_rewards WHERE referrer_id = ? AND program_id = ?')
          .get(application.referrer_id, settings.program_id).count
        : count;
      if (programCount >= settings.max_rewards_per_user) return null;
    }
    const reward = db.prepare(`
      INSERT INTO referral_rewards (application_id, referrer_id, referred_user_id, points_awarded, credit_awarded, program_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(applicationId, application.referrer_id, referredId, settings.reward_points, settings.credit_amount, settings.program_id);
    if (settings.reward_points > 0) {
      db.prepare(`UPDATE users SET bounty_points = bounty_points + ?, updated_at = datetime('now') WHERE id = ?`)
        .run(settings.reward_points, application.referrer_id);
      db.prepare('INSERT INTO bounty_log (user_id, amount, reason) VALUES (?, ?, ?)')
        .run(application.referrer_id, settings.reward_points, 'Реферальна нагорода за прийняту заявку');
    }
    if (settings.credit_amount > 0) {
      db.prepare('INSERT INTO referral_credits (user_id, reward_id, amount, remaining) VALUES (?, ?, ?, ?)')
        .run(application.referrer_id, reward.lastInsertRowid, settings.credit_amount, settings.credit_amount);
    }
    return db.prepare('SELECT * FROM referral_rewards WHERE id = ?').get(reward.lastInsertRowid);
  })();
}

export function getStudentSummary(userId) {
  const code = ensureReferralCode(userId);
  const settings = getSettings();
  const summary = db.prepare(`
    SELECT COUNT(*) AS accepted
    FROM referral_rewards WHERE referrer_id = ?
  `).get(userId);
  const credits = db.prepare(`
    SELECT COALESCE(SUM(remaining), 0) AS available,
      COALESCE(SUM(amount - remaining), 0) AS applied
    FROM referral_credits WHERE user_id = ?
  `).get(userId);
  const applications = db.prepare(`
    SELECT a.id, a.name, a.program, a.status, a.created_at,
      EXISTS(SELECT 1 FROM referral_rewards rr WHERE rr.application_id = a.id) AS rewarded
    FROM applications a
    WHERE a.referrer_id = ?
    ORDER BY a.created_at DESC LIMIT 30
  `).all(userId);
  return {
    code,
    link: `${config.siteUrl.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`,
    enabled: settings.enabled,
    settings,
    programs: [
      ...(settings.enabled ? [{
        id: null,
        name: 'Основна реферальна програма',
        description: 'Базові правила реферальної програми.',
        reward_points: settings.reward_points,
        credit_amount: settings.credit_amount,
        link: `${config.siteUrl.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`,
      }] : []),
      ...listStudentReferralPrograms(userId),
    ],
    referrals: summary.accepted,
    credits,
    applications,
  };
}

export function listOwnerReferrals() {
  return db.prepare(`
    SELECT u.id AS user_id, u.name, u.handle, codes.code,
      (SELECT COUNT(*) FROM users referred
        WHERE referred.referred_by_user_id = u.id AND referred.role = 'student') AS registered_students,
      (SELECT COUNT(*) FROM applications a WHERE a.referrer_id = u.id) AS application_count,
      (SELECT COUNT(*) FROM applications a
        WHERE a.referrer_id = u.id AND a.status = 'approved') AS accepted_count,
      (SELECT COUNT(*) FROM referral_rewards rr WHERE rr.referrer_id = u.id) AS reward_count,
      COALESCE((SELECT SUM(rr.points_awarded) FROM referral_rewards rr WHERE rr.referrer_id = u.id), 0) AS points_awarded,
      COALESCE((SELECT SUM(rr.credit_awarded) FROM referral_rewards rr WHERE rr.referrer_id = u.id), 0) AS credit_awarded,
      COALESCE((SELECT SUM(rc.remaining) FROM referral_credits rc WHERE rc.user_id = u.id), 0) AS credit_available
    FROM referral_codes codes
    JOIN users u ON u.id = codes.user_id
    WHERE u.role = 'student'
    ORDER BY registered_students DESC, application_count DESC, accepted_count DESC, u.name COLLATE NOCASE
    LIMIT 100
  `).all();
}

export function getAvailableCredit(userId) {
  return db.prepare('SELECT COALESCE(SUM(remaining), 0) AS amount FROM referral_credits WHERE user_id = ?')
    .get(userId).amount;
}

export function consumeCredits(userId, amount, paymentId) {
  let left = amount;
  const credits = db.prepare(`
    SELECT id, remaining FROM referral_credits
    WHERE user_id = ? AND remaining > 0 ORDER BY created_at, id
  `).all(userId);
  const update = db.prepare('UPDATE referral_credits SET remaining = remaining - ? WHERE id = ?');
  const allocate = db.prepare(`
    INSERT INTO payment_credit_allocations (payment_id, credit_id, amount)
    VALUES (?, ?, ?)
  `);
  for (const credit of credits) {
    if (left <= 0) break;
    const used = Math.min(left, credit.remaining);
    update.run(used, credit.id);
    allocate.run(paymentId, credit.id, used);
    left = Math.max(0, left - used);
  }
  if (left > 0.00001) throw new ValidationError('Недостатньо реферального кредиту');
  db.prepare('UPDATE payment_records SET credit_applied = ? WHERE id = ?').run(amount, paymentId);
}
