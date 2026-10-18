import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { distribution, correlation, generateRows } from '../server/core.mjs';
import { normalizePlan, templates, generateDataset, importDataset, explore, profile, dataReport, downloadDataset } from '../server/data.mjs';
import { workbenchAgent, workbenchTools } from '../server/workbench-agent.mjs';
import { createServer } from '../server/index.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function fixture() { const store = new DatasetStore(); const d = importDataset(store, { name: '台账.csv', content: '地区,金额,x,y,日期\n东,10,1,3,2026-01-03\n西,20,2,5,2026-01-01\n东,30,3,7,2026-01-02\n西,,4,9,2026-01-04\n,40,,11,2026-01-05' }); return { store, d }; }
test('all four domains generate reproducible typed records and mandatory synthetic marker', () => {
  for (const t of templates) {
    const s = new DatasetStore(), a = generateDataset(s, t), b = generateDataset(s, t);
    assert.equal(a.sha256, b.sha256); assert.equal(a.rowCount, t.rows);
    const { records, provenance, synthetic } = JSON.parse(downloadDataset(s, a.id, 'json').content);
    assert.equal(synthetic, true); assert.ok(records.every(r => r._synthetic === true)); assert.equal(provenance.plan.seed, t.seed);
    assert.equal(typeof records[0][t.columns.find(c => ['number', 'integer'].includes(c.kind)).name], 'number');
    const changed = generateDataset(s, { ...t, seed: t.seed + 1 }); assert.notEqual(a.sha256, changed.sha256);
  }
});
test('seed 1 first integer draws match independently documented Park–Miller states', () => {
  const p = normalizePlan({ rows: 3, seed: 1, columns: [{ name: 'x', kind: 'integer', min: 0, max: 2147483646 }] });
  assert.deepEqual(generateRows(p).rows.map(r => r[0]), [16807, 282475249, 1622650073]);
});
test('linear constraints date and missing propagation are honored', () => {
  const s = new DatasetStore(), d = generateDataset(s, { rows: 5, seed: 9, columns: [{ name: 'x', kind: 'sequence', start: 2, step: 1 }, { name: 'y', kind: 'linear', source: 'x', slope: 3, intercept: 4 }, { name: '日期', kind: 'date', startDate: '2024-02-28' }] });
  const r = s.get(d.id).records; assert.deepEqual(r.map(r => r.y), [10, 13, 16, 19, 22]); assert.equal(r[1].日期, '2024-02-29'); assert.equal(r[2].日期, '2024-03-01');
  const m = generateDataset(s, { rows: 100, seed: 1, columns: [{ name: 'x', kind: 'number', missing: .8 }, { name: 'y', kind: 'linear', source: 'x', noise: 0 }] });
  assert.ok(s.get(m.id).records.some(r => r.x === null)); assert.ok(s.get(m.id).records.every(r => r.x !== null || r.y === null));
});
test('reject invalid schema bounds seed dependencies and sizes before execution', () => {
  const good = { rows: 10, seed: 1, columns: [{ name: 'x', kind: 'number' }] };
  for (const patch of [{ rows: 10001 }, { seed: 0 }, { rows: 1.2 }, { columns: [{ name: '_synthetic', kind: 'number' }] }, { columns: [{ name: 'x', kind: 'eval' }] }, { columns: [{ name: 'x', kind: 'linear', source: 'x' }] }, { columns: [{ name: 'x', kind: 'category', choices: [] }] }, { columns: [{ name: 'x', kind: 'integer', min: .1 }] }, { columns: [{ name: 'x', kind: 'date', startDate: '2024-02-30' }] }, { columns: [{ name: 'x', kind: 'date', startDate: '2199-12-31' }] }, { columns: [{ name: 'x', kind: 'number', noise: -1 }] }]) assert.throws(() => normalizePlan({ ...good, ...patch }));
});
test('JSON and JSONL import preserve union headers types leading zeros and exact source hash', () => {
  const s = new DatasetStore(), content = '[{"__proto__":"safe","id":"001","v":2},{"id":"002","v":null,"ok":true}]';
  const d = importDataset(s, { name: 'a.json', format: 'json', content });
  assert.equal(d.sha256, createHash('sha256').update(content).digest('hex'));
  assert.deepEqual(s.get(d.id).headers, ['__proto__', 'id', 'v', 'ok']);
  const out = JSON.parse(downloadDataset(s, d.id, 'json').content); assert.equal(out.records[0].id, '001'); assert.equal(out.records[0].__proto__, 'safe'); assert.equal(out.records[1].ok, true);
  const l = importDataset(s, { name: 'b.jsonl', format: 'jsonl', content: downloadDataset(s, d.id, 'jsonl').content }); assert.equal(l.rowCount, 2);
  for (const bad of ['[{"x":[]}]', '[{"x":{}}]', '[null]', '[]', '[{" ":1}]']) assert.throws(() => importDataset(s, { name: 'bad.json', content: bad, format: 'json' }));
});
test('synthetic status survives all export import formats while imported provenance stays unverified', () => {
  for (const format of ['csv', 'json', 'jsonl']) {
    const store = new DatasetStore(), d = generateDataset(store, { ...templates[0], rows: 3 });
    const imported = importDataset(store, { name: `roundtrip.${format}`, format, content: downloadDataset(store, d.id, format).content });
    assert.equal(imported.synthetic, true); assert.equal(imported.provenance.imported, true);
  }
});
test('generic profile needs neither monotonic time nor target; missing is distinct from text', () => {
  const { store, d } = fixture(), p = profile(store, d.id);
  assert.equal(p.rowCount, 5); assert.equal(p.missingCells, 3); assert.equal(p.columns[0].type, 'text'); assert.equal(p.columns[1].type, 'number'); assert.equal(p.columns[4].type, 'date'); close(p.columns[1].summary.mean, 25);
  assert.equal(explore(store, { datasetId: d.id }).table.length, 5);
});
test('group reducers handle categorical rows and missing independently', () => {
  const { store, d } = fixture(), base = { datasetId: d.id, mode: 'group', group: '地区', value: '金额' };
  const sum = explore(store, { ...base, reducer: 'sum' }); assert.deepEqual(sum.table.map(r => [r.group, r.value]), [['东', 40], ['西', 20], ['', 40]]); assert.equal(sum.excludedRows, 1);
  assert.deepEqual(explore(store, { ...base, reducer: 'count' }).table.map(r => r.value), [2, 2, 1]);
  assert.deepEqual(explore(store, { ...base, reducer: 'mean' }).table.map(r => r.value), [20, 20, 40]);
  assert.deepEqual(explore(store, { ...base, reducer: 'min' }).table.map(r => r.value), [10, 20, 40]);
  assert.deepEqual(explore(store, { ...base, reducer: 'max' }).table.map(r => r.value), [30, 20, 40]);
});
test('histogram edges and quantiles match independent arithmetic', () => {
  const r = distribution([1, 2, 3, 4], 2); close(r.median, 2.5); close(r.q1, 1.75); close(r.q3, 3.25); assert.deepEqual(r.buckets.map(b => b.count), [2, 2]);
  assert.equal(distribution([8, 8, 8], 10).buckets.length, 1); assert.throws(() => distribution([], 10));
});
test('Pearson handles positive negative and constant columns; pairwise deletion is explicit', () => {
  close(correlation([1, 2, 3], [3, 5, 7]).pearson, 1); close(correlation([1, 2, 3], [3, 2, 1]).pearson, -1); assert.equal(correlation([1, 1], [1, 2]).pearson, null);
  const { store, d } = fixture(), r = explore(store, { datasetId: d.id, mode: 'scatter', x: 'x', y: 'y' }); close(r.statistics.pearson, 1); assert.equal(r.statistics.count, 4); assert.equal(r.excludedRows, 1);
  const line = explore(store, { datasetId: d.id, mode: 'line', x: '日期', y: '金额' }); assert.equal(line.chart.points[1].x, '2026-01-01'); assert.equal(line.excludedRows, 1);
});
test('plot limit does not reduce statistical sample and report recomputes rather than trusts metrics', () => {
  const store = new DatasetStore(), d = generateDataset(store, { rows: 2000, seed: 1, columns: [{ name: 'x', kind: 'sequence' }, { name: 'y', kind: 'linear', source: 'x', slope: -2 }] });
  const query = { datasetId: d.id, mode: 'scatter', x: 'x', y: 'y', statistics: { pearson: 999 } };
  const r = dataReport(store, query); assert.equal(r.result.chart.points.length, 1500); assert.equal(r.result.statistics.count, 2000); close(r.result.statistics.pearson, -1); assert.match(r.markdown, /SHA-256/); assert.match(r.markdown, /合成数据/); assert.equal(JSON.parse(r.json).query.statistics, undefined);
});
test('offline commands propose without generating and never pretend free natural language', async () => {
  const store = new DatasetStore(); const r = await workbenchAgent({ store, message: '生成销售台账示例', config: null });
  assert.equal(store.list().length, 0); assert.equal(r.artifacts[0].kind, 'generation-plan');
  const unsupported = await workbenchAgent({ store, message: '请预测未来销售额', config: null }); assert.equal(unsupported.trace.length, 0); assert.match(unsupported.answer, /未连接模型/);
  assert.throws(() => workbenchTools(store).execute('exec', { command: 'calc' }));
});
test('model tool protocol uses chosen dataset; raw samples never enter provider payload', async () => {
  const { store, d } = fixture(); let n = 0; const sent = [];
  const r = await workbenchAgent({ store, datasetId: d.id, message: '分析 x 与 y 的相关性', config: { endpoint: 'https://model.example/v1/chat/completions', model: 'test' }, fetchImpl: async (_, init) => {
    sent.push(JSON.parse(init.body)); n++;
    return Response.json({ choices: [{ message: n === 1 ? { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'explore_dataset', arguments: JSON.stringify({ mode: 'scatter', x: 'x', y: 'y', datasetId: 'not-allowed' }) } }] } : { content: '工具显示线性相关；不证明因果。' } }] });
  } });
  assert.equal(r.artifacts[0].dataset.id, d.id); assert.equal(r.mode, 'model'); assert.equal(sent.length, 2);
  const evidence = JSON.parse(sent[1].messages.at(-1).content); assert.equal(evidence.profile.preview, undefined); assert.equal(evidence.table, undefined); assert.equal(evidence.chart.points, undefined); close(evidence.statistics.pearson, 1);
});
test('HTTP general workflow and session isolation', async t => {
  const server = createServer({ env: {} }); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); server.close(); }); const base = `http://127.0.0.1:${server.address().port}`; let cookie = '';
  async function call(path, body) { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined }); cookie = r.headers.get('set-cookie')?.split(';')[0] ?? cookie; return r; }
  const d = (await (await call('/api/generate', { ...templates[0], rows: 20 })).json()).dataset; assert.ok(d.id);
  const result = await (await call('/api/explore', { datasetId: d.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum' })).json(); assert.equal(result.result.table.length <= 4, true);
  assert.equal((await call('/api/data-report', result.result.query)).status, 200);
  const downloaded = await (await call('/api/download', { datasetId: d.id, format: 'json' })).json(); assert.equal(downloaded.records.length, 20);
  const outsider = await fetch(base + '/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1' }, body: JSON.stringify({ datasetId: d.id }) }); assert.equal(outsider.status, 404);
});
