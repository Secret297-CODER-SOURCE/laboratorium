import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFileTree,
  commentPrefix,
  commandCatalog,
  completions,
  createHistoryStore,
  filterCommands,
  findRanges,
  formatCursorStatus,
  lineDiff,
  modeForFile,
  parseDiagnostics,
  searchInFiles,
  toggleLineComments,
  tokenPrefix,
} from '../public/code-ide.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('modeForFile maps languages and extensions to CodeMirror modes', () => {
  assert.equal(modeForFile('python', 'main.py'), 'python');
  assert.equal(modeForFile('web', 'index.html'), 'htmlmixed');
  assert.equal(modeForFile('web', 'style.css'), 'css');
  assert.equal(modeForFile('cpp', 'main.cpp'), 'text/x-c++src');
  assert.equal(modeForFile('bash', 'run.sh'), 'shell');
});

test('file tree nests directories and keeps files at the leaves', () => {
  const tree = buildFileTree([
    { path: 'main.py' },
    { path: 'lib/util.py' },
    { path: 'lib/a.py' },
  ]);
  assert.equal(tree.children[0].name, 'lib');
  assert.equal(tree.children[0].type, 'dir');
  assert.deepEqual(tree.children[0].children.map((c) => c.name), ['a.py', 'util.py']);
  assert.equal(tree.children[1].path, 'main.py');
});

test('search finds line/column hits across files', () => {
  const hits = searchInFiles([
    { path: 'main.py', content: 'print("hi")\nvalue = 2\nprint(value)\n' },
    { path: 'util.py', content: 'print("other")\n' },
  ], 'print');
  assert.equal(hits.length, 3);
  assert.equal(hits[0].path, 'main.py');
  assert.equal(hits[0].line, 1);
  assert.equal(hits[2].path, 'util.py');
});

test('findRanges is case-insensitive by default', () => {
  assert.deepEqual(findRanges('Abc ABC abc', 'abc'), [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 8, end: 11 },
  ]);
});

test('parseDiagnostics extracts python, gcc and node locations', () => {
  const py = parseDiagnostics(`Traceback (most recent call last):\n  File "/workspace/main.py", line 4, in <module>\n    print(a + b\n              ^\nSyntaxError: '(' was never closed\n`);
  assert.equal(py[0].file, 'main.py');
  assert.equal(py[0].line, 4);
  assert.match(py[0].message, /SyntaxError/);

  const gcc = parseDiagnostics('main.cpp:12:5: error: expected ;');
  assert.equal(gcc[0].file, 'main.cpp');
  assert.equal(gcc[0].line, 12);
  assert.equal(gcc[0].col, 5);
  assert.equal(gcc[0].severity, 'error');
});

test('lineDiff marks added and deleted lines', () => {
  const hunks = lineDiff('a\nb\nc\n', 'a\nx\nc\n');
  const changed = hunks.filter((h) => h.type !== 'equal');
  assert.ok(changed.some((h) => h.type === 'del' && h.text === 'b'));
  assert.ok(changed.some((h) => h.type === 'add' && h.text === 'x'));
});

test('history store skips identical snapshots and restores previous content', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
  const history = createHistoryStore({ storage, maxPerFile: 3 });
  history.push(1, 'main.py', 'print(1)\n', 'save');
  history.push(1, 'main.py', 'print(1)\n', 'save');
  history.push(1, 'main.py', 'print(2)\n', 'save');
  const list = history.list(1, 'main.py');
  assert.equal(list.length, 2);
  assert.equal(list[0].content, 'print(2)\n');
  assert.equal(history.get(1, 'main.py', list[1].id).content, 'print(1)\n');
});

test('comment toggle comments and uncomments python lines', () => {
  const prefix = commentPrefix('python', 'main.py');
  const commented = toggleLineComments(['print(1)', '  x = 2'], prefix);
  assert.deepEqual(commented, ['# print(1)', '  # x = 2']);
  assert.deepEqual(toggleLineComments(commented, prefix), ['print(1)', '  x = 2']);
});

test('completions and command palette filtering', () => {
  assert.deepEqual(completions('value = 1\nprint(value)\nvaluable = 2\n', 'val'), ['value', 'valuable']);
  assert.equal(tokenPrefix('print(val', 9), 'val');
  const items = filterCommands(commandCatalog({ language: 'python' }), 'запус');
  assert.ok(items.some((i) => i.id === 'run'));
  assert.ok(commandCatalog({ language: 'web' }).every((i) => i.id !== 'test'));
});

test('status bar labels cursor, language and dirty state', () => {
  const status = formatCursorStatus({ line: 4, ch: 11, lineCount: 20, language: 'python', dirty: true });
  assert.equal(status.cursor, 'Ln 4, Col 12');
  assert.equal(status.language, 'Python');
  assert.equal(status.dirty, 'не збережено');
});

test('editor wires IDE chrome, history, find and error underlines', () => {
  const js = read('public/code-editor.js');
  const css = read('public/code-editor.css');
  const dash = read('public/dashboard.js');
  assert.match(js, /from '\/code-ide\.js'/);
  assert.match(js, /ide-activity/);
  assert.match(js, /ide-statusbar/);
  assert.match(js, /createHistoryStore/);
  assert.match(js, /Ctrl-F/);
  assert.match(js, /cm-ide-error/);
  assert.match(css, /\.ide-shell/);
  assert.match(css, /\.cm-ide-error/);
  assert.match(css, /text-decoration:\s*underline wavy/);
  assert.match(dash, /from '\/code-editor\.js'/);
});
