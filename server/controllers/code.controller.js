import * as codeService from '../services/code-workspace.service.js';
import * as gitRemote from '../services/git-remote.service.js';
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
  const result = await codeService.remove(req.user.id, parseInt(req.params.id, 10));
  res.json(result);
}

export async function getGitStatus(req, res) {
  const status = await codeService.getGitStatus(req.user.id, parseInt(req.params.id, 10));
  res.json({ status });
}

export async function createGitCommit(req, res) {
  const result = await codeService.createGitCommit(
    req.user.id,
    parseInt(req.params.id, 10),
    req.body.message,
  );
  res.json(result);
}

export async function cloneWorkspace(req, res) {
  const workspace = await gitRemote.cloneIntoWorkspace(req.user.id, req.user.role, req.body);
  res.status(201).json({ workspace });
}

export async function gitBranch(req, res) {
  const status = await gitRemote.createBranch(req.user.id, parseInt(req.params.id, 10), req.body || {});
  res.json({ status });
}

export async function gitPull(req, res) {
  const status = await gitRemote.pull(req.user.id, parseInt(req.params.id, 10));
  res.json({ status });
}

export async function gitPush(req, res) {
  const status = await gitRemote.push(req.user.id, parseInt(req.params.id, 10), req.user.role, req.body || {});
  res.json({ status });
}

export async function gitMerge(req, res) {
  const result = await gitRemote.mergeBranch(req.user.id, parseInt(req.params.id, 10), req.body || {});
  res.json(result);
}

export async function listGitPrs(req, res) {
  const result = await gitRemote.listPullRequests(req.user.id, parseInt(req.params.id, 10));
  res.json(result);
}

export async function createGitPr(req, res) {
  const result = await gitRemote.createPullRequest(req.user.id, parseInt(req.params.id, 10), req.body || {});
  res.json(result);
}

export async function runWorkspace(req, res) {
  const run = await codeService.run(req.user.id, parseInt(req.params.id, 10));
  res.json({ run });
}

export async function runWorkspaceTests(req, res) {
  const run = await codeService.runTests(req.user.id, parseInt(req.params.id, 10));
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
