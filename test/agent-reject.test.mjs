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

test('explore_dataset rejects unsupported mode at MoonBit validate with stable message', () => {
  assert.throws(
    () => validateToolCall('explore_dataset', { datasetId: 'd1', mode: 'pivot' }),
    (e) => e instanceof AppError && e.message === 'Unsupported explore mode',
  );
  assert.throws(
    () => validateToolCall('explore_dataset', {
      datasetId: 'd1', mode: 'distribution', value: '金额',
    }),
    (e) => e instanceof AppError && e.message === 'Missing integer field bins',
  );
  const store = new DatasetStore();
  const d = generateDataset(store, { ...templates[0], rows: 5 });
  const toolkit = workbenchTools(store, d.id);
  assert.throws(
    () => toolkit.execute('explore_dataset', { mode: 'pivot' }),
    (e) => e instanceof AppError && e.message === 'Unsupported explore mode',
  );
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

  // Empty datasetId / shell: independent expected MoonBit ContractError messages.
  assert.throws(
    () => validateToolCall('plot_dataset', { datasetId: '', x: '地区', yColumns: ['金额'] }),
    (e) => e instanceof AppError && e.message === 'plot_dataset requires non-empty datasetId',
  );
  assert.throws(
    () => validateToolCall('plan_chart', { datasetId: '', action: 'plot' }),
    (e) => e instanceof AppError && e.message === 'plan_chart requires non-empty datasetId',
  );
  assert.throws(
    () => validateToolCall('explore_dataset', { datasetId: '', mode: 'overview' }),
    (e) => e instanceof AppError && e.message === 'explore_dataset requires non-empty datasetId',
  );
  assert.throws(
    () => validateToolCall('run_shell', { cmd: 'ls' }),
    (e) => e instanceof AppError && e.message === 'Tool not allowlisted: run_shell',
  );
});

test('empty datasetId reject messages are contract-stable across tools', () => {
  const cases = [
    ['plan_chart', { datasetId: '', action: 'plot' }, 'plan_chart requires non-empty datasetId'],
    ['plot_dataset', { datasetId: '', x: 'a', yColumns: [] }, 'plot_dataset requires non-empty datasetId'],
    ['explore_dataset', { datasetId: '', mode: 'overview' }, 'explore_dataset requires non-empty datasetId'],
  ];
  for (const [name, args, expected] of cases) {
    assert.throws(() => validateToolCall(name, args), (e) => e instanceof AppError && e.message === expected, name);
  }
});

test('propose_generation returns plan fingerprint and does not mutate the store', async () => {
  const store = new DatasetStore();
  const before = store.list().length;
  const toolkit = workbenchTools(store, null);
  const planArgs = {
    name: 'demo', rows: 5, seed: 7,
    columns: [{ name: 'id', kind: 'sequence', start: 1, step: 1 }],
  };
  const result = toolkit.execute('propose_generation', planArgs);
  assert.equal(result.kind, 'generation-plan');
  assert.equal(result.storeMutated, false);
  assert.match(result.notice, /尚未生成/);
  assert.match(result.planCanonical, /^moondata\.generate\/1\|rows=5\|seed=7\|/);
  assert.equal(store.list().length, before);

  const agent = await workbenchAgent({
    store, datasetId: null, message: '生成销售台账示例', config: null,
  });
  assert.equal(agent.mode, 'builtin');
  assert.equal(agent.trace[0].tool, 'propose_generation');
  assert.equal(agent.trace[0].contract.validator, TOOL_ALLOWLIST_VALIDATOR);
  assert.deepEqual(agent.evidence.toolsValidated, ['propose_generation']);
  assert.equal(agent.artifacts[0].kind, 'generation-plan');
  assert.equal(agent.artifacts[0].storeMutated, false);
  assert.match(agent.artifacts[0].planCanonical, /^moondata\.generate\/1\|/);
  assert.equal(store.list().length, before);
  assert.match(agent.answer, /尚未写入数据|尚未创建数据/);
});

test('invalid propose_generation rejects with stable messages and never mutates store', () => {
  const store = new DatasetStore();
  const toolkit = workbenchTools(store, null);
  const col = { name: 'id', kind: 'sequence', start: 1, step: 1 };
  assert.throws(
    () => toolkit.execute('propose_generation', { rows: 5, seed: 1, columns: [] }),
    (e) => e instanceof AppError && e.message === 'Plan requires 1..32 columns',
  );
  assert.throws(
    () => toolkit.execute('propose_generation', { rows: 0, seed: 1, columns: [col] }),
    (e) => e instanceof AppError && e.message === 'Plan rows/seed out of generation contract range',
  );
  assert.throws(
    () => toolkit.execute('propose_generation', { rows: 1, seed: 0, columns: [col] }),
    (e) => e instanceof AppError && e.message === 'Plan rows/seed out of generation contract range',
  );
  assert.throws(
    () => toolkit.execute('propose_generation', { rows: 1, seed: 2147483647, columns: [col] }),
    (e) => e instanceof AppError && e.message === 'Plan rows/seed out of generation contract range',
  );
  assert.throws(
    () => toolkit.execute('propose_generation', {
      rows: 5, seed: 1, columns: [{ name: 'x', kind: 'eval' }],
    }),
    (e) => e instanceof AppError && /字段类型无效|保留字段|_synthetic/.test(e.message),
  );
  assert.equal(store.list().length, 0);
  const maxOk = toolkit.execute('propose_generation', {
    rows: 1, seed: 2147483646, columns: [col],
  });
  assert.equal(maxOk.storeMutated, false);
  assert.match(maxOk.planCanonical, /\|seed=2147483646\|/);
  assert.throws(
    () => toolkit.execute('propose_generation', { rows: 10001, seed: 1, columns: [col] }),
    (e) => e instanceof AppError && e.message === 'Plan rows/seed out of generation contract range',
  );
  const maxRows = toolkit.execute('propose_generation', {
    rows: 10000, seed: 1, columns: [col],
  });
  assert.equal(maxRows.storeMutated, false);
  assert.match(maxRows.planCanonical, /\|rows=10000\|/);
  assert.equal(store.list().length, 0);
});

test('propose_generation planCanonical matches generateDataset provenance', () => {
  const store = new DatasetStore();
  const toolkit = workbenchTools(store, null);
  const template = templates.find((t) => t.id === 'sales');
  const proposed = toolkit.execute('propose_generation', template);
  assert.equal(store.list().length, 0);
  const generated = generateDataset(store, template);
  const json = JSON.parse(downloadDataset(store, generated.id, 'json').content);
  assert.equal(proposed.planCanonical, json.provenance.planCanonical);
  assert.equal(store.list().length, 1);
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
