import test from 'node:test';
import assert from 'node:assert/strict';
import { DatasetStore } from '../server/datasets.mjs';
import { importDataset, explore, decodeUtf8, profile, generateDataset } from '../server/data.mjs';
import { buildXlsx, parseXlsx } from '../server/xlsx.mjs';
import { exportWorkspace, importWorkspace } from '../server/workspace.mjs';
import { createServer } from '../server/index.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('xlsx round-trip preserves headers numbers and text cells', () => {
  const buffer = buildXlsx(['地区', '金额', '备注'], [['东', 10, 'ok'], ['西', 20, ''], ['东', 30, '尾']]);
  const parsed = parseXlsx(buffer);
  assert.deepEqual(parsed.headers, ['地区', '金额', '备注']);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0][1], '10');
  const store = new DatasetStore();
  const d = importDataset(store, { name: '台账.xlsx', format: 'xlsx', contentBase64: buffer.toString('base64') });
  assert.equal(d.sourceFormat, 'xlsx');
  assert.equal(d.rowCount, 3);
  const r = explore(store, { datasetId: d.id, mode: 'plot', x: '地区', yColumns: ['金额'], kind: 'bar', reducer: 'sum' });
  assert.deepEqual(r.chart.series[0].points.map(p => [p.x, p.y]), [['东', 40], ['西', 20]]);
  close(profile(store, d.id).columns.find(c => c.name === '金额').summary.mean, 20);
});

test('invalid utf-8 csv is rejected with actionable message', () => {
  assert.throws(() => decodeUtf8(Buffer.from([0xC3, 0x28])), /UTF-8/);
  const store = new DatasetStore();
  assert.throws(() => importDataset(store, { name: 'bad.csv', format: 'csv', contentBase64: Buffer.from([0xC3, 0x28, 0x61, 0x2c, 0x62, 0x0a, 0x31, 0x2c, 0x32]).toString('base64') }), /UTF-8/);
});

test('multi-series plot skips empty series instead of failing the chart', () => {
  const store = new DatasetStore();
  const d = importDataset(store, { name: 'partial.csv', content: 'x,a,b\n1,10,\n2,20,\n3,30,' });
  const r = explore(store, { datasetId: d.id, mode: 'plot', x: 'x', yColumns: ['a', 'b'], kind: 'scatter' });
  assert.equal(r.chart.series[0].totalPoints, 3);
  assert.equal(r.chart.series[1].skipped, true);
  assert.equal(r.chart.series[1].points.length, 0);
  assert.match(r.warnings.join(' '), /已跳过/);
});

test('workspace export import restores records query mapping and replaces session', () => {
  const store = new DatasetStore();
  const d = generateDataset(store, { name: '演示', rows: 5, seed: 3, columns: [{ name: 'x', kind: 'sequence' }, { name: 'y', kind: 'linear', source: 'x', slope: 2 }] });
  const pack = exportWorkspace(store, { datasetId: d.id, query: { mode: 'plot', x: 'x', yColumns: ['y'], kind: 'line' } });
  assert.equal(pack.contract, 'moondata.workspace/1');
  assert.equal(pack.version, '0.6.49');
  assert.equal(pack.datasets.length, 1);
  assert.equal(pack.evidence.length, 1);
  assert.equal(pack.evidence[0].verified, true);
  assert.match(pack.evidence[0].planCanonical, /^moondata\.generate\/1\|/);
  assert.equal(pack.evidence[0].sha256, d.sha256);
  const other = new DatasetStore();
  importDataset(other, { name: 'old.csv', content: 'a,b\n1,2\n' });
  const restored = importWorkspace(other, { workspace: pack, replace: true });
  assert.equal(other.list().length, 1);
  assert.equal(restored.datasets[0].rowCount, 5);
  assert.equal(restored.view.query.mode, 'plot');
  assert.equal(restored.view.query.x, 'x');
  assert.notEqual(restored.view.datasetId, d.id);
  const again = explore(other, restored.view.query);
  assert.equal(again.chart.kind, 'line');
  assert.equal(again.statistics.series[0].summary.count, 5);
  close(again.statistics.series[0].summary.mean, 6);
  // Re-import is claimed-only: pack evidence after re-export is unverified but still carries the fingerprint.
  const claimed = exportWorkspace(other);
  assert.equal(claimed.evidence[0].verified, false);
  assert.equal(claimed.evidence[0].planCanonical, pack.evidence[0].planCanonical);
  assert.equal(other.get(restored.datasets[0].id).provenance.claimed.planCanonical, pack.evidence[0].planCanonical);
});

test('status advertises preview edition and workspace HTTP round-trips', async t => {
  const server = createServer({ env: {} });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function call(path, body, method = body ? 'POST' : 'GET') {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    cookie = r.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return r;
  }
  const status = await (await call('/api/status')).json();
  assert.equal(status.version, '0.6.49');
  assert.equal(status.edition, 'synthetic-contract-workbench');
  assert.equal(status.positioning, 'not-a-dataframe-library');
  assert.equal(status.contracts.generate, 'moondata.generate/1');
  assert.equal(status.contracts.explore, 'moondata.explore/1');
  assert.equal(status.contracts.proposeGeneration, 'planCanonical-only; storeMutated=false');
  assert.equal(status.contracts.toolAllowlistValidator, 'moondata.contract/validate_tool_call');
  assert.deepEqual(status.contracts.tools, [
    'profile_dataset', 'explore_dataset', 'plot_dataset', 'propose_generation', 'plan_chart',
  ]);
  assert.equal(status.jury.demo, 'node scripts/demo-jury.mjs');
  assert.equal(status.jury.fingerprint, 'node scripts/fingerprint-check.mjs');
  assert.match(status.jury.diff, /DIFF_VS_MOONFRAME/);
  assert.match(status.dataPolicy, /MoonFrame/);
  const buffer = buildXlsx(['组', '值'], [['A', 1], ['B', 2], ['A', 3]]);
  const imported = await (await call('/api/import', { name: 'demo.xlsx', format: 'xlsx', contentBase64: buffer.toString('base64') })).json();
  assert.equal(imported.dataset.rowCount, 3);
  const exported = await (await call('/api/workspace/export', { datasetId: imported.dataset.id })).json();
  assert.equal(exported.workspace.datasets.length, 1);
  const wiped = await call('/api/datasets/' + imported.dataset.id, undefined, 'DELETE');
  assert.equal(wiped.status, 200);
  const restored = await (await call('/api/workspace/import', { workspace: exported.workspace, replace: true })).json();
  assert.equal(restored.datasets.length, 1);
  assert.equal(restored.datasets[0].rowCount, 3);
});
