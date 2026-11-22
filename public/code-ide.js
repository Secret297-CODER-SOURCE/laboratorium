// Pure IDE helpers for the student code editor. No DOM, no network.

export const LANGUAGE_LABELS = {
  python: 'Python', node: 'Node.js', cpp: 'C++', bash: 'Bash', web: 'Web (HTML/CSS/JS)',
};

export const HISTORY_PREFIX = 'lab_ide_history_v1:';
const DEFAULT_MAX_PER_FILE = 25;
const DEFAULT_MAX_BYTES = 180_000;

export function modeForFile(language, path) {
  const p = String(path || '');
  if (/\.md$/i.test(p)) return 'htmlmixed';
  if (/\.css$/i.test(p)) return 'css';
  if (/\.html?$/i.test(p)) return 'htmlmixed';
  if (/\.json$/i.test(p)) return 'javascript';
  if (/\.(py)$/i.test(p) || language === 'python') return 'python';
  if (/\.(js|mjs|cjs|ts)$/i.test(p) || language === 'node') return 'javascript';
  if (/\.(c|h|cpp|hpp|cc)$/i.test(p) || language === 'cpp') return 'text/x-c++src';
  if (/\.(sh|bash)$/i.test(p) || language === 'bash') return 'shell';
  if (language === 'web') return 'javascript';
  return 'javascript';
}

export function commentPrefix(language, path) {
  const p = String(path || '');
  if (/\.css$/i.test(p)) return { start: '/* ', end: ' */' };
  if (/\.html?$/i.test(p)) return { start: '<!-- ', end: ' -->' };
  if (language === 'python' || /\.py$/i.test(p) || language === 'bash' || /\.(sh|bash)$/i.test(p)) {
    return { start: '# ', end: '' };
  }
  return { start: '// ', end: '' };
}

export function toggleLineComments(lines, prefix) {
  const start = prefix.start || '# ';
  const end = prefix.end || '';
  const meaningful = lines.filter((line) => line.trim().length);
  const commented = meaningful.length > 0 && meaningful.every((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith(start.trim()) || trimmed.startsWith(start);
  });
  return lines.map((line) => {
    if (!line.trim()) return line;
    const indent = line.match(/^\s*/)?.[0] || '';
    const body = line.slice(indent.length);
    if (commented) {
      let next = body;
      if (next.startsWith(start)) next = next.slice(start.length);
      else if (next.startsWith(start.trim())) next = next.slice(start.trim().length);
      if (end && next.endsWith(end)) next = next.slice(0, -end.length);
      return indent + next;
    }
    return indent + start + body + end;
  });
}

export function buildFileTree(files) {
  const root = { name: '', path: '', type: 'dir', children: [] };
  for (const file of files || []) {
    const parts = String(file.path || '').split('/').filter(Boolean);
    if (!parts.length) continue;
    let node = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, type: isFile ? 'file' : 'dir', children: isFile ? undefined : [] };
        node.children.push(child);
      }
      if (!isFile) node = child;
    });
  }
  const sortNode = (node) => {
    if (!node.children) return node;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
    return node;
  };
  return sortNode(root);
}

export function findRanges(text, query, { caseSensitive = false } = {}) {
  const source = String(text || '');
  const needle = String(query || '');
  if (!needle) return [];
  const hay = caseSensitive ? source : source.toLowerCase();
  const q = caseSensitive ? needle : needle.toLowerCase();
  const ranges = [];
  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(q, from);
    if (idx === -1) break;
    ranges.push({ start: idx, end: idx + needle.length });
    from = idx + Math.max(needle.length, 1);
    if (ranges.length >= 400) break;
  }
  return ranges;
}

export function searchInFiles(files, query, { max = 80, caseSensitive = false } = {}) {
  const needle = String(query || '').trim();
  if (!needle) return [];
  const hits = [];
  for (const file of files || []) {
    const content = String(file.content || '');
    const lines = content.split('\n');
    let offset = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const ranges = findRanges(line, needle, { caseSensitive });
      for (const range of ranges) {
        hits.push({
          path: file.path,
          line: i + 1,
          col: range.start + 1,
          preview: line.trim().slice(0, 140),
          start: offset + range.start,
        });
        if (hits.length >= max) return hits;
      }
      offset += line.length + 1;
    }
  }
  return hits;
}

export function parseDiagnostics(output) {
  const text = String(output || '');
  const lines = text.split('\n');
  const diagnostics = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const gcc = line.match(/(?:^|[/\s])([^/\s:]+):(\d+)(?::(\d+))?:\s+(?:fatal\s+)?(error|warning):\s*(.+)$/);
    if (gcc) {
      diagnostics.push({
        file: gcc[1],
        line: Number(gcc[2]),
        col: gcc[3] ? Number(gcc[3]) : 1,
        severity: gcc[4] === 'warning' ? 'warning' : 'error',
        message: gcc[5].trim(),
      });
      continue;
    }
    const py = line.match(/File "(?:.*\/)?([^/"]+)", line (\d+)/);
    if (py) {
      let message = 'Помилка';
      let col = 1;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
        const caret = lines[j].match(/^\s*(\^+)\s*$/);
        if (caret) col = Math.max(1, lines[j].indexOf('^') + 1);
        const err = lines[j].match(/^([A-Za-z]*Error|Exception|SyntaxError|NameError|TypeError|IndentationError): (.+)$/);
        if (err) message = `${err[1]}: ${err[2]}`;
      }
      diagnostics.push({
        file: py[1],
        line: Number(py[2]),
        col,
        severity: 'error',
        message,
      });
      continue;
    }
    const node = line.match(/(?:^|[/\s])([^/\s:]+\.js):(\d+)(?::(\d+))?/);
    if (node && /Error|at /.test(text)) {
      diagnostics.push({
        file: node[1],
        line: Number(node[2]),
        col: node[3] ? Number(node[3]) : 1,
        severity: 'error',
        message: (lines[i + 1] || line).trim().slice(0, 180),
      });
    }
  }
  return diagnostics.filter((item, index, all) => (
    all.findIndex((o) => o.file === item.file && o.line === item.line && o.message === item.message) === index
  ));
}

export function lineDiff(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  const n = a.length;
  const m = b.length;
  if (n * m > 250_000) {
    const hunks = [];
    const max = Math.max(n, m);
    for (let i = 0; i < max; i += 1) {
      if (i < n && i < m && a[i] === b[i]) hunks.push({ type: 'equal', text: a[i], line: i + 1 });
      else {
        if (i < n) hunks.push({ type: 'del', text: a[i], line: i + 1 });
        if (i < m) hunks.push({ type: 'add', text: b[i], line: i + 1 });
      }
    }
    return hunks;
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const hunks = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      hunks.push({ type: 'equal', text: a[i - 1], line: i });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      hunks.push({ type: 'add', text: b[j - 1], line: j });
      j -= 1;
    } else {
      hunks.push({ type: 'del', text: a[i - 1], line: i });
      i -= 1;
    }
  }
  hunks.reverse();
  return hunks;
}

export function completions(source, prefix, { max = 24 } = {}) {
  const p = String(prefix || '');
  if (!p || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) return [];
  const words = String(source || '').match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const seen = new Set();
  const out = [];
  for (const word of words) {
    if (word === p || seen.has(word) || !word.startsWith(p) || word.length <= p.length) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

export function tokenPrefix(line, ch) {
  const left = String(line || '').slice(0, Math.max(0, ch));
  const match = left.match(/[A-Za-z_][A-Za-z0-9_]*$/);
  return match ? match[0] : '';
}

export function formatCursorStatus({ line = 1, ch = 0, lineCount = 1, language = 'python', dirty = false, tabSize = 2 } = {}) {
  return {
    cursor: `Ln ${line}, Col ${ch + 1}`,
    lines: `${lineCount} рядків`,
    language: LANGUAGE_LABELS[language] || language,
    indent: `Пробіли: ${tabSize}`,
    encoding: 'UTF-8',
    dirty: dirty ? 'не збережено' : 'збережено',
  };
}

export function commandCatalog({ language = 'python', dirty = false } = {}) {
  const runLabel = language === 'web' ? 'Publish превʼю' : 'Запустити';
  return [
    { id: 'save', label: 'Зберегти файл', keys: 'Ctrl+S', group: 'Файл' },
    { id: 'new-file', label: 'Новий файл', keys: '', group: 'Файл' },
    { id: 'find', label: 'Знайти в файлі', keys: 'Ctrl+F', group: 'Пошук' },
    { id: 'replace', label: 'Замінити в файлі', keys: 'Ctrl+H', group: 'Пошук' },
    { id: 'search-files', label: 'Пошук у проєкті', keys: 'Ctrl+Shift+F', group: 'Пошук' },
    { id: 'goto-line', label: 'Перейти до рядка', keys: 'Ctrl+G', group: 'Навігація' },
    { id: 'run', label: runLabel, keys: 'F5', group: 'Запуск' },
    { id: 'test', label: 'Запустити тести', keys: '', group: 'Запуск' },
    { id: 'toggle-comment', label: 'Закоментувати рядок', keys: 'Ctrl+/', group: 'Редагування' },
    { id: 'undo', label: 'Скасувати', keys: 'Ctrl+Z', group: 'Редагування' },
    { id: 'redo', label: 'Повторити', keys: 'Ctrl+Shift+Z', group: 'Редагування' },
    { id: 'history', label: 'Історія змін', keys: '', group: 'Історія' },
    { id: 'git', label: 'Git', keys: '', group: 'Git' },
    { id: 'explorer', label: 'Провідник файлів', keys: '', group: 'Навігація' },
  ].filter((item) => {
    if (item.id === 'test') return ['python', 'node'].includes(language);
    if (item.id === 'save') return true;
    return !dirty || true;
  });
}

export function filterCommands(items, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => `${item.label} ${item.id} ${item.group}`.toLowerCase().includes(q));
}

export function relativeTime(ts, now = Date.now()) {
  const delta = Math.max(0, now - Number(ts || 0));
  if (delta < 15_000) return 'щойно';
  if (delta < 60_000) return `${Math.round(delta / 1000)} с тому`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} хв тому`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} год тому`;
  return new Date(ts).toLocaleString('uk-UA');
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

export function createHistoryStore({
  storage,
  maxPerFile = DEFAULT_MAX_PER_FILE,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  const store = storage || (typeof localStorage === 'undefined' ? memoryStorage() : localStorage);

  function key(workspaceId) {
    return `${HISTORY_PREFIX}${workspaceId}`;
  }

  function load(workspaceId) {
    try {
      const raw = store.getItem(key(workspaceId));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function persist(workspaceId, data) {
    try {
      store.setItem(key(workspaceId), JSON.stringify(data));
    } catch {
      /* quota / private mode */
    }
  }

  function list(workspaceId, path) {
    const data = load(workspaceId);
    return Array.isArray(data[path]) ? data[path] : [];
  }

  function get(workspaceId, path, id) {
    return list(workspaceId, path).find((entry) => entry.id === id) || null;
  }

  function push(workspaceId, path, content, label = 'Збереження') {
    const text = String(content ?? '').slice(0, maxBytes);
    const data = load(workspaceId);
    const prev = Array.isArray(data[path]) ? data[path] : [];
    if (prev[0]?.content === text) return prev[0];
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      label,
      content: text,
    };
    data[path] = [entry, ...prev].slice(0, maxPerFile);
    persist(workspaceId, data);
    return entry;
  }

  return { load, list, get, push };
}
