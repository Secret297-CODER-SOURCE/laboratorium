import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, PATHS, CATEGORIES, filterTools, pathProgress, scoreScenario, SCENARIO } from '../public/lab-tools-catalog.js';

test('catalog contains all requested tools with official https repos and bilingual text', () => {
  const names = TOOLS.map((x) => x.name).sort();
  assert.deepEqual(names, ['HexStrike AI', 'PentAGI', 'PentestGPT', 'Promptfoo', 'PyRIT', 'Shannon', 'Strix', 'garak'].sort());
  for (const tool of TOOLS) {
    assert.match(tool.repo, /^https:\/\/github\.com\//);
    for (const f of ['purpose', 'prerequisites', 'exercise']) assert.ok(tool[f].uk && tool[f].en);
    assert.ok(CATEGORIES.some((c) => c.id === tool.category));
  }
});

test('autonomous offensive tools are flagged informational-only', () => {
  for (const id of ['strix', 'pentagi', 'shannon', 'hexstrike', 'pentestgpt']) assert.equal(TOOLS.find((x) => x.id === id).offensive, true);
});

test('filtering and path progress', () => {
  assert.equal(filterTools(TOOLS, { query: 'GARAK' }).length, 1);
  assert.ok(filterTools(TOOLS, { category: 'llm-eval' }).every((x) => x.category === 'llm-eval'));
  assert.equal(filterTools(TOOLS, { query: 'zzz' }).length, 0);
  assert.deepEqual(pathProgress(PATHS[0], { promptfoo: true }), { done: 1, total: 3, percent: 33 });
});

test('scenario scoring', () => {
  const perfect = Object.fromEntries(SCENARIO.cases.map((c) => [c.id, c.leaks]));
  assert.equal(scoreScenario(perfect).passed, true);
  assert.equal(scoreScenario({}).correct, SCENARIO.cases.filter((c) => !c.leaks).length);
});
