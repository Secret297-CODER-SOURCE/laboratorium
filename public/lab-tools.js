import { t, getLocale } from '/i18n.js';
import {
  CATEGORIES, DIFFICULTIES, TOOLS, PATHS, SCENARIO, filterTools, pathProgress, scoreScenario,
} from '/lab-tools-catalog.js';
import {
  WORKBENCH_TOOLS, TOOL_CATEGORIES, workbenchStore, createProject, deleteProject, renameProject,
  duplicateProject, addFinding, removeFinding, textToBase64, base64ToText, hexEncode, hexDecode, rot13,
  sha256Hex, multiHash, identifyHash, analyzeHeaders, parseHttpMessage, parseUrlParts, parseUserAgent,
  decodeJwt, testJwtWeakSecret, extractIocs, detectAttackPatterns, testRegex, parseWhoisText,
  analyzeEmailHeaders, calcCidr, generateSubdomainWordlist, extractStrings, xorBruteforce, nestedDecode,
} from '/lab-workbench.js';

const DIFF = { beginner: 'Початковий', intermediate: 'Середній', advanced: 'Просунутий' };
const refState = { query: '', category: 'all', difficulty: 'all' };
const wb = { store: null, activeTool: WORKBENCH_TOOLS[0].id };

function esc(value) {
  const el = document.createElement('span');
  el.textContent = String(value);
  return el.innerHTML;
}

const L = () => (getLocale() === 'en' ? 'en' : 'uk');

// --- Reference catalog (informational, from the previous iteration) -------

function renderReference(root) {
  const loc = L();
  const progress = JSON.parse(localStorage.getItem('lab_tools_progress_v1') || '{}');
  const tools = filterTools(TOOLS, { ...refState, locale: loc });
  const done = progress.done || {};
  root.querySelector('[data-lt="list"]').innerHTML = tools.length ? tools.map((tool) => `
    <article class="lab-tool-card lt-card">
      <h3>${esc(tool.name)}</h3>
      <div class="lt-badges">
        <span class="status-pill">${esc(t(CATEGORIES.find((c) => c.id === tool.category)[loc]))}</span>
        <span class="status-pill">${esc(t(DIFF[tool.difficulty]))}</span>
        ${tool.offensive ? `<span class="status-pill review">${esc(t('Лише інформація'))}</span>` : ''}
      </div>
      <p>${esc(tool.purpose[loc])}</p>
      <p class="lt-meta"><strong>${esc(t('Передумови'))}:</strong> ${esc(tool.prerequisites[loc])}</p>
      <p class="lt-meta"><strong>${esc(t('Вправа'))}:</strong> ${esc(tool.exercise[loc])}</p>
      <div class="lab-tool-actions">
        <a class="btn btn--outline btn--sm" href="${esc(tool.repo)}" target="_blank" rel="noopener noreferrer">${esc(t('Офіційний репозиторій'))}</a>
        <label class="lt-check"><input type="checkbox" data-lt-done="${esc(tool.id)}" ${done[tool.id] ? 'checked' : ''}> ${esc(t('Вивчено'))}</label>
      </div>
    </article>`).join('') : `<p class="empty-state">${esc(t('Нічого не знайдено'))}</p>`;

  root.querySelector('[data-lt="paths"]').innerHTML = PATHS.map((p) => {
    const pr = pathProgress(p, done);
    return `<div class="lt-path"><strong>${esc(p[loc])}</strong>
      <progress max="100" value="${pr.percent}" aria-label="${esc(p[loc])}"></progress>
      <span>${pr.done}/${pr.total}</span></div>`;
  }).join('');
}

function renderScenario(root) {
  const box = root.querySelector('[data-lt="scenario"]');
  box.innerHTML = `
    <p class="lt-meta">${esc(t('Симуляція: жодних запитів до мережі чи реальних моделей. Позначте, які запити є спробою витоку секрету.'))}</p>
    <p class="lt-meta"><code>${esc(SCENARIO.system)}</code></p>
    <ul class="lt-cases">${SCENARIO.cases.map((c) => `
      <li><code>${esc(c.prompt)}</code>
        <label class="lt-check"><input type="checkbox" data-lt-case="${esc(c.id)}"> ${esc(t('Спроба витоку'))}</label></li>`).join('')}
    </ul>
    <div class="lab-tool-actions"><button type="button" class="btn btn--outline btn--sm" data-lt="check">${esc(t('Перевірити'))}</button></div>
    <output class="lab-tool-output" data-lt="result" aria-live="polite"></output>`;
}

function initReference(root) {
  root.querySelector('[data-lt="category"]').innerHTML = `<option value="all">${esc(t('Усі категорії'))}</option>`
    + CATEGORIES.map((c) => `<option value="${c.id}">${esc(t(c[L()]))}</option>`).join('');
  root.querySelector('[data-lt="difficulty"]').innerHTML = `<option value="all">${esc(t('Будь-яка складність'))}</option>`
    + DIFFICULTIES.map((d) => `<option value="${d}">${esc(t(DIFF[d]))}</option>`).join('');
  renderReference(root);
  renderScenario(root);

  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-lt="search"]')) { refState.query = e.target.value; renderReference(root); }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-lt="category"]')) { refState.category = el.value; renderReference(root); }
    else if (el.matches('[data-lt="difficulty"]')) { refState.difficulty = el.value; renderReference(root); }
    else if (el.dataset.ltDone) {
      const data = JSON.parse(localStorage.getItem('lab_tools_progress_v1') || '{}');
      data.done = { ...data.done, [el.dataset.ltDone]: el.checked };
      localStorage.setItem('lab_tools_progress_v1', JSON.stringify(data));
      renderReference(root);
    }
  });
  root.addEventListener('click', (e) => {
    if (!e.target.matches('[data-lt="check"]')) return;
    const answers = {};
    root.querySelectorAll('[data-lt-case]').forEach((cb) => { answers[cb.dataset.ltCase] = cb.checked; });
    const r = scoreScenario(answers);
    root.querySelector('[data-lt="result"]').textContent = `${r.correct}/${r.total} — ${r.passed ? t('Відмінно!') : t('Спробуйте ще раз')}`;
  });
}

// --- Project workbench ------------------------------------------------------

function activeProject() {
  const { store } = wb;
  return store.activeId ? store.projects[store.activeId] : null;
}

function persist(nextStore) {
  wb.store = nextStore;
  workbenchStore.save(wb.store);
}

function downloadProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${project.name.replace(/[^a-z0-9а-яіїє_-]+/gi, '_') || 'project'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderProjectList(root) {
  const list = root.querySelector('[data-wb="project-list"]');
  const projects = Object.values(wb.store.projects).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!projects.length) {
    list.innerHTML = `<p class="empty-state">${esc(t('Немає проєктів. Створіть перший.'))}</p>`;
    return;
  }
  list.innerHTML = projects.map((p) => `
    <div class="lt-project-item ${p.id === wb.store.activeId ? 'active' : ''}" data-wb-project="${esc(p.id)}">
      <button type="button" class="lt-project-select" data-wb-select-project="${esc(p.id)}">
        <strong>${esc(p.name)}</strong>
        <span class="lt-meta">${p.findings.length} ${esc(t('знахідок'))} · ${esc(t('оновлено'))} ${new Date(p.updatedAt).toLocaleDateString()}</span>
      </button>
      <div class="lt-project-actions">
        <button type="button" data-wb-rename-one="${esc(p.id)}" title="${esc(t('Перейменувати'))}" aria-label="${esc(t('Перейменувати'))}">✎</button>
        <button type="button" data-wb-duplicate-one="${esc(p.id)}" title="${esc(t('Дублювати'))}" aria-label="${esc(t('Дублювати'))}">⧉</button>
        <button type="button" data-wb-export-one="${esc(p.id)}" title="${esc(t('Експорт'))}" aria-label="${esc(t('Експорт'))}">⬇</button>
        <button type="button" data-wb-delete-one="${esc(p.id)}" title="${esc(t('Видалити'))}" aria-label="${esc(t('Видалити'))}">✕</button>
      </div>
    </div>`).join('');
}

function renderToolList(root) {
  const list = root.querySelector('[data-wb="tool-list"]');
  list.innerHTML = TOOL_CATEGORIES.map((cat) => {
    const tools = WORKBENCH_TOOLS.filter((tool) => tool.category === cat.id);
    if (!tools.length) return '';
    return `<h4 class="lt-cat-head">${esc(t(cat.name))}</h4>${tools.map((tool) => `
      <button type="button" class="lt-tool-btn ${tool.id === wb.activeTool ? 'active' : ''}" data-wb-tool="${tool.id}">
        ${esc(t(tool.name))}
      </button>`).join('')}`;
  }).join('');
}

function chainOptionsHtml() {
  return WORKBENCH_TOOLS.map((tool) => `<option value="${tool.id}">${esc(t(tool.name))}</option>`).join('');
}

function renderToolForm(root) {
  const tool = WORKBENCH_TOOLS.find((x) => x.id === wb.activeTool);
  root.querySelector('[data-wb="tool-title"]').textContent = t(tool.name);
  root.querySelector('[data-wb="tool-input-label"]').textContent = t(tool.inputLabel);
  const extra = root.querySelector('[data-wb="tool-extra"]');
  const actions = root.querySelector('[data-wb="tool-actions"]');
  const runBtn = `<button type="button" class="btn btn--outline btn--sm" data-wb-run="run">${esc(t('Виконати'))}</button>`;

  if (tool.id === 'url' || tool.id === 'base64' || tool.id === 'hex') {
    extra.hidden = true;
    actions.innerHTML = `<button type="button" class="btn btn--outline btn--sm" data-wb-run="encode">${esc(t('Кодувати'))}</button>
      <button type="button" class="btn btn--outline btn--sm" data-wb-run="decode">${esc(t('Декодувати'))}</button>`;
  } else if (tool.id === 'regex') {
    extra.hidden = false;
    extra.innerHTML = `<input type="text" data-wb="regex-pattern" placeholder="^[a-z]+$" aria-label="${esc(t('Патерн'))}">
      <input type="text" data-wb="regex-flags" placeholder="gi" aria-label="flags" style="max-width:80px">`;
    actions.innerHTML = runBtn;
  } else if (tool.id === 'jwt-weak-secret') {
    extra.hidden = false;
    extra.innerHTML = `<textarea data-wb="jwt-wordlist" rows="3" style="width:100%"
      placeholder="${esc(t("Список можливих секретів, по одному в рядку"))}" aria-label="${esc(t("Вордлист секретів"))}"></textarea>`;
    actions.innerHTML = runBtn;
  } else if (tool.id === 'subdomains') {
    extra.hidden = false;
    extra.innerHTML = `<input type="text" data-wb="subdomain-extra" placeholder="${esc(t('Додаткові слова через кому'))}" aria-label="${esc(t('Додаткові слова'))}">`;
    actions.innerHTML = runBtn;
  } else if (tool.id === 'strings') {
    extra.hidden = false;
    extra.innerHTML = `<label>${esc(t('Мінімальна довжина'))}
      <input type="number" data-wb="strings-min" value="4" min="1" max="64" style="max-width:80px"></label>`;
    actions.innerHTML = runBtn;
  } else {
    extra.hidden = true;
    actions.innerHTML = runBtn;
  }
  root.querySelector('[data-wb="tool-input"]').value = '';
}

function kvRows(pairs) {
  return pairs.filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([label, v]) => `<p class="lt-meta"><strong>${esc(label)}:</strong> ${esc(Array.isArray(v) ? v.join(', ') : String(v))}</p>`).join('');
}

const FINDERS = {
  ioc: {
    summary: (r) => t('Знайдено індикаторів: {n}', { n: r.ips.length + r.domains.length + r.emails.length + r.urls.length + r.hashes.md5.length + r.hashes.sha1.length + r.hashes.sha256.length }),
    body: (r) => {
      const rows = [
        ['IP', r.ips], ['Domains', r.domains], ['Emails', r.emails], ['URLs', r.urls],
        ['MD5', r.hashes.md5], ['SHA1', r.hashes.sha1], ['SHA256', r.hashes.sha256],
      ].filter(([, arr]) => arr.length);
      return rows.length ? rows.map(([label, arr]) => `<p class="lt-meta"><strong>${esc(label)}:</strong> ${arr.map(esc).join(', ')}</p>`).join('') : `<p>${esc(t('Нічого не знайдено'))}</p>`;
    },
    chain: (r) => [...r.ips, ...r.domains, ...r.emails, ...r.urls, ...r.hashes.md5, ...r.hashes.sha1, ...r.hashes.sha256].join('\n'),
  },
  jwt: {
    summary: () => t('JWT розкодовано (підпис не перевірявся)'),
    body: (r) => `<p class="lt-meta"><strong>header:</strong></p><pre class="lab-tool-output">${esc(JSON.stringify(r.header, null, 2))}</pre>
      <p class="lt-meta"><strong>payload:</strong></p><pre class="lab-tool-output">${esc(JSON.stringify(r.payload, null, 2))}</pre>
      <p class="lt-meta">${r.hasSignature ? esc(t('Підпис присутній, але не перевірявся.')) : esc(t('Підпис відсутній.'))}</p>`,
    chain: (r) => JSON.stringify(r.payload, null, 2),
  },
  'jwt-weak-secret': {
    summary: (r) => (!r.supported ? t('Алгоритм {alg} не підтримується для локальної перевірки', { alg: r.alg })
      : r.found ? t('Знайдено слабкий секрет!') : t('Секрет не знайдено серед {n} варіантів', { n: r.tested })),
    body: (r) => (!r.supported
      ? `<p>${esc(t('Локальна перевірка підтримує лише алгоритм HS256.'))}</p>`
      : kvRows([[t('Алгоритм'), r.alg], [t('Перевірено варіантів'), r.tested], [t('Знайдений секрет'), r.found || t('не знайдено')]])),
    chain: (r) => r.found || '',
  },
  headers: {
    summary: (r) => t('Перевірено заголовків: {n}', { n: r.length }),
    body: (r) => `<ul class="lab-tool-checklist">${r.map((c) => `
      <li class="${c.ok ? 'is-ok' : 'is-review'}"><span aria-hidden="true">${c.ok ? '✓' : '!'}</span>${esc(t(c.label))}</li>
    `).join('')}</ul>`,
    chain: (r, input) => input,
  },
  'http-request': {
    summary: (r) => (r.requestLine ? t('Розпізнано запит: {m} {p}', { m: r.requestLine.method, p: r.requestLine.path }) : t('Розпізнано відповідь: {s}', { s: r.statusLine.status })),
    body: (r) => `${kvRows([
      ['Method', r.requestLine?.method], ['Path', r.requestLine?.path], ['HTTP', r.requestLine?.version],
      ['Status', r.statusLine ? `${r.statusLine.status} ${r.statusLine.statusText}` : null],
    ])}<p class="lt-meta"><strong>Headers:</strong></p><pre class="lab-tool-output">${esc(JSON.stringify(r.headers, null, 2))}</pre>
      ${r.body ? `<p class="lt-meta"><strong>Body:</strong></p><pre class="lab-tool-output">${esc(r.body)}</pre>` : ''}`,
    chain: (r) => r.body || JSON.stringify(r.headers, null, 2),
  },
  'url-parse': {
    summary: (r) => t('Хост: {h}', { h: r.host }),
    body: (r) => kvRows([
      ['Protocol', r.protocol], ['Host', r.host], ['Port', r.port], ['Path', r.path],
      ['Query', r.query.map(([k, v]) => `${k}=${v}`)], ['Hash', r.hash],
    ]),
    chain: (r) => r.host,
  },
  'user-agent': {
    summary: (r) => `${r.browser.name} ${r.browser.version || ''} / ${r.os}`.trim(),
    body: (r) => kvRows([
      ['Browser', `${r.browser.name} ${r.browser.version || ''}`.trim()], ['OS', r.os],
      ['Bot?', r.isBot ? t('так') : t('ні')], ['Mobile?', r.isMobile ? t('так') : t('ні')],
    ]),
    chain: (r) => r.raw,
  },
  whois: {
    summary: (r) => t('Розпізнано полів: {n}', { n: Object.keys(r).length }),
    body: (r) => (Object.keys(r).length ? kvRows(Object.entries(r)) : `<p>${esc(t('Нічого не розпізнано'))}</p>`),
    chain: (r) => Object.entries(r).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n'),
  },
  'email-header': {
    summary: (r) => (r.possibleSpoofHint ? t('Увага: From і Reply-To різні домени') : t('Перевірку виконано')),
    body: (r) => kvRows([
      ['From', r.from], ['Reply-To', r.replyTo], ['SPF', r.spf], ['DKIM', r.dkim], ['DMARC', r.dmarc],
      ['Received hops', r.receivedHops], [t('Можлива підміна'), r.possibleSpoofHint ? t('так') : t('ні')],
    ]),
    chain: (r, input) => input,
  },
  cidr: {
    summary: (r) => t('{net}, хостів: {n}', { net: `${r.network}/${r.prefix}`, n: r.usableHosts }),
    body: (r) => kvRows([
      ['Network', `${r.network}/${r.prefix}`], ['Broadcast', r.broadcast], ['Mask', r.mask],
      ['First host', r.firstHost], ['Last host', r.lastHost], ['Total', r.totalAddresses], ['Usable', r.usableHosts],
    ]),
    chain: (r) => `${r.network}/${r.prefix}`,
  },
  subdomains: {
    summary: (r) => t('Згенеровано варіантів: {n}', { n: r.length }),
    body: (r) => `<pre class="lab-tool-output">${esc(r.join('\n'))}</pre>`,
    chain: (r) => r.join('\n'),
  },
  strings: {
    summary: (r) => t('Знайдено рядків: {n}', { n: r.length }),
    body: (r) => (r.length ? `<ul class="lab-tool-checklist">${r.map((s) => `<li><code>${esc(s)}</code></li>`).join('')}</ul>` : `<p>${esc(t('Нічого не знайдено'))}</p>`),
    chain: (r) => r.join('\n'),
  },
  xor: {
    summary: (r) => t('Найкращий кандидат: ключ 0x{k}', { k: r[0].hex }),
    body: (r) => `<ul class="lab-tool-checklist">${r.map((c) => `<li>0x${esc(c.hex)} (${(c.printableRatio * 100).toFixed(0)}%): <code>${esc(c.text)}</code></li>`).join('')}</ul>`,
    chain: (r) => r[0].text,
  },
  'nested-decode': {
    summary: (r) => t('Виявлено шарів: {n}', { n: r.length - 1 }),
    body: (r) => r.map((l) => `<p class="lt-meta"><strong>${esc(l.encoding)}:</strong></p><pre class="lab-tool-output">${esc(l.value)}</pre>`).join(''),
    chain: (r) => r[r.length - 1].value,
  },
  'attack-pattern': {
    summary: (r) => (r.length ? t('Знайдено патернів: {n}', { n: r.length }) : t('Підозрілих патернів не знайдено')),
    body: (r) => (r.length ? r.map((s) => `<p class="lt-meta"><strong>${esc(s.label)} (${s.count}):</strong> ${s.samples.map(esc).join(', ')}</p>`).join('') : `<p>${esc(t('Підозрілих патернів не знайдено'))}</p>`),
    chain: (r, input) => input,
  },
  regex: {
    summary: (r) => t('Збігів: {n}', { n: r.count }),
    body: (r) => (r.matches.length ? `<ul class="lab-tool-checklist">${r.matches.map((m) => `<li>#${m.index}: <code>${esc(m.match)}</code></li>`).join('')}</ul>` : `<p>${esc(t('Нічого не знайдено'))}</p>`),
    chain: (r) => r.matches.map((m) => m.match).join('\n'),
  },
  'hash-multi': {
    summary: () => t('Виконано'),
    body: (r) => kvRows(Object.entries(r).map(([k, v]) => [k.toUpperCase(), v])),
    chain: (r) => r.sha256,
  },
  'hash-identify': {
    summary: (r) => r.candidates.join(', '),
    body: (r) => `<p class="lt-meta">${esc(r.candidates.join(', '))}</p>`,
    chain: (r, input) => input,
  },
};

function findingSummary(toolId, result, input) {
  return FINDERS[toolId] ? FINDERS[toolId].summary(result, input) : t('Виконано');
}

function renderFindingBody(toolId, result, input) {
  if (FINDERS[toolId]) return FINDERS[toolId].body(result, input);
  return `<pre class="lab-tool-output">${esc(String(result))}</pre>`;
}

function chainTextFor(toolId, result, input) {
  if (FINDERS[toolId]?.chain) return FINDERS[toolId].chain(result, input);
  return typeof result === 'string' ? result : input;
}

function renderFindings(root) {
  const project = activeProject();
  const box = root.querySelector('[data-wb="findings"]');
  if (!project) { box.innerHTML = `<p class="empty-state">${esc(t('Створіть проєкт, щоб почати'))}</p>`; return; }
  if (!project.findings.length) { box.innerHTML = `<p class="empty-state">${esc(t('Поки немає знахідок. Запустіть інструмент зліва.'))}</p>`; return; }
  box.innerHTML = project.findings.map((f) => `
    <article class="lt-finding">
      <div class="lt-finding-head">
        <strong>${esc(t(WORKBENCH_TOOLS.find((x) => x.id === f.toolId)?.name || f.toolId))}</strong>
        <span class="lt-meta">${new Date(f.createdAt).toLocaleString()}</span>
        <button type="button" class="btn btn--outline btn--sm" data-wb-remove="${esc(f.id)}">${esc(t('Видалити'))}</button>
      </div>
      <p class="lt-meta">${esc(f.summary)}</p>
      <div class="lt-finding-body">${f.body}</div>
      ${f.chainText ? `<div class="lt-chain">
        <select data-wb-chain-select aria-label="${esc(t('Надіслати в інструмент'))}">${chainOptionsHtml()}</select>
        <button type="button" class="btn btn--outline btn--sm" data-wb-chain-send="${esc(f.id)}">${esc(t('➜ Надіслати в інструмент'))}</button>
      </div>` : ''}
    </article>`).join('');
}

function renderWorkbench(root) {
  renderProjectList(root);
  renderToolList(root);
  renderToolForm(root);
  renderFindings(root);
}

async function runTool(root, action) {
  const tool = wb.activeTool;
  const input = root.querySelector('[data-wb="tool-input"]').value;
  const project = activeProject();
  if (!project) { window.alert?.(t('Спочатку створіть або оберіть проєкт')); return; }
  try {
    let result;
    if (tool === 'url') result = action === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input);
    else if (tool === 'base64') result = action === 'encode' ? textToBase64(input) : base64ToText(input);
    else if (tool === 'hex') result = action === 'encode' ? hexEncode(input) : hexDecode(input);
    else if (tool === 'rot13') result = rot13(input);
    else if (tool === 'hash') result = await sha256Hex(input);
    else if (tool === 'hash-multi') result = await multiHash(input);
    else if (tool === 'hash-identify') result = identifyHash(input);
    else if (tool === 'headers') result = analyzeHeaders(input);
    else if (tool === 'http-request') result = parseHttpMessage(input);
    else if (tool === 'url-parse') result = parseUrlParts(input);
    else if (tool === 'user-agent') result = parseUserAgent(input);
    else if (tool === 'jwt') result = decodeJwt(input);
    else if (tool === 'jwt-weak-secret') {
      const wordlist = root.querySelector('[data-wb="jwt-wordlist"]')?.value || '';
      result = await testJwtWeakSecret(input, wordlist);
    } else if (tool === 'ioc') result = extractIocs(input);
    else if (tool === 'attack-pattern') result = detectAttackPatterns(input);
    else if (tool === 'regex') {
      const pattern = root.querySelector('[data-wb="regex-pattern"]').value;
      const flags = root.querySelector('[data-wb="regex-flags"]').value;
      result = testRegex(pattern, flags, input);
    } else if (tool === 'whois') result = parseWhoisText(input);
    else if (tool === 'email-header') result = analyzeEmailHeaders(input);
    else if (tool === 'cidr') result = calcCidr(input);
    else if (tool === 'subdomains') {
      const extra = root.querySelector('[data-wb="subdomain-extra"]')?.value || '';
      result = generateSubdomainWordlist(input, extra);
    } else if (tool === 'strings') {
      const min = Number(root.querySelector('[data-wb="strings-min"]')?.value) || 4;
      result = extractStrings(input, min);
    } else if (tool === 'xor') result = xorBruteforce(input);
    else if (tool === 'nested-decode') result = nestedDecode(input);
    else throw new Error(`unknown tool: ${tool}`);

    const summary = findingSummary(tool, result, input);
    const body = renderFindingBody(tool, result, input);
    const chainText = chainTextFor(tool, result, input);
    persist(addFinding(wb.store, project.id, {
      toolId: tool, input, summary, body, chainText,
    }));
    renderFindings(root);
  } catch (err) {
    persist(addFinding(wb.store, project.id, {
      toolId: tool, input, summary: t('Помилка'), body: `<p class="lt-meta">${esc(err.message)}</p>`,
    }));
    renderFindings(root);
  }
}

function initWorkbench(root) {
  wb.store = workbenchStore.load();
  if (!Object.keys(wb.store.projects).length) {
    persist(createProject(wb.store, t('Мій перший проєкт')));
  }
  renderWorkbench(root);

  root.querySelector('[data-wb="new-project"]').addEventListener('click', () => {
    const name = window.prompt?.(t('Назва проєкту'), t('Новий проєкт'));
    if (name === null) return;
    persist(createProject(wb.store, name || t('Новий проєкт')));
    renderWorkbench(root);
  });

  root.querySelector('[data-wb="project-list"]').addEventListener('click', (e) => {
    const selectBtn = e.target.closest('[data-wb-select-project]');
    const renameBtn = e.target.closest('[data-wb-rename-one]');
    const duplicateBtn = e.target.closest('[data-wb-duplicate-one]');
    const exportBtn = e.target.closest('[data-wb-export-one]');
    const deleteBtn = e.target.closest('[data-wb-delete-one]');
    if (selectBtn) {
      wb.store = { ...wb.store, activeId: selectBtn.dataset.wbSelectProject };
      persist(wb.store);
      renderWorkbench(root);
    } else if (renameBtn) {
      const id = renameBtn.dataset.wbRenameOne;
      const project = wb.store.projects[id];
      const name = window.prompt?.(t('Нова назва'), project?.name);
      if (!name) return;
      persist(renameProject(wb.store, id, name));
      renderProjectList(root);
    } else if (duplicateBtn) {
      persist(duplicateProject(wb.store, duplicateBtn.dataset.wbDuplicateOne));
      renderWorkbench(root);
    } else if (exportBtn) {
      const project = wb.store.projects[exportBtn.dataset.wbExportOne];
      if (project) downloadProject(project);
    } else if (deleteBtn) {
      const id = deleteBtn.dataset.wbDeleteOne;
      if (!window.confirm?.(t('Видалити проєкт разом із усіма знахідками?'))) return;
      persist(deleteProject(wb.store, id));
      renderWorkbench(root);
    }
  });

  root.querySelector('[data-wb="tool-list"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wb-tool]');
    if (!btn) return;
    wb.activeTool = btn.dataset.wbTool;
    renderToolList(root);
    renderToolForm(root);
  });
  root.querySelector('[data-wb="tool-form"]').addEventListener('submit', (e) => e.preventDefault());
  root.querySelector('[data-wb="tool-actions"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wb-run]');
    if (!btn) return;
    runTool(root, btn.dataset.wbRun);
  });
  root.querySelector('[data-wb="findings"]').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-wb-remove]');
    const chainBtn = e.target.closest('[data-wb-chain-send]');
    if (removeBtn) {
      const project = activeProject();
      if (!project) return;
      persist(removeFinding(wb.store, project.id, removeBtn.dataset.wbRemove));
      renderFindings(root);
      return;
    }
    if (chainBtn) {
      const project = activeProject();
      const finding = project?.findings.find((f) => f.id === chainBtn.dataset.wbChainSend);
      if (!finding) return;
      const select = chainBtn.closest('.lt-finding').querySelector('[data-wb-chain-select]');
      wb.activeTool = select.value;
      renderToolList(root);
      renderToolForm(root);
      const input = root.querySelector('[data-wb="tool-input"]');
      input.value = finding.chainText || '';
      input.focus();
    }
  });
}

export function initLabTools() {
  const panel = document.getElementById('lab-panel-tools');
  if (!panel || panel.dataset.ready) return;
  panel.dataset.ready = '1';
  initWorkbench(document.getElementById('lab-tools-lab'));
  initReference(panel);
}
