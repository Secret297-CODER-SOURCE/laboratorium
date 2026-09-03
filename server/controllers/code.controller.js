import * as codeService from '../services/code-workspace.service.js';
import { isSandboxEnabled, supportedLanguages } from '../services/sandbox.service.js';

export async function getSandboxInfo(req, res) {
  res.json({
    enabled: isSandboxEnabled(),
    languages: supportedLanguages(),
    canUse: codeService.canUseSandbox(req.user.id, req.user.role),
  });
}

export async function listWorkspaces(req, res) {
  res.json({ workspaces: codeService.listMine(req.user.id) });
}

export async function createWorkspace(req, res) {
  const workspace = codeService.create(req.user.id, req.user.role, req.body);
  res.status(201).json({ workspace });
}

export async function getWorkspace(req, res) {
  const workspace = codeService.getWithFiles(req.user.id, parseInt(req.params.id, 10));
  res.json({ workspace });
}

export async function saveWorkspaceFiles(req, res) {
  const workspace = codeService.saveFiles(req.user.id, parseInt(req.params.id, 10), req.body.files);
  res.json({ workspace, message: 'Збережено' });
}

export async function deleteWorkspace(req, res) {
  const result = codeService.remove(req.user.id, parseInt(req.params.id, 10));
  res.json(result);
}

export async function runWorkspace(req, res) {
  const run = await codeService.run(req.user.id, parseInt(req.params.id, 10));
  res.json({ run });
}

export async function runWorkspaceWeb(req, res) {
  const run = await codeService.runWeb(req.user.id, parseInt(req.params.id, 10));
  res.json({ run });
}

export async function stopWorkspaceWeb(req, res) {
  const result = await codeService.stopWeb(req.user.id, parseInt(req.params.id, 10));
  res.json(result);
}
