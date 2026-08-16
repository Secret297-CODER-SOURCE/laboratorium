import * as storageService from '../services/storage.service.js';

export async function getStorageOverview(req, res) {
  res.json({
    servers: storageService.listServersAdmin(),
    assets: storageService.listAssets({ limit: 200 }),
  });
}

export async function createStorageServer(req, res) {
  const server = storageService.createServer(req.body);
  res.status(201).json({ server, message: 'Сервер додано' });
}

export async function updateStorageServer(req, res) {
  const server = storageService.updateServer(parseInt(req.params.id, 10), req.body);
  res.json({ server, message: 'Збережено' });
}

export async function deleteStorageServer(req, res) {
  await storageService.deleteServer(parseInt(req.params.id, 10));
  res.json({ ok: true, message: 'Сервер видалено' });
}

export async function listStorageAssets(req, res) {
  const assets = storageService.listAssets({
    serverId: req.query.server_id ? parseInt(req.query.server_id, 10) : null,
    assetType: req.query.type || null,
    limit: req.query.limit,
  });
  res.json({ assets });
}

export async function moveStorageAssets(req, res) {
  const result = storageService.moveAssets(req.body.asset_ids, parseInt(req.body.target_server_id, 10));
  res.json({
    ...result,
    message: result.moved
      ? `Переміщено файлів: ${result.moved}`
      : 'Нічого не переміщено',
  });
}

export async function syncStorage(req, res) {
  storageService.syncExistingAssets();
  res.json({
    servers: storageService.listServersAdmin(),
    message: 'Індекс файлів оновлено',
  });
}
