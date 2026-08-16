import * as settings from './settings.service.js';
import { ValidationError } from '../utils/errors.js';

function cfg() {
  return settings.getProxmoxConfig();
}

async function request(method, path, body = null) {
  const c = cfg();
  if (!c.enabled || !c.tokenId || !c.tokenSecret) return null;

  const url = `${c.host.replace(/\/$/, '')}/api2/json${path}`;
  const headers = {
    Authorization: `PVEAPIToken=${c.tokenId}=${c.tokenSecret}`,
  };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.errors || json.message || res.statusText;
    throw new ValidationError(`Proxmox: ${typeof err === 'object' ? JSON.stringify(err) : err}`);
  }
  return json.data;
}

export function isEnabled() {
  const c = cfg();
  return !!(c.enabled && c.host && c.tokenId && c.tokenSecret);
}

export function isConfigured() {
  return isEnabled();
}

export async function getNextVmid() {
  if (!isEnabled()) return 10000 + Math.floor(Math.random() * 5000);
  const cluster = await request('GET', '/cluster/nextid');
  return parseInt(cluster, 10);
}

export async function cloneVm({ vmid, name, userId }) {
  const c = cfg();

  if (!isEnabled()) {
    return {
      vmid: 10000 + userId,
      node: c.node,
      hostname: name,
      ip: `10.10.${Math.floor(userId / 254) + 1}.${(userId % 254) + 10}`,
      mock: true,
    };
  }

  await request('POST', `/nodes/${c.node}/qemu/${c.templateVmid}/clone`, {
    newid: vmid,
    name,
    full: 1,
    storage: c.storage,
  });

  await request('PUT', `/nodes/${c.node}/qemu/${vmid}/config`, {
    cores: c.vmCores,
    memory: c.vmMemoryMb,
    net0: `virtio,bridge=${c.bridge}`,
  });

  return { vmid, node: c.node, hostname: name, ip: null, mock: false };
}

export async function startVm(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { status: 'running', mock: true };
  await request('POST', `/nodes/${n}/qemu/${vmid}/status/start`);
  return { status: 'running' };
}

export async function stopVm(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { status: 'stopped', mock: true };
  await request('POST', `/nodes/${n}/qemu/${vmid}/status/stop`);
  return { status: 'stopped' };
}

export async function deleteVm(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { ok: true, mock: true };
  await stopVm(vmid, n).catch(() => {});
  await request('DELETE', `/nodes/${n}/qemu/${vmid}`);
  return { ok: true };
}

export function getConsoleUrl(vmid, node) {
  const c = cfg();
  if (!isEnabled() || !vmid) return null;
  const n = node || c.node;
  return `${c.host.replace(/\/$/, '')}/?console=kvm&novnc=1&vmid=${vmid}&node=${n}`;
}
