const PALETTES = {
  osint: ['#a8f0ff', '#3ca7c1', '#e5cf85'],
  web: ['#b3f4ce', '#42b77a', '#f2d179'],
  network: ['#c4b7ff', '#8464e8', '#f0cf85'],
  crypto: ['#ffe5a6', '#d79d35', '#fff3ce'],
  forensics: ['#ffb9c6', '#d75c7a', '#f1d492'],
  reverse: ['#b8d0ff', '#5e8ce0', '#f4ce7d'],
  default: ['#c9f4e8', '#62bda2', '#f1cf81'],
};

const SPRITES = {
  osint: ['..aaa..', '.a...a.', 'a.....a', 'a.....a', '.a...a.', '..aaa..', '......b'],
  web: ['...a...', '..aaa..', '.aaaaa.', '.aaaaa.', '..aaa..', '...b...', '...b...'],
  network: ['a.....a', '.a...a.', '..a.a..', '...b...', '..a.a..', '.a...a.', 'a.....a'],
  crypto: ['..ccc..', '.c...c.', 'c.....c', 'c..b..c', 'c.....c', '.c...c.', '..ccc..'],
  forensics: ['..aaa..', '.a...a.', 'a.....a', 'a..b..a', 'a.....a', '.a...a.', '..aaa..'],
  reverse: ['a.....a', '.a...a.', '..a.a..', '...b...', '..a.a..', '.a...a.', 'a.....a'],
  default: ['...c...', '..ccc..', '.ccccc.', 'ccccccc', '.ccccc.', '..ccc..', '...c...'],
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderPixelArt(category, earned) {
  const palette = PALETTES[category] || PALETTES.default;
  const sprite = SPRITES[category] || SPRITES.default;
  const colors = { a: palette[0], b: palette[1], c: palette[2] };
  const pixels = sprite.flatMap((row, y) => [...row].flatMap((cell, x) => (
    colors[cell] ? `<rect x="${32 + x * 9}" y="${30 + y * 9}" width="9" height="9" fill="${colors[cell]}"/>` : []
  ))).join('');
  return `<svg class="award-pixel-art" viewBox="0 0 128 128" role="img" aria-label="${earned ? 'Відзнака відкрита' : 'Відзнака очікує відкриття'}" shape-rendering="crispEdges">
    <rect x="10" y="10" width="108" height="108" rx="4" fill="#0b1423"/>
    <path d="M20 26h8v8h-8zm78 58h8v8h-8zM38 94h8v8h-8zm48-66h8v8h-8z" fill="${palette[1]}" opacity=".7"/>
    <path d="M28 18h16v4H28zm56 88h16v4H84z" fill="${palette[0]}" opacity=".55"/>
    ${pixels}
    <rect x="18" y="18" width="92" height="92" fill="none" stroke="${earned ? palette[0] : '#667487'}" stroke-width="2" opacity="${earned ? '.7' : '.4'}"/>
  </svg>`;
}

export function renderAchievementCard(award, { compact = false } = {}) {
  const earned = award.earned !== false;
  const category = PALETTES[award.category] ? award.category : 'default';
  const target = Math.max(1, Number(award.target) || 1);
  const progress = Math.min(target, Math.max(0, Number(award.progress) || 0));
  const percent = Math.min(100, Math.round((progress / target) * 100));
  const rarity = Number(award.level) >= 3 ? 'legendary' : (Number(award.level) === 2 ? 'rare' : 'uncommon');
  return `<article class="achievement-nft-card ${earned ? 'is-earned' : 'is-locked'}${compact ? ' is-compact' : ''}" data-category="${category}" data-rarity="${rarity}">
    <div class="achievement-nft-top"><span>LAB / CTF</span><span>${rarity}</span></div>
    <div class="achievement-nft-art">${renderPixelArt(category, earned)}</div>
    <div class="achievement-nft-copy">
      <div class="achievement-nft-title-row">
        <h3>${escapeHtml(award.label)}</h3>
        <span class="achievement-nft-status">${earned ? 'Відкрито' : 'У прогресі'}</span>
      </div>
      <p>${escapeHtml(award.detail)}</p>
      ${award.progress_label ? `<div class="student-achievement-progress" role="progressbar" aria-label="Прогрес: ${escapeHtml(award.label)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${progress}"><span style="width:${percent}%"></span></div><small>${escapeHtml(award.progress_label)}</small>` : ''}
    </div>
    <span class="achievement-nft-serial">#${String(award.level || 1).padStart(2, '0')} · LABORATORIUM</span>
  </article>`;
}
