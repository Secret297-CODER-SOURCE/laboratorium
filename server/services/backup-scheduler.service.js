import db from '../db/index.js';
import * as settings from './settings.service.js';
import * as labService from './lab.service.js';

let timer = null;

async function runAutoBackupCycle() {
  const cfg = settings.getProxmoxConfig();
  if (!cfg.backupAutoEnabled) return;

  const labs = db.prepare(`
    SELECT user_id FROM user_labs WHERE status = 'running' AND proxmox_vmid IS NOT NULL
  `).all();
  for (const { user_id: userId } of labs) {
    try {
      await labService.createVmBackup(userId, 'авто', 'auto');
      await labService.pruneVmBackups(userId, cfg.backupRetention);
    } catch (err) {
      console.error(`[backup] auto VM backup failed for user ${userId}:`, err.message);
    }
  }

  const deployments = db.prepare(`
    SELECT id, user_id FROM docker_deployments WHERE status = 'running' AND container_id IS NOT NULL
  `).all();
  for (const dep of deployments) {
    try {
      await labService.createDockerBackup(dep.user_id, dep.id, 'авто', 'auto');
      await labService.pruneDockerBackups(dep.user_id, dep.id, cfg.backupRetention);
    } catch (err) {
      console.error(`[backup] auto Docker backup failed for deployment ${dep.id}:`, err.message);
    }
  }
}

/** Запускає фоновий цикл автобекапів; інтервал перечитується з налаштувань перед кожним циклом. */
export function startBackupScheduler() {
  function schedule() {
    clearTimeout(timer);
    const intervalMs = Math.max(1, settings.getProxmoxConfig().backupIntervalHours || 24) * 60 * 60 * 1000;
    timer = setTimeout(async () => {
      await runAutoBackupCycle().catch((err) => console.error('[backup] cycle error:', err.message));
      schedule();
    }, intervalMs);
    timer.unref?.();
  }
  schedule();
}
