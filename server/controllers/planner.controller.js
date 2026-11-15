import * as plannerService from '../services/planner.service.js';

export async function list(req, res) {
  res.json({ items: plannerService.list(req.user.id, req.query) });
}

export async function create(req, res) {
  const item = plannerService.create(req.user.id, req.body);
  res.status(201).json({ item, message: 'Задачу додано' });
}

export async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const item = plannerService.update(req.user.id, id, req.body);
  res.json({ item, message: 'Збережено' });
}

export async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  res.json(plannerService.remove(req.user.id, id));
}
