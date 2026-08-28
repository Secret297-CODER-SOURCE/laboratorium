import * as contentService from '../services/content.service.js';
import { ValidationError } from '../utils/errors.js';

function parseTarget(req) {
  const targetType = req.params.type;
  const targetId = parseInt(req.params.id, 10);
  if (!['direction', 'group', 'program'].includes(targetType) || !targetId) {
    throw new ValidationError('Невірний тип або id');
  }
  return { targetType, targetId };
}

export async function getContentEditor(req, res) {
  const { targetType, targetId } = parseTarget(req);
  const data = contentService.getPageForEditor(
    targetType,
    targetId,
    req.user.id,
    req.user.role,
  );
  res.json(data);
}

export async function saveContent(req, res) {
  const { targetType, targetId } = parseTarget(req);
  const page = contentService.savePage(
    targetType,
    targetId,
    req.user.id,
    req.user.role,
    req.body,
  );
  res.json({ page, message: 'Контент збережено' });
}

export async function getContentStatus(req, res) {
  const { targetType, targetId } = parseTarget(req);
  res.json(contentService.getContentStatus(targetType, targetId));
}
