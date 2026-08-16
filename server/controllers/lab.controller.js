import * as labService from '../services/lab.service.js';
import * as ctfService from '../services/ctf.service.js';
import * as ctfActivityService from '../services/ctf-activity.service.js';
import * as labAgent from '../services/lab-agent.service.js';
import * as proxmox from '../services/proxmox.service.js';
import * as userService from '../services/user.service.js';

export async function getLabOverview(req, res) {
  const user = userService.findById(req.user.id);
  res.json(labService.getLabOverview(req.user.id, user.handle));
}

export async function startVm(req, res) {
  const vm = await labService.startVm(req.user.id);
  res.json({ vm, message: 'Машину запущено' });
}

export async function stopVm(req, res) {
  const vm = await labService.stopVm(req.user.id);
  res.json({ vm, message: 'Машину зупинено' });
}

export async function resetVm(req, res) {
  const user = userService.findById(req.user.id);
  const vm = await labService.resetVm(req.user.id, user.handle);
  res.json({ vm, message: 'Машину пересоздано' });
}

export async function deployDocker(req, res) {
  const deployment = await labService.deployDocker(req.user.id, req.body);
  res.status(201).json({ deployment, message: 'Контейнер розгорнуто' });
}

export async function stopDocker(req, res) {
  const deployId = parseInt(req.params.id, 10);
  const deployment = await labService.stopDocker(req.user.id, deployId);
  res.json({ deployment, message: 'Контейнер зупинено' });
}

export async function listCtf(req, res) {
  res.json({
    challenges: ctfService.listCtfForUser(req.user.id),
    infra: {
      agentEnabled: labAgent.isAgentEnabled(),
      proxmoxEnabled: proxmox.isEnabled(),
      mockMode: !labAgent.isAgentEnabled(),
      publicAccess: labAgent.getPublicInfra(),
    },
  });
}

export async function startCtf(req, res) {
  const challengeId = parseInt(req.params.id, 10);
  const deployment = await ctfService.startChallenge(req.user.id, challengeId);
  res.json({ deployment, message: 'CTF інстанс запущено' });
}

export async function stopCtf(req, res) {
  const challengeId = parseInt(req.params.id, 10);
  const deployment = await ctfService.stopChallenge(req.user.id, challengeId);
  res.json({ deployment, message: 'CTF інстанс зупинено' });
}

export async function submitFlag(req, res) {
  const challengeId = parseInt(req.params.id, 10);
  const stageId = parseInt(req.body.stageId, 10);
  const result = ctfService.submitFlag(req.user.id, challengeId, stageId, req.body.flag);
  const user = userService.findById(req.user.id);
  res.json({
    ok: true,
    bounty_earned: result.points_awarded,
    challenge_completed: result.challenge_completed,
    user: userService.toPublic(user),
    message: result.challenge_completed
      ? `+${result.points_awarded} bounty! Завдання «${result.challenge.title}» повністю розв'язано`
      : `+${result.points_awarded} bounty! Стадію «${result.stage.title}» пройдено`,
  });
}

export async function unlockHint(req, res) {
  const challengeId = parseInt(req.params.id, 10);
  const stageId = parseInt(req.params.stageId, 10);
  const result = ctfService.unlockHint(req.user.id, challengeId, stageId);
  res.json({ ok: true, ...result });
}

export async function getCtfActivity(req, res) {
  const activity = ctfActivityService.getRecent(parseInt(req.query.limit, 10) || 30);
  res.json({ activity });
}
