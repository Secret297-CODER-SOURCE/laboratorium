import * as circuits from '../services/circuits.service.js';

export async function getInfo(req, res) {
  res.json(circuits.getInfo(req.user.id, req.user.role));
}

export async function list(req, res) {
  res.json({ projects: circuits.listMine(req.user.id) });
}

export async function getOne(req, res) {
  res.json({ project: circuits.getOne(req.user.id, parseInt(req.params.id, 10), req.user.role) });
}

export async function create(req, res) {
  if (req.body?.template) {
    const project = circuits.createFromTemplate(req.user.id, req.user.role, req.body);
    return res.status(201).json({ project });
  }
  const project = circuits.create(req.user.id, req.user.role, req.body || {});
  res.status(201).json({ project });
}

export async function update(req, res) {
  const project = circuits.update(req.user.id, parseInt(req.params.id, 10), req.body || {}, req.user.role);
  res.json({ project });
}

export async function remove(req, res) {
  res.json(circuits.remove(req.user.id, parseInt(req.params.id, 10), req.user.role));
}

export async function diagnose(req, res) {
  res.json(circuits.diagnose(req.user.id, parseInt(req.params.id, 10), req.user.role));
}
