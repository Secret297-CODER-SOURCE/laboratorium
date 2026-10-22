const CATEGORY_AWARDS = [
  { category: 'osint', level: 1, target: 1, label: 'OSINT: Перший доказ', detail: 'Завершити перший CTF на синтетичних відкритих даних', icon: 'globe' },
  { category: 'osint', level: 2, target: 3, label: 'OSINT: Аналітик джерел', detail: 'Завершити 3 CTF із категорії OSINT', icon: 'search' },
  { category: 'osint', level: 3, target: 5, label: 'OSINT: Майстер зв’язків', detail: 'Завершити 5 CTF із категорії OSINT', icon: 'award' },
  { category: 'web', level: 1, target: 1, label: 'Web: Перша перевірка', detail: 'Завершити перший CTF із веббезпеки', icon: 'code' },
  { category: 'web', level: 2, target: 3, label: 'Web: Дослідник застосунків', detail: 'Завершити 3 CTF із веббезпеки', icon: 'shield' },
  { category: 'network', level: 1, target: 1, label: 'Network: Перший сигнал', detail: 'Завершити перший мережевий CTF', icon: 'activity' },
  { category: 'network', level: 2, target: 3, label: 'Network: Аналізатор трафіку', detail: 'Завершити 3 мережеві CTF', icon: 'target' },
  { category: 'crypto', level: 1, target: 1, label: 'Crypto: Перша розшифровка', detail: 'Завершити перший CTF із криптографії', icon: 'lock' },
  { category: 'crypto', level: 2, target: 3, label: 'Crypto: Розбірник шифрів', detail: 'Завершити 3 CTF із криптографії', icon: 'award' },
  { category: 'forensics', level: 1, target: 1, label: 'Forensics: Перший артефакт', detail: 'Завершити перший CTF із цифрової криміналістики', icon: 'search' },
  { category: 'forensics', level: 2, target: 3, label: 'Forensics: Архіваріус доказів', detail: 'Завершити 3 CTF із цифрової криміналістики', icon: 'award' },
  { category: 'reverse', level: 1, target: 1, label: 'Reverse: Перший розбір', detail: 'Завершити перший CTF з аналізу програм', icon: 'code' },
  { category: 'reverse', level: 2, target: 3, label: 'Reverse: Дослідник бінарних форматів', detail: 'Завершити 3 CTF з аналізу програм', icon: 'award' },
];

function categoryFor(challenge) {
  const category = String(challenge.category || '').toLowerCase();
  if (['network', 'pwn'].includes(category)) return 'network';
  return category;
}

export function getCtfAwards(challenges) {
  const completedByCategory = new Map();
  for (const challenge of challenges || []) {
    if (!challenge.completed || !challenge.ctf_enabled) continue;
    const category = categoryFor(challenge);
    completedByCategory.set(category, (completedByCategory.get(category) || 0) + 1);
  }

  return CATEGORY_AWARDS.map((award) => {
    const progress = Math.min(completedByCategory.get(award.category) || 0, award.target);
    return {
      id: `ctf-${award.category}-${award.level}`,
      label: award.label,
      detail: award.detail,
      icon: award.icon,
      category: award.category,
      level: award.level,
      earned: progress >= award.target,
      progress,
      target: award.target,
      progress_label: `${progress}/${award.target}`,
    };
  });
}
