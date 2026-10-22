import db from '../db/index.js';
import * as taskService from './task.service.js';

export function listCompletedCtf(userId) {
  return db.prepare(`
    SELECT c.id, c.title, c.category, cc.completed_at, cc.duration_seconds,
      p.name as program_name, d.name as direction_name
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id AND c.ctf_enabled = 1
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN directions d ON d.id = p.direction_id
    WHERE cc.user_id = ?
    ORDER BY cc.completed_at DESC, cc.id DESC
  `).all(userId);
}

export function listDirectionSkills(userId) {
  const skills = new Map();
  const ensure = (name) => {
    const label = name || 'Практичні задачі';
    if (!skills.has(label)) skills.set(label, { direction: label, completedTasks: 0, ctfCategories: {} });
    return skills.get(label);
  };

  const taskRows = db.prepare(`
    SELECT COALESCE(gd.name, pd.name, p.name, 'Практичні задачі') as direction_name,
      COUNT(ta.id) as completed_count
    FROM task_assignments ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN study_groups g ON g.id = t.group_id
    LEFT JOIN directions gd ON gd.id = g.direction_id
    LEFT JOIN programs p ON p.id = g.program_id
    LEFT JOIN directions pd ON pd.id = p.direction_id
    WHERE ta.user_id = ? AND ta.status = 'completed'
    GROUP BY direction_name
  `).all(userId);
  for (const row of taskRows) ensure(row.direction_name).completedTasks = row.completed_count;

  const challengeRows = db.prepare(`
    SELECT COALESCE(d.name, p.name, 'Практичні CTF') as direction_name,
      COALESCE(NULLIF(lower(trim(c.category)), ''), 'misc') as category,
      COUNT(*) as completed_count
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id AND c.ctf_enabled = 1
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN directions d ON d.id = p.direction_id
    WHERE cc.user_id = ?
    GROUP BY direction_name, category
  `).all(userId);
  for (const row of challengeRows) {
    ensure(row.direction_name).ctfCategories[row.category] = row.completed_count;
  }

  return [...skills.values()].sort((a, b) => a.direction.localeCompare(b.direction, 'uk'));
}

export function listSharedCompletedTasks(userId) {
  return taskService.listCompletedForProfile(userId).map((task) => ({
    title: task.title,
    completedAt: task.completed_at,
    note: task.submission_note || '',
    files: task.submission_files.map((file) => ({
      name: file.original_name,
      url: file.url,
      mimeType: file.mime_type,
    })),
  }));
}
