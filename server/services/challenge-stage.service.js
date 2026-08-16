import bcrypt from 'bcryptjs';
import { unlinkSync } from 'fs';
import { join } from 'path';
import db from '../db/index.js';
import config from '../config/index.js';
import * as bountyService from './bounty.service.js';
import * as activityService from './ctf-activity.service.js';
import { secondsBetween } from '../utils/time.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../utils/errors.js';

function getChallenge(challengeId) {
  return db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId);
}

function getStagesRaw(challengeId) {
  return db.prepare('SELECT * FROM challenge_stages WHERE challenge_id = ? ORDER BY sort_order ASC, id ASC').all(challengeId);
}

function getAttachmentsRaw(stageId) {
  return db.prepare(`
    SELECT id, original_name, mime_type, size_bytes, created_at
    FROM challenge_stage_attachments WHERE stage_id = ? ORDER BY id ASC
  `).all(stageId);
}

export function getStagesAdmin(challengeId) {
  return getStagesRaw(challengeId).map(s => ({
    id: s.id,
    sort_order: s.sort_order,
    title: s.title,
    description: s.description,
    points: s.points,
    hint_text: s.hint_text,
    hint_cost: s.hint_cost,
    has_flag: !!s.flag_hash,
    attachments: getAttachmentsRaw(s.id),
  }));
}

export function addAttachment(challengeId, stageId, file) {
  const stage = db.prepare('SELECT id FROM challenge_stages WHERE id = ? AND challenge_id = ?').get(stageId, challengeId);
  if (!stage) throw new NotFoundError('Стадію не знайдено');

  const result = db.prepare(`
    INSERT INTO challenge_stage_attachments (stage_id, challenge_id, filename, original_name, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(stageId, challengeId, file.filename, file.originalname, file.mimetype || null, file.size || 0);

  return db.prepare(`
    SELECT id, original_name, mime_type, size_bytes, created_at FROM challenge_stage_attachments WHERE id = ?
  `).get(result.lastInsertRowid);
}

export function removeAttachment(challengeId, stageId, attachmentId) {
  const row = db.prepare(`
    SELECT * FROM challenge_stage_attachments WHERE id = ? AND stage_id = ? AND challenge_id = ?
  `).get(attachmentId, stageId, challengeId);
  if (!row) throw new NotFoundError('Файл не знайдено');

  db.prepare('DELETE FROM challenge_stage_attachments WHERE id = ?').run(attachmentId);
  try {
    unlinkSync(join(config.uploads.ctfDir, row.filename));
  } catch { /* файл уже відсутній на диску — не критично */ }

  return { ok: true };
}

export function getAttachmentForDownload(attachmentId) {
  const row = db.prepare('SELECT * FROM challenge_stage_attachments WHERE id = ?').get(attachmentId);
  if (!row) throw new NotFoundError('Файл не знайдено');
  return {
    ...row,
    absolutePath: join(config.uploads.ctfDir, row.filename),
  };
}

export function replaceStages(challengeId, stagesInput) {
  if (!Array.isArray(stagesInput) || stagesInput.length === 0) {
    throw new ValidationError('Додайте хоча б одну стадію');
  }

  const existingStages = getStagesRaw(challengeId);
  const existingById = new Map(existingStages.map(s => [s.id, s]));
  const keepIds = new Set();

  let totalPoints = 0;
  const prepared = stagesInput.map((s, idx) => {
    const title = s.title?.trim();
    if (!title) throw new ValidationError(`Вкажіть назву стадії №${idx + 1}`);
    const points = parseInt(s.points, 10);
    if (!Number.isFinite(points) || points <= 0) throw new ValidationError(`Вкажіть бали для стадії «${title}»`);
    totalPoints += points;

    const id = s.id ? parseInt(s.id, 10) : null;
    let flagHash = null;
    if (id && existingById.has(id)) {
      flagHash = existingById.get(id).flag_hash;
      keepIds.add(id);
    }
    const flagRaw = s.flag?.trim();
    if (flagRaw) {
      flagHash = bcrypt.hashSync(flagRaw, 10);
    } else if (!flagHash) {
      throw new ValidationError(`Вкажіть flag для стадії «${title}»`);
    }

    return {
      id,
      sort_order: idx,
      title,
      description: s.description?.trim() || null,
      flag_hash: flagHash,
      points,
      hint_text: s.hint_text?.trim() || null,
      hint_cost: parseInt(s.hint_cost, 10) || 0,
    };
  });

  const removed = existingStages.filter(s => !keepIds.has(s.id));
  for (const stage of removed) {
    const solved = db.prepare(`
      SELECT COUNT(*) as c FROM challenge_stage_progress WHERE stage_id = ? AND completed_at IS NOT NULL
    `).get(stage.id).c;
    if (solved > 0) {
      throw new ValidationError(`Не можна видалити стадію «${stage.title}» — її вже пройшов хоча б один учень`);
    }
  }

  const tx = db.transaction(() => {
    for (const stage of removed) {
      db.prepare('DELETE FROM challenge_stages WHERE id = ?').run(stage.id);
    }
    const updateStmt = db.prepare(`
      UPDATE challenge_stages SET sort_order=?, title=?, description=?, flag_hash=?, points=?, hint_text=?, hint_cost=?
      WHERE id = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO challenge_stages (challenge_id, sort_order, title, description, flag_hash, points, hint_text, hint_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of prepared) {
      if (s.id && existingById.has(s.id)) {
        updateStmt.run(s.sort_order, s.title, s.description, s.flag_hash, s.points, s.hint_text, s.hint_cost, s.id);
      } else {
        insertStmt.run(challengeId, s.sort_order, s.title, s.description, s.flag_hash, s.points, s.hint_text, s.hint_cost);
      }
    }
    db.prepare('UPDATE challenges SET bounty_reward = ? WHERE id = ?').run(totalPoints, challengeId);
  });
  tx();

  return getStagesAdmin(challengeId);
}

export function getUserStageView(userId, challengeId) {
  const stages = getStagesRaw(challengeId);
  const progressRows = db.prepare(`
    SELECT * FROM challenge_stage_progress WHERE user_id = ? AND challenge_id = ?
  `).all(userId, challengeId);
  const progressByStage = new Map(progressRows.map(p => [p.stage_id, p]));

  let previousCompleted = true;
  return stages.map(stage => {
    const progress = progressByStage.get(stage.id);
    const completed = !!progress?.completed_at;
    const unlocked = previousCompleted;
    previousCompleted = completed;

    return {
      id: stage.id,
      sort_order: stage.sort_order,
      title: stage.title,
      description: unlocked ? stage.description : null,
      points: stage.points,
      hint_cost: stage.hint_cost,
      hint_available: !!stage.hint_text,
      hint_unlocked: !!progress?.hint_used,
      hint_text: progress?.hint_used ? stage.hint_text : null,
      attachments: unlocked ? getAttachmentsRaw(stage.id) : [],
      completed,
      unlocked,
      points_awarded: progress?.points_awarded ?? null,
    };
  });
}

function assertUnlocked(userId, stages, stage) {
  const idx = stages.findIndex(s => s.id === stage.id);
  if (idx <= 0) return;
  const prevStage = stages[idx - 1];
  const prevDone = db.prepare(`
    SELECT completed_at FROM challenge_stage_progress WHERE user_id = ? AND stage_id = ?
  `).get(userId, prevStage.id);
  if (!prevDone?.completed_at) throw new ForbiddenError('Спочатку розв\'яжіть попередню стадію');
}

export function assertStageUnlockedForUser(userId, challengeId, stageId) {
  const stage = db.prepare('SELECT * FROM challenge_stages WHERE id = ? AND challenge_id = ?').get(stageId, challengeId);
  if (!stage) throw new NotFoundError('Стадію не знайдено');
  const stages = getStagesRaw(challengeId);
  assertUnlocked(userId, stages, stage);
}

export function unlockHint(userId, challengeId, stageId) {
  const stage = db.prepare('SELECT * FROM challenge_stages WHERE id = ? AND challenge_id = ?').get(stageId, challengeId);
  if (!stage) throw new NotFoundError('Стадію не знайдено');
  if (!stage.hint_text) throw new NotFoundError('Підказки немає для цієї стадії');

  const stages = getStagesRaw(challengeId);
  assertUnlocked(userId, stages, stage);

  const existing = db.prepare('SELECT * FROM challenge_stage_progress WHERE user_id = ? AND stage_id = ?').get(userId, stage.id);
  if (existing?.completed_at) throw new ConflictError('Стадію вже розв\'язано');

  db.prepare(`
    INSERT INTO challenge_stage_progress (user_id, stage_id, challenge_id, hint_used, hint_used_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, stage_id) DO UPDATE SET hint_used = 1, hint_used_at = datetime('now')
  `).run(userId, stage.id, challengeId);

  return { hint_text: stage.hint_text, hint_cost: stage.hint_cost };
}

export function submitStageFlag(userId, challengeId, stageId, flagRaw) {
  const challenge = getChallenge(challengeId);
  if (!challenge || !challenge.is_active) throw new NotFoundError('CTF не знайдено');

  const stage = db.prepare('SELECT * FROM challenge_stages WHERE id = ? AND challenge_id = ?').get(stageId, challengeId);
  if (!stage) throw new NotFoundError('Стадію не знайдено');

  const stages = getStagesRaw(challengeId);
  assertUnlocked(userId, stages, stage);

  const existingProgress = db.prepare('SELECT * FROM challenge_stage_progress WHERE user_id = ? AND stage_id = ?').get(userId, stage.id);
  if (existingProgress?.completed_at) throw new ConflictError('Стадію вже розв\'язано');

  if (!stage.flag_hash) throw new ValidationError('Flag не налаштовано для цієї стадії — зверніться до викладача');
  if (!flagRaw?.trim()) throw new ValidationError('Введіть flag');
  const ok = bcrypt.compareSync(flagRaw.trim(), stage.flag_hash);
  if (!ok) throw new ValidationError('Невірний flag');

  const hintUsed = !!existingProgress?.hint_used;
  const pointsAwarded = Math.max(0, stage.points - (hintUsed ? stage.hint_cost : 0));
  const isFirstBlood = db.prepare(`
    SELECT COUNT(*) as c FROM challenge_stage_progress WHERE stage_id = ? AND completed_at IS NOT NULL
  `).get(stage.id).c === 0;

  const idx = stages.findIndex(s => s.id === stage.id);
  const isLastStage = idx === stages.length - 1;
  let challengeCompleted = false;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO challenge_stage_progress (user_id, stage_id, challenge_id, completed_at, points_awarded, hint_used, hint_used_at)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(user_id, stage_id) DO UPDATE SET completed_at = excluded.completed_at, points_awarded = excluded.points_awarded
    `).run(userId, stage.id, challengeId, pointsAwarded, hintUsed ? 1 : 0, existingProgress?.hint_used_at || null);

    bountyService.addBounty(userId, pointsAwarded, `CTF: ${challenge.title} — ${stage.title}`);

    if (isLastStage) {
      const done = db.prepare('SELECT id FROM challenge_completions WHERE user_id = ? AND challenge_id = ?').get(userId, challengeId);
      if (!done) {
        const startRow = db.prepare('SELECT started_at FROM challenge_starts WHERE user_id = ? AND challenge_id = ?').get(userId, challengeId);
        const nowRow = db.prepare("SELECT datetime('now') as now").get();
        const durationSeconds = secondsBetween(startRow?.started_at, nowRow.now);
        db.prepare(`
          INSERT INTO challenge_completions (user_id, challenge_id, started_at, duration_seconds)
          VALUES (?, ?, ?, ?)
        `).run(userId, challengeId, startRow?.started_at || null, durationSeconds);
        challengeCompleted = true;
      }
    }
  });
  tx();

  const user = db.prepare('SELECT handle FROM users WHERE id = ?').get(userId);
  activityService.log(isFirstBlood ? 'first_blood' : 'solve', {
    userId,
    challengeId,
    stageId: stage.id,
    message: isFirstBlood
      ? `🩸 Перша кров! @${user.handle} першим розв'язав «${challenge.title}» — ${stage.title}`
      : `🚩 @${user.handle} розв'язав «${challenge.title}» — ${stage.title}`,
  });

  return { challenge, stage, points_awarded: pointsAwarded, challenge_completed: challengeCompleted };
}
