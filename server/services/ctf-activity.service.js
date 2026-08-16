import db from '../db/index.js';

export function log(type, { userId = null, challengeId = null, stageId = null, message }) {
  db.prepare(`
    INSERT INTO ctf_activity (type, user_id, challenge_id, stage_id, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(type, userId, challengeId, stageId, message);
}

export function logPublished(challenge) {
  log('published', {
    challengeId: challenge.id,
    message: `🆕 Нове завдання: «${challenge.title}» (${challenge.category || 'misc'}, ${challenge.bounty_reward} pts)`,
  });
}

export function getRecent(limit = 30) {
  return db.prepare(`
    SELECT a.id, a.type, a.message, a.created_at, a.challenge_id, a.stage_id,
      c.title as challenge_title, s.title as stage_title, u.handle as user_handle
    FROM ctf_activity a
    LEFT JOIN challenges c ON c.id = a.challenge_id
    LEFT JOIN challenge_stages s ON s.id = a.stage_id
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?
  `).all(limit);
}
