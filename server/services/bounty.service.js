import db from '../db/index.js';

export function addBounty(userId, amount, reason) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET bounty_points = bounty_points + ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(amount, userId);
    db.prepare('INSERT INTO bounty_log (user_id, amount, reason) VALUES (?, ?, ?)')
      .run(userId, amount, reason);
  });
  tx();
}

export function getBountyLog(userId, limit = 20) {
  return db.prepare(`
    SELECT amount, reason, created_at FROM bounty_log
    WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

export function getUserRank(bountyPoints) {
  return db.prepare('SELECT COUNT(*) + 1 as rank FROM users WHERE bounty_points > ?')
    .get(bountyPoints).rank;
}
