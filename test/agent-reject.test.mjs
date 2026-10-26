import test from 'node:test';
import assert from 'node:assert/strict';
import { DatasetStore } from '../server/datasets.mjs';
import { workbenchTools, workbenchAgent } from '../server/workbench-agent.mjs';
import { validateToolCall, AppError, TOOL_ALLOWLIST_VALIDATOR, toolContractEvidence } from '../server/core.mjs';
import { templates, generateDataset, downloadDataset, importDataset } from '../server/data.mjs';
import { localPlanner } from '../server/local-planner.mjs';

/** Model-refusal / ambiguity eval set: tools that must never run. */
const REJECT = [
  ['run_shell', { cmd: 'ls' }],
  ['execute_command', { command: 'echo hi' }],
  ['eval_js', { code: '1+1' }],
  ['write_file', { path: '/tmp/x', content: 'x' }],
  ['http_fetch', { url: 'https://example.com' }],
  ['subprocess', { cmd: 'id' }],
  ['os_system', { cmd: 'pwd' }],
  ['plot_dataset', { x: 'a', yColumns: [] }], // missing datasetId
  ['explore_dataset', { mode: 'overview' }],
  ['plan_chart', { action: 'plot', x: 'a', yColumns: [] }],
  ['plot_dataset', { datasetId: '', x: 'a', yColumns: [] }],
  ['explore_dataset', { datasetId: '', mode: 'overview' }],
  ['plan_chart', { datasetId: '', action: 'clarify', reason: 'x' }],
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
    assert.throws(() => toolkit.execute(name, args), /ContractError|allowlist|Tool|datasetId|字段|允许|先选择/i, name);
  }
});

test('allowlisted plot/explore/plan_chart accept only with non-empty datasetId', () => {
  assert.equal(validateToolCall('plot_dataset', { datasetId: 'd1', x: 'a', yColumns: [] }).allowed, true);
  assert.equal(validateToolCall('explore_dataset', { datasetId: 'd1', mode: 'overview' }).allowed, true);
  assert.equal(validateToolCall('plan_chart', { datasetId: 'd1', action: 'plot' }).allowed, true);
});

test('generated provenance carries MoonBit planCanonical fingerprint', () => {
  const store = new DatasetStore();
  const d = generateDataset(store, { ...templates[0], rows: 5 });
  const json = JSON.parse(downloadDataset(store, d.id, 'json').content);
  assert.equal(json.provenance.contract, 'moondata.generate/1');
  assert.match(json.provenance.planCanonical, /^moondata\.generate\/1\|rows=5\|seed=/);
  assert.ok(json.provenance.planCanonical.includes('columns=['));
});

test('local planner validates plan_chart and plot_dataset before explore', async () => {
  const store = new DatasetStore();
  const d = importDataset(store, {
    name: 't.csv',
    content: '地区,金额\n东,10\n西,20\n',
  });
  const r = await localPlanner({
    store,
    datasetId: d.id,
    message: '以地区为横轴画柱状图',
    config: { endpoint: 'http://127.0.0.1/v1/chat/completions', model: 'test' },
    fetchImpl: async () => Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            action: 'plot', x: '地区', yColumns: ['金额'], kind: 'bar', reducer: 'sum', reason: '按地区汇总',
          }),
        },
      }],
    }),
  });
  assert.equal(r.mode, 'local-model');
  assert.equal(r.trace[0].tool, 'plan_chart');
  assert.equal(r.trace[1].tool, 'plot_dataset');
  assert.deepEqual(r.trace[0].contract, toolContractEvidence('plan_chart'));
  assert.deepEqual(r.trace[1].contract, toolContractEvidence('plot_dataset'));
  assert.equal(r.evidence?.toolAllowlistValidator, TOOL_ALLOWLIST_VALIDATOR);
  assert.deepEqual(r.evidence?.toolsValidated, ['plan_chart', 'plot_dataset']);
  assert.ok(r.artifacts[0].chart);

  // Empty datasetId must be rejected by the same MoonBit surface the planner uses.
  assert.throws(
    () => validateToolCall('plot_dataset', { datasetId: '', x: '地区', yColumns: ['金额'] }),
    AppError,
  );
  assert.throws(
    () => validateToolCall('plan_chart', { datasetId: '', action: 'plot' }),
    AppError,
  );
});

test('builtin workbench traces expose MoonBit allowlist evidence', async () => {
  const store = new DatasetStore();
  const d = generateDataset(store, { ...templates[0], rows: 5 });
  const r = await workbenchAgent({
    store,
    datasetId: d.id,
    message: '概览当前数据',
    config: null,
  });
  assert.equal(r.mode, 'builtin');
  assert.equal(r.trace[0].tool, 'profile_dataset');
  assert.equal(r.trace[0].contract.allowlisted, true);
  assert.equal(r.trace[0].contract.validator, TOOL_ALLOWLIST_VALIDATOR);
  assert.equal(r.evidence.toolAllowlistValidator, TOOL_ALLOWLIST_VALIDATOR);
  assert.deepEqual(r.evidence.toolsValidated, ['profile_dataset']);
});
