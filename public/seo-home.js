/** Dynamic ItemList / Course JSON-LD for homepage programs. */
export async function injectProgramsSchema() {
  const slot = document.getElementById('programs-schema');
  if (!slot) return;
  try {
    const res = await fetch('/api/programs');
    if (!res.ok) return;
    const data = await res.json();
    const programs = (data.programs || data || []).filter((p) => p?.is_active !== 0 && p?.id);
    if (!programs.length) return;

    const base = 'https://laboratorium.club';
    const itemListElement = programs.slice(0, 40).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Course',
        name: p.name,
        description: String(p.description || `Навчальна програма «${p.name}» у школі laboratorium.`).slice(0, 240),
        url: `${base}/course.html?id=${p.id}`,
        provider: {
          '@type': 'EducationalOrganization',
          name: 'laboratorium.',
          url: `${base}/`,
        },
        educationalLevel: p.level || undefined,
        timeRequired: p.duration || undefined,
        inLanguage: 'uk',
      },
    }));

    slot.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Навчальні програми laboratorium.',
      itemListOrder: 'https://schema.org/ItemListUnordered',
      numberOfItems: itemListElement.length,
      itemListElement,
    });
  } catch {
    /* SEO enrichment is optional */
  }
}
