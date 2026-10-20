import test from 'node:test';
import assert from 'node:assert/strict';
import { DatasetStore } from '../server/datasets.mjs';
import { explore, importDataset, profile, dataReport, generateDataset } from '../server/data.mjs';
import { localPlanner } from '../server/local-planner.mjs';
import { modelConfig } from '../server/agent.mjs';
import { workbenchAgent } from '../server/workbench-agent.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9);
test('recommendation prefers a valid 300-category axis over sole high-cardinality numeric field', () => {
  const store = new DatasetStore();
  const d = importDataset(store, { name: 'routes.csv', content: 'origin,destination,count\n' + Array.from({ length: 2000 }, (_, i) => `A${i % 300},B${i % 301},${i}`).join('\n') });
  const p = profile(store, d.id); assert.equal(p.recommendation.x, 'origin'); assert.deepEqual(p.recommendation.yColumns, ['count']);
  const r = explore(store, { datasetId: d.id, ...p.recommendation }); assert.equal(r.table.length, 300); assert.equal(r.chart.points.length, 50); assert.match(r.chart.yLabel, /平均值/);
});
function fixture() { const store = new DatasetStore(); const d = importDataset(store, { name: 'table.csv', content: '日期,地区,x,a,b\n2026-01-01,东,0,10,5\n2026-01-03,西,2,20,\n2026-01-10,东,9,30,15\n,西,10,40,20' }); return { store, d }; }
test('multiple Y columns retain independent missing pairs and actual date spacing', () => {
  const { store, d } = fixture(), r = explore(store, { datasetId: d.id, mode: 'plot', x: '日期', yColumns: ['a', 'b'], kind: 'auto' });
  assert.equal(r.chart.kind, 'line'); assert.equal(r.chart.xMode, 'date');
  assert.deepEqual(r.chart.series.map(s => s.totalPoints), [3, 2]); assert.deepEqual(r.chart.series.map(s => s.excludedRows), [1, 2]);
  assert.equal((r.chart.series[0].points[1].x - r.chart.series[0].points[0].x) / 86400000, 2);
  assert.equal((r.chart.series[0].points[2].x - r.chart.series[0].points[0].x) / 86400000, 9);
  close(r.statistics.series[0].summary.mean, 20); close(r.statistics.series[1].summary.mean, 10);
});
test('multi-series categorical aggregation uses exact sum and mean with consistent groups', () => {
  const { store, d } = fixture();
  const r = explore(store, { datasetId: d.id, mode: 'plot', x: '地区', yColumns: ['a', 'b'], kind: 'auto', reducer: 'sum' });
  assert.equal(r.chart.kind, 'bar'); assert.deepEqual(r.chart.series[0].points, [{ x: '东', y: 40 }, { x: '西', y: 60 }]);
  assert.deepEqual(r.chart.series[1].points, [{ x: '东', y: 20 }, { x: '西', y: 20 }]);
  const m = explore(store, { ...r.query, reducer: 'mean' }); assert.deepEqual(m.chart.series[1].points.map(p => p.y), [10, 20]);
  const count = explore(store, { datasetId: d.id, mode: 'plot', x: '地区', yColumns: [] }); assert.deepEqual(count.chart.points.map(p => p.y), [2, 2]);
});
test('numeric plots and recommendations respect types and validate invalid axes', () => {
  const { store, d } = fixture(), p = profile(store, d.id); assert.equal(p.recommendation.x, '日期');
  const r = explore(store, { datasetId: d.id, mode: 'plot', x: 'x', yColumns: ['a', 'b'] }); assert.equal(r.chart.kind, 'scatter'); assert.equal(r.chart.series.length, 2);
  for (const patch of [{ x: 'missing' }, { yColumns: ['a', 'a'] }, { yColumns: ['地区'] }, { yColumns: [], kind: 'line' }, { x: '地区', kind: 'scatter' }, { kind: 'eval' }, { reducer: 'exec' }]) assert.throws(() => explore(store, { ...r.query, ...patch }));
});
test('text-only data can produce a count chart and wide plot samples preserve full statistics', () => {
  const store = new DatasetStore(), d = importDataset(store, { name: 'text.csv', content: '组,描述\nA,好\nB,差\nA,好' });
  const p = profile(store, d.id); assert.deepEqual(p.recommendation.yColumns, []); assert.equal(explore(store, { datasetId: d.id, ...p.recommendation }).chart.kind, 'bar');
  const s = generateDataset(store, { rows: 2000, seed: 1, columns: [{ name: 'x', kind: 'sequence' }, { name: 'a', kind: 'linear', source: 'x', slope: 2 }, { name: 'b', kind: 'linear', source: 'x', slope: -1 }] });
  const r = dataReport(store, { datasetId: s.id, mode: 'plot', x: 'x', yColumns: ['a', 'b'], kind: 'scatter' }).result;
  assert.deepEqual(r.chart.series.map(s => s.points.length), [1500, 1500]); assert.deepEqual(r.statistics.series.map(s => s.summary.count), [2000, 2000]); close(r.statistics.series[0].summary.pearson, 1); close(r.statistics.series[1].summary.pearson, -1);
});
test('local model configuration only accepts loopback and no credentials', () => {
  assert.equal(modelConfig({ LAB_LOCAL_MODEL_URL: 'http://127.0.0.1:4324/v1' }).kind, 'local-planner');
  for (const url of ['https://remote.example/v1', 'http://evil.example/v1', 'http://x:y@127.0.0.1/v1', 'http://127.0.0.1/v1?secret=x']) assert.throws(() => modelConfig({ LAB_LOCAL_MODEL_URL: url }));
});
test('local structured planner sees metadata only and style patches preserve explicit selections', async () => {
  const { store, d } = fixture(); let sent;
  const query = { mode: 'plot', x: '日期', yColumns: ['a', 'b'], kind: 'scatter', reducer: 'mean' };
  const r = await localPlanner({ store, datasetId: d.id, query, message: '把当前选择换成折线图', config: { endpoint: 'http://127.0.0.1/v1/chat/completions', model: 'test' }, fetchImpl: async (_, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: JSON.stringify({ action: 'plot', x: 'x', yColumns: ['a'], kind: 'line', reducer: 'sum', reason: '改变图形' }) } }] }); } });
  assert.equal(r.artifacts[0].query.x, '日期'); assert.deepEqual(r.artifacts[0].query.yColumns, ['a', 'b']); assert.equal(r.artifacts[0].query.reducer, 'mean');
  const input = JSON.parse(sent.messages.at(-1).content); assert.equal(input.preview, undefined); assert.equal(input.records, undefined); assert.equal(input.fields.length, 5); assert.equal(sent.response_format.type, 'json_schema');
});
test('unknown explicitly named horizontal axis never silently draws another field', async () => {
  const { store, d } = fixture();
  const r = await localPlanner({ store, datasetId: d.id, message: '以湿度为横轴画折线', config: {}, fetchImpl: () => assert.fail('No inference needed for invalid explicit field') });
  assert.equal(r.artifacts.length, 0); assert.match(r.answer, /没有横轴字段/); assert.equal(r.trace[0].tool, 'validate_axes');
});
test('local planner sanitizes malformed model responses and does not execute code', async () => {
  const { store, d } = fixture();
  for (const payload of ['not-json', JSON.stringify({ action: 'plot', x: 'missing', yColumns: ['a'], kind: 'line', reason: 'fake' }), JSON.stringify({ action: 'exec', reason: 'run' })]) await assert.rejects(localPlanner({ store, datasetId: d.id, message: '画图', config: { endpoint: 'http://127.0.0.1/v1/chat/completions' }, fetchImpl: async () => Response.json({ choices: [{ message: { content: payload } }] }) }));
  const r = await workbenchAgent({ store, datasetId: d.id, message: '按当前选择画图', query: { mode: 'plot', x: 'x', yColumns: ['a'], kind: 'line' }, config: null }); assert.equal(r.artifacts[0].chart.kind, 'line'); assert.equal(r.mode, 'builtin');
});
