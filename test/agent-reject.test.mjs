import test from 'node:test';
import assert from 'node:assert/strict';
import { DatasetStore } from '../server/datasets.mjs';
import { workbenchTools } from '../server/workbench-agent.mjs';
import { validateToolCall, AppError } from '../server/core.mjs';
import { templates, generateDataset, downloadDataset } from '../server/data.mjs';

/** Model-refusal / ambiguity eval set: tools that must never run. */
const REJECT = [
  ['run_shell', { cmd: 'ls' }],
  ['execute_command', { command: 'echo hi' }],
  ['eval_js', { code: '1+1' }],
  ['write_file', { path: '/tmp/x', content: 'x' }],
  ['http_fetch', { url: 'https://example.com' }],
  ['plot_dataset', { x: 'a', yColumns: [] }], // missing datasetId
];

test('reject eval set: dangerous or incomplete tools fail MoonBit allowlist', () => {
  for (const [name, args] of REJECT) {
    assert.throws(() => validateToolCall(name, args), AppError, name);
  }
});

test('workbench refuses the same reject set before Node side effects', () => {
  const store = new DatasetStore();
  const toolkit = workbenchTools(store, null);
  for (const [name, args] of REJECT) {
    assert.throws(() => toolkit.execute(name, args), /ContractError|allowlist|Tool|datasetId|字段|允许/i, name);
  }
});

test('generated provenance carries MoonBit planCanonical fingerprint', () => {
  const store = new DatasetStore();
  const d = generateDataset(store, { ...templates[0], rows: 5 });
  const json = JSON.parse(downloadDataset(store, d.id, 'json').content);
  assert.equal(json.provenance.contract, 'moondata.generate/1');
  assert.match(json.provenance.planCanonical, /^moondata\.generate\/1\|rows=5\|seed=/);
  assert.ok(json.provenance.planCanonical.includes('columns=['));
});
