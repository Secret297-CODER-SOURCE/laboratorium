const THEMES = {
  devops: { label: 'DevOps', palette: ['#8fd0ff', '#2f7fd1', '#ffd37a', '#0b1423'] },
  lab: { label: 'Lab', palette: ['#a6f2c4', '#3fae7a', '#f4d77f', '#0b1423'] },
  code: { label: 'Code', palette: ['#d2b8ff', '#8a5cf0', '#ff9ccf', '#0b1423'] },
  redteam: { label: 'Red Team', palette: ['#ff6b78', '#c4263d', '#ffbf69', '#100b12'] },
};

export const NFT_STICKERS = [
  { id: 'container', theme: 'devops', title: 'Container', rarity: 'uncommon', rows: [
    '...........', '.ddddddddd.', '.dabababad.', '.ddddddddd.', '.dcbcbcbcd.', '.ddddddddd.',
    '.dabababad.', '.ddddddddd.', '...d...d...', '...........', '...........'] },
  { id: 'pipeline', theme: 'devops', title: 'CI/CD', rarity: 'rare', rows: [
    '...........', '...........', 'aaa.bbb.ccc', 'aaa.bbb.ccc', 'aaa.bbb.ccc', '...........',
    '.ddddddddd.', '.aaaaabbcc.', '.ddddddddd.', '...........', '...........'] },
  { id: 'cloud', theme: 'devops', title: 'Cloud', rarity: 'uncommon', rows: [
    '...........', '....aaa....', '..aaaaaaa..', '.aaaaaaaaaa', 'aaaaaaaaaaa', 'aaabaaabaaa',
    '.aaaaaaaaa.', '....c.c....', '....c.c....', '...........', '...........'] },
  { id: 'gear', theme: 'devops', title: 'Automation', rarity: 'rare', rows: [
    '.....a.....', '..a.aaa.a..', '...aaaaa...', '.aaaa.aaaa.', '.aaa...aaa.', 'aaaa.c.aaaa',
    '.aaa...aaa.', '.aaaa.aaaa.', '...aaaaa...', '..a.aaa.a..', '.....a.....'] },
  { id: 'flask', theme: 'lab', title: 'Experiment', rarity: 'uncommon', rows: [
    '...ddddd...', '....dad....', '....dad....', '....dad....', '...daaad...', '..dabbbad..',
    '.dabbcbbad.', '.dbbbbbbbd.', '.dbbcbbcbd.', '..ddddddd..', '...........'] },
  { id: 'dna', theme: 'lab', title: 'Genome', rarity: 'legendary', rows: [
    'aa.......bb', '.aa.ccc.bb.', '..aa.c.bb..', '...aa.bb...', '....aab....', '...bb.aa...',
    '..bb.c.aa..', '.bb.ccc.aa.', 'bb.......aa', '...........', '...........'] },
  { id: 'shield', theme: 'lab', title: 'Secure', rarity: 'rare', rows: [
    '.ddddddddd.', '.daaaaaaad.', '.daaaaaacd.', '.dacaaacad.', '.daccaccad.', '.dabcccbad.',
    '.dabbcbbad.', '..dabbbad..', '...dabad...', '....ddd....', '...........'] },
  { id: 'lock', theme: 'lab', title: 'Encrypted', rarity: 'uncommon', rows: [
    '...aaaaa...', '..a.....a..', '..a.....a..', '.bbbbbbbbb.', '.bbbbdbbbb.', '.bbbbdbbbb.',
    '.bbbbbbbbb.', '.bbbbbbbbb.', '.ddddddddd.', '...........', '...........'] },
  { id: 'bug', theme: 'code', title: 'Bug found', rarity: 'rare', rows: [
    '..d.....d..', '...d...d...', '....ddd....', '...daaad...', '.dddabaddd.', '...dabad...',
    '.dddabaddd.', '...dabad...', '..dd.a.dd..', '...........', '...........'] },
  { id: 'terminal', theme: 'code', title: 'Shell', rarity: 'uncommon', rows: [
    'aaaaaaaaaaa', 'abbbbbbbbba', 'aaaaaaaaaaa', 'addddddddda', 'adcddddddda', 'addcdddddda',
    'adcddcccdda', 'addddddddda', 'addddddddda', 'aaaaaaaaaaa', '...........'] },
  { id: 'git', theme: 'code', title: 'Branch', rarity: 'rare', rows: [
    '.aaa...ccc.', '.aaa...ccc.', '.aaa...ccc.', '..b.....b..', '..b....b...', '..b..bb....',
    '..bbb......', '..b........', '.aaa.......', '.aaa.......', '.aaa.......'] },
  { id: 'braces', theme: 'code', title: 'Syntax', rarity: 'uncommon', rows: [
    '...........', '..aa...aa..', '..a.....a..', '.a.......a.', 'a....c....a', '.a.......a.',
    '..a.....a..', '..a.....a..', '..aa...aa..', '...........', '...........'] },
  { id: 'rocket', theme: 'code', title: 'Deploy', rarity: 'legendary', rows: [
    '.....a.....', '....aaa....', '...aaaaa...', '...abbba...', '...abcba...', '...abbba...',
    '...aaaaa...', '..aa.a.aa..', '..a..d..a..', '.....c.....', '....ccc....'] },
  { id: 'key', theme: 'lab', title: 'Access key', rarity: 'rare', rows: [
    '...........', '..aaa......', '.a...a.....', '.a.c.a.....', '.a...a.....', '..aaabbbbbb',
    '......b.b.b', '...........', '...........', '...........', '...........'] },
  { id: 'coffee', theme: 'code', title: 'Fuel', rarity: 'uncommon', rows: [
    '...b..b....', '....b..b...', '...........', '.aaaaaaaa..', '.abbbbbbaaa', '.abbbbbba.a',
    '.abbbbbbaaa', '..abbbbba..', '..aaaaaaa..', '.aaaaaaaaa.', '...........'] },
  { id: 'root', theme: 'devops', title: 'Root', rarity: 'legendary', rows: [
    '...........', '...a...a...', '...a...a...', '.aaaaaaaaa.', '...a...a...', '...a...a...',
    '.aaaaaaaaa.', '...a...a...', '...a...a...', '...........', '...........'] },
  { id: 'recon', theme: 'redteam', title: 'Recon', rarity: 'rare', rows: [
    '....aaa....', '...a...a...', '..a.....a..', '.a..ccc..a.', 'a..ccccc..a', 'a..ccccc..a',
    '.a..ccc..a.', '..a.....a..', '...a...a...', '....aaa....', '...........'] },
  { id: 'scope', theme: 'redteam', title: 'Scope', rarity: 'uncommon', rows: [
    '..aaa......', '.a...a.....', 'a..ccc.a...', 'a.c...ca...', 'a.c...ca...', 'a..ccc.a...',
    '.a...a.....', '..aaa......', '......b....', '.......b...', '........b..'] },
  { id: 'proxy', theme: 'redteam', title: 'Proxy', rarity: 'rare', rows: [
    '...........', '..aaa...ccc', '.a...a.c..c', '.a.b.a.c..c', '.a...a.c..c', '..aaa...ccc',
    '....b......', '....b......', '..aaa...ccc', '.a...a.c..c', '...........'] },
  { id: 'packets', theme: 'redteam', title: 'Packets', rarity: 'uncommon', rows: [
    '...........', '.aaaaaaaaa.', '.abbbbbbbb.', '.a.c..c..a.', '.aaaaaaaaa.', '..aaaaaaaaa',
    '..abbbbbbbb', '..a..c..c.a', '..aaaaaaaaa', '...........', '...........'] },
  { id: 'firewall', theme: 'redteam', title: 'Firewall', rarity: 'rare', rows: [
    'aaaaaaaaaaa', 'abbbabbbabb', 'abbbabbbabb', 'aaaaaaaaaaa', 'bbabbbabbbb', 'bbabbbabbbb',
    'aaaaaaaaaaa', 'abbbabbbabb', 'abbbabbbabb', 'aaaaaaaaaaa', '...........'] },
  { id: 'web-audit', theme: 'redteam', title: 'Web audit', rarity: 'uncommon', rows: [
    '.aaaaaaaaa.', '.abbbbbbbba', '.ab.c...bba', '.ab..c..bba', '.ab...c.bba', '.abbbbbbbba',
    '.aaaaaaaaa.', '...b...b...', '...b...b...', '...........', '...........'] },
  { id: 'bug-bounty', theme: 'redteam', title: 'Bug bounty', rarity: 'legendary', rows: [
    '....aaa....', '...a...a...', '..a.....a..', '.a..ccc..a.', '.a.c...c.a.', '.a.c.a.c.a.',
    '.a..aaa..a.', '..a.....a..', '...a...a...', '....aaa....', '...........'] },
  { id: 'forensics', theme: 'redteam', title: 'Forensics', rarity: 'rare', rows: [
    '....aaa....', '...a...a...', '..a.....a..', '..a.ccc.a..', '..a.c.c.a..', '..a.ccc.a..',
    '...a...a...', '....aaa....', '......b....', '.....b.....', '....b......'] },
  { id: 'opsec', theme: 'redteam', title: 'OPSEC', rarity: 'legendary', rows: [
    '...aaaaa...', '..a.....a..', '.a..ccc..a.', 'a..c...c..a', 'a..c...c..a', 'a..c...c..a',
    '.a..ccc..a.', '..a.....a..', '...aaaaa...', '...........', '...........'] },
  { id: 'terminal-red', theme: 'redteam', title: 'Shell access', rarity: 'rare', rows: [
    'aaaaaaaaaaa', 'abbbbbbbbba', 'aaaaaaaaaaa', 'a........a.', 'a..c......a', 'a...c.....a',
    'a....ccc..a', 'a......c..a', 'a........a.', 'aaaaaaaaaaa', '...........'] },
  { id: 'signal', theme: 'redteam', title: 'Signal', rarity: 'uncommon', rows: [
    '.....a.....', '....aaa....', '...a...a...', '..a.....a..', '.a..ccc..a.', '.....c.....',
    '.....c.....', '.....c.....', '....ccc....', '...........', '...........'] },
  { id: 'cipher', theme: 'redteam', title: 'Cipher', rarity: 'rare', rows: [
    '.aaaaaaaaa.', '.abbbbbbba.', '.ab.c..bba.', '.a..c..bba.', '.abbbbbbba.', '.ab.c..bba.',
    '.ab...c.bba', '.abbbbbbba.', '.aaaaaaaaa.', '...........', '...........'] },
  { id: 'decoy', theme: 'redteam', title: 'Decoy', rarity: 'uncommon', rows: [
    '...aaaaa...', '..a.....a..', '.a..ccc..a.', 'a..c...c..a', 'a..c...c..a', '.a..ccc..a.',
    '..a.....a..', '...aaaaa...', '......b....', '.....b.....', '...........'] },
  { id: 'endpoint', theme: 'redteam', title: 'Endpoint', rarity: 'rare', rows: [
    '.aaaaaaaaa.', '.abbbbbbbba', '.ab.c...bba', '.ab.....bba', '.ab..c..bba', '.ab.....bba',
    '.abbbbbbbba', '.aaaaaaaaa.', '...b...b...', '..b.....b..', '...........'] },
  { id: 'network-map', theme: 'redteam', title: 'Network map', rarity: 'legendary', rows: [
    '..aaa...bbb', '.a...a.b..b', 'a..c.ab.c.b', '.a...a.b..b', '..aaa...bbb', '.....c.....',
    '..aaa...bbb', '.a...a.b..b', 'a..c.ab.c.b', '.a...a.b..b', '..aaa...bbb'] },
  { id: 'lockpick', theme: 'redteam', title: 'Lock research', rarity: 'uncommon', rows: [
    '....aaa....', '...a...a...', '..a.....a..', '..a.....a..', '..aaaaaaaaa', '......b....',
    '......b....', '....bbb....', '...b.......', '..b........', '...........'] },
  { id: 'reverse', theme: 'redteam', title: 'Reverse lab', rarity: 'rare', rows: [
    'aaaaaaaaaaa', 'abbbbbbbbba', 'aaabbbbaaaa', '..a....a...', '..a.c..a...', '..a....a...',
    '..aaaaaa...', '....bb.....', '...b..b....', '...........', '...........'] },
  { id: 'trace', theme: 'redteam', title: 'Trace route', rarity: 'uncommon', rows: [
    'a..........', '.a.........', '..a...bbb..', '...a.b...b.', '....ab...b.', '.....a.bbb.',
    '......a....', '.......a...', '........a..', '.........a.', '..........a'] },
  { id: 'zero-day', theme: 'redteam', title: 'Zero day', rarity: 'legendary', rows: [
    '...aaaaa...', '..a.....a..', '.a..ccc..a.', 'a..c...c..a', 'a..c...c..a', 'a..c...c..a',
    '.a..ccc..a.', '..a.....a..', '...aaaaa...', '.....b.....', '....bbb....'] },
  { id: 'red-team', theme: 'redteam', title: 'Red team', rarity: 'legendary', rows: [
    'aaaaaaaaaaa', 'abbbbbbbbba', 'ab..c....ba', 'ab.c.c...ba', 'ab..c....ba', 'ab..c....ba',
    'ab..c....ba', 'abbbbbbbbba', 'aaaaaaaaaaa', '...........', '...........'] },
];

export const STICKER_THEMES = Object.entries(THEMES).map(([id, theme]) => ({ id, label: theme.label }));

function pixelArt(sticker) {
  const [a, b, c, d] = THEMES[sticker.theme].palette;
  const colors = { a, b, c, d };
  const rects = sticker.rows.flatMap((row, y) => [...row].flatMap((cell, x) => (
    colors[cell] ? `<rect x="${x * 8}" y="${y * 8}" width="8" height="8" fill="${colors[cell]}"/>` : []
  ))).join('');
  return `<svg class="nft-sticker-art" viewBox="0 0 88 88" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export function getNftSticker(id) {
  return NFT_STICKERS.find((sticker) => sticker.id === id) || null;
}

export function renderNftSticker(id, { mini = false } = {}) {
  const sticker = getNftSticker(id);
  if (!sticker) return '';
  const theme = THEMES[sticker.theme];
  const number = String(NFT_STICKERS.indexOf(sticker) + 1).padStart(2, '0');
  return `<figure class="nft-sticker${mini ? ' is-mini' : ''}" data-theme="${sticker.theme}" data-rarity="${sticker.rarity}" style="--nft-a:${theme.palette[0]};--nft-b:${theme.palette[1]};--nft-c:${theme.palette[2]}">
    <div class="nft-sticker-top"><span>LAB / ${theme.label.toUpperCase()}</span><span>#${number}</span></div>
    <div class="nft-sticker-frame">${pixelArt(sticker)}</div>
    <figcaption>${sticker.title}<small>${sticker.rarity}</small></figcaption>
  </figure>`;
}
