/** Pure helpers for picking which screen-share sits on the conference stage. */

export function pickStagedScreenId(ids, currentId, { incomingId, force = false } = {}) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return null;
  if (force && incomingId && list.includes(incomingId)) return incomingId;
  // Your own share should take the stage so you see what participants see.
  if (incomingId === 'tile-screen' && list.includes('tile-screen')) return 'tile-screen';
  if (currentId && list.includes(currentId)) return currentId;
  if (incomingId && list.includes(incomingId)) return incomingId;
  return list[0];
}

export function demoChipLabel(text, { local = false } = {}) {
  const raw = String(text || '').trim();
  if (local || raw === 'Ваш екран') return 'Ваш екран';
  return raw || 'Демонстрація';
}
