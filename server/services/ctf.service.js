import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import * as labAgent from './lab-agent.service.js';
import * as challengeService from './challenge.service.js';
import * as stageService from './challenge-stage.service.js';
import { enrichDeploymentUrl } from '../utils/publicUrl.js';
import { getLabPublicConfig } from './settings.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

import { DEFAULT_FLAGS } from './ctf-demo-flags.js';
import { MULTISTAGE_EXAMPLES } from './ctf-examples.js';
import config from '../config/index.js';

const CTF_IMAGE = () => config.labAgent.ctfImage || 'laboratorium/ctf-lab:latest';

const LEGACY_IMAGES = {
  'vulnerables/web-dvwa:latest': true,
  'tricksterlab/pwnable_bof:latest': true,
  'remnux/malware-analysis:latest': true,
  'python:3.11-alpine': true,
  'remnux/reverse-engineering:latest': true,
  'vulnerables/cve-2014-6271:latest': true,
};

export function ensureCtfMetadata(dbConn) {
  const ctfImage = CTF_IMAGE();
  const challenges = dbConn.prepare('SELECT id, slug, flag_hash, docker_image FROM challenges').all();
  for (const c of challenges) {
    const flag = DEFAULT_FLAGS[c.slug];
    if (!flag) continue;

    const updates = [];
    const params = [];
    if (!c.flag_hash) {
      updates.push('flag_hash = ?');
      params.push(bcrypt.hashSync(flag, 10));
    }
    if (!c.docker_image || LEGACY_IMAGES[c.docker_image]) {
      updates.push('docker_image = ?');
      params.push(ctfImage);
    }
    if (updates.length) {
      params.push(c.id);
      dbConn.prepare(`UPDATE challenges SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  ensureChallengeStages(dbConn);
  ensureExampleChallenges(dbConn);
}

function ensureChallengeStages(dbConn) {
  const rows = dbConn.prepare(`
    SELECT id, flag_hash, bounty_reward, title FROM challenges
    WHERE ctf_enabled = 1
      AND id NOT IN (SELECT DISTINCT challenge_id FROM challenge_stages)
  `).all();
  const insertStage = dbConn.prepare(`
    INSERT INTO challenge_stages (challenge_id, sort_order, title, flag_hash, points)
    VALUES (?, 0, ?, ?, ?)
  `);
  for (const c of rows) {
    insertStage.run(c.id, c.title, c.flag_hash || null, c.bounty_reward || 0);
  }
}

function ensureExampleChallenges(dbConn) {
  const insertChallenge = dbConn.prepare(`
    INSERT INTO challenges (slug, title, description, bounty_reward, difficulty, category, docker_image, ctf_enabled, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
  `);
  const insertStage = dbConn.prepare(`
    INSERT INTO challenge_stages (challenge_id, sort_order, title, description, flag_hash, points, hint_text, hint_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const ex of MULTISTAGE_EXAMPLES) {
    const existing = dbConn.prepare('SELECT id FROM challenges WHERE slug = ?').get(ex.slug);
    if (existing) continue;

    const totalPoints = ex.stages.reduce((sum, s) => sum + s.points, 0);
    const result = insertChallenge.run(
      ex.slug, ex.title, ex.description, totalPoints, ex.difficulty, ex.category, ex.docker_image || null,
    );
    const challengeId = result.lastInsertRowid;

    ex.stages.forEach((s, idx) => {
      insertStage.run(
        challengeId, idx, s.title, s.description || null,
        bcrypt.hashSync(s.flag, 10), s.points, s.hint_text || null, s.hint_cost || 0,
      );
    });
  }
}

export function listCtfForUser(userId) {
  const challenges = db.prepare(`
    SELECT c.*, p.name as program_name,
      cd.id as deployment_id, cd.target_url, cd.status as deploy_status, cd.host_port
    FROM challenges c
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN ctf_deployments cd ON cd.challenge_id = c.id AND cd.user_id = ?
    WHERE c.is_active = 1 AND c.ctf_enabled = 1
    ORDER BY c.bounty_reward
  `).all(userId);

  const completedIds = new Set(
    db.prepare('SELECT challenge_id FROM challenge_completions WHERE user_id = ?').all(userId)
      .map(r => r.challenge_id),
  );

  const startRows = db.prepare('SELECT challenge_id, started_at FROM challenge_starts WHERE user_id = ?')
    .all(userId);
  const startMap = Object.fromEntries(startRows.map(r => [r.challenge_id, r.started_at]));

  const realDeploy = labAgent.isAgentEnabled();
  const mock = !realDeploy;
  const cfg = getLabPublicConfig();

  return challenges.map(c => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    bounty_reward: c.bounty_reward,
    difficulty: c.difficulty,
    category: c.category || 'misc',
    program_name: c.program_name,
    docker_image: c.docker_image,
    target_port: c.target_port || 80,
    time_limit_minutes: c.time_limit_minutes,
    started_at: startMap[c.id] || null,
    completed: completedIds.has(c.id),
    stages: stageService.getUserStageView(userId, c.id),
    deployment: c.deployment_id ? enrichDeploymentUrl({
      id: c.deployment_id,
      target_url: c.target_url,
      status: c.deploy_status,
      host_port: c.host_port,
    }, cfg, {
      userId,
      resourceType: 'ctf',
      resourceId: c.deployment_id,
      mock,
      slug: c.slug,
      challengeId: c.id,
    }) : null,
  }));
}

export async function startChallenge(userId, challengeId) {
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ? AND is_active = 1 AND ctf_enabled = 1').get(challengeId);
  if (!challenge) throw new NotFoundError('CTF не знайдено');
  if (!challenge.docker_image) throw new ValidationError('Docker image не налаштовано для цього CTF');

  const existing = db.prepare('SELECT * FROM ctf_deployments WHERE user_id = ? AND challenge_id = ?').get(userId, challengeId);
  const realDeploy = labAgent.isAgentEnabled();
  const mock = !realDeploy;
  if (existing?.status === 'running') {
    return enrichDeploymentUrl(existing, getLabPublicConfig(), {
      userId,
      resourceType: 'ctf',
      resourceId: existing.id,
      mock,
      slug: challenge.slug,
      challengeId,
    });
  }

  const port = labAgent.allocatePort(userId * 1000 + challengeId);
  const name = `ctf-u${userId}-c${challengeId}`;

  if (existing) {
    db.prepare(`
      UPDATE ctf_deployments SET status = 'deploying', error_message = NULL, host_port = ?
      WHERE id = ?
    `).run(port, existing.id);
  } else {
    db.prepare(`
      INSERT INTO ctf_deployments (user_id, challenge_id, host_port, status)
      VALUES (?, ?, ?, 'deploying')
    `).run(userId, challengeId, port);
  }

  const deployRow = db.prepare('SELECT * FROM ctf_deployments WHERE user_id = ? AND challenge_id = ?').get(userId, challengeId);

  challengeService.startChallenge(userId, challengeId);

  try {
    const flag = DEFAULT_FLAGS[challenge.slug];
    const deployed = await labAgent.deployContainer({
      name,
      image: challenge.docker_image,
      port,
      containerPort: challenge.target_port || 80,
      demoMeta: mock ? {
        userId,
        challengeId,
        deploymentId: deployRow.id,
        slug: challenge.slug,
      } : null,
      env: realDeploy && flag ? { CTF_SLUG: challenge.slug, CTF_FLAG: flag } : null,
    });

    db.prepare(`
      UPDATE ctf_deployments SET container_id = ?, target_url = ?, host_port = ?, status = 'running',
        expires_at = datetime('now', '+4 hours')
      WHERE id = ?
    `).run(deployed.containerId, deployed.targetUrl, deployed.hostPort, deployRow.id);

    return enrichDeploymentUrl(
      db.prepare('SELECT * FROM ctf_deployments WHERE id = ?').get(deployRow.id),
      getLabPublicConfig(),
      { userId, resourceType: 'ctf', resourceId: deployRow.id, mock, slug: challenge.slug, challengeId },
    );
  } catch (err) {
    db.prepare(`UPDATE ctf_deployments SET status = 'error', error_message = ? WHERE id = ?`)
      .run(err.message, deployRow.id);
    throw err;
  }
}

export async function stopChallenge(userId, challengeId) {
  const row = db.prepare('SELECT * FROM ctf_deployments WHERE user_id = ? AND challenge_id = ?').get(userId, challengeId);
  if (!row) throw new NotFoundError('Інстанс не знайдено');
  await labAgent.stopContainer(row.container_id);
  db.prepare(`UPDATE ctf_deployments SET status = 'stopped' WHERE id = ?`).run(row.id);
  return db.prepare('SELECT * FROM ctf_deployments WHERE id = ?').get(row.id);
}

export function submitFlag(userId, challengeId, stageId, flag) {
  return stageService.submitStageFlag(userId, challengeId, stageId, flag);
}

export function unlockHint(userId, challengeId, stageId) {
  return stageService.unlockHint(userId, challengeId, stageId);
}
