import test from 'node:test';
import assert from 'node:assert/strict';
import { request as rawRequest } from 'node:http';
import { createServer } from '../server/index.mjs';

async function setup(t, options) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`; let cookie = '';
  return { base, request: async (path, data, options = {}) => {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1', ...(cookie ? { Cookie: cookie } : {}), ...options.headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), ...options });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  } };
}
const selection = id => ({ datasetId: id, timeColumn: 't', valueColumn: 'x', timeUnit: 's', valueUnit: 'rpm', target: 10, initial: 0, stepTime: 0, bandPercent: 2, tailPercent: 20 });

test('full HTTP import analyze chat report and raw CSV export', async t => {
  const { request } = await setup(t, { env: {} });
  assert.equal((await request('/')).status, 200);
  const status = await (await request('/api/status')).json(); assert.equal(status.model.mode, 'builtin');
  const uploaded = await request('/api/datasets', { name: 'motor.csv', csv: 't,x\n0,0\n1,5\n2,10\n3,10\n' });
  assert.equal(uploaded.status, 201); const { dataset } = await uploaded.json();
  const s = selection(dataset.id);
  const result = await (await request('/api/analyze', s)).json(); assert.equal(result.result.metrics.iae, 10);
  const chat = await (await request('/api/chat', { selections: [s], message: '分析这次响应' })).json(); assert.equal(chat.trace[0].ok, true);
  const report = await (await request('/api/report', { selections: [s] })).json(); assert.equal(report.json.results[0].metrics.iae, 10); assert.match(report.markdown, /motor\.csv/);
  const csv = await (await request('/api/export-csv', s)).text(); assert.match(csv, /time_s,"x"\n0,0/);
});
test('demo returns two generic synthetic datasets for the workbench', async t => {
  const { request } = await setup(t, { env: {} }); const { datasets } = await (await request('/api/demo', {})).json();
  assert.equal(datasets.length, 2); assert.ok(datasets.every(d => d.synthetic));
  assert.deepEqual(datasets.map(d => d.name), ['sales-synthetic.csv', 'survey-synthetic.csv']);
  const profiled = await (await request('/api/profile', { datasetId: datasets[0].id })).json();
  assert.ok(profiled.profile.columns.some(c => c.name === '地区' || c.name === '销售金额'));
});
test('historical motor fixtures still compare through legacy analyze APIs', async t => {
  const { request } = await setup(t, { env: {} });
  const { readFile } = await import('node:fs/promises');
  const a = await readFile(new URL('../examples/motor-a.csv', import.meta.url), 'utf8');
  const b = await readFile(new URL('../examples/motor-b.csv', import.meta.url), 'utf8');
  const da = await (await request('/api/datasets', { name: 'motor-a.csv', csv: a })).json();
  const db = await (await request('/api/datasets', { name: 'motor-b.csv', csv: b })).json();
  const selections = [da.dataset.id, db.dataset.id].map(id => ({ ...selection(id), timeColumn: 'time_s', valueColumn: 'speed_rpm', target: 1000, stepTime: .5 }));
  const { result } = await (await request('/api/compare', { selections })).json();
  assert.ok(result.results[0].metrics.overshoot_percent > result.results[1].metrics.overshoot_percent);
});
test('sessions cannot access each other datasets', async t => {
  const { base, request } = await setup(t, { env: {} });
  const { dataset } = await (await request('/api/datasets', { name: 'private.csv', csv: 't,x\n0,0\n1,5\n2,10' })).json();
  const response = await fetch(base + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1' }, body: JSON.stringify(selection(dataset.id)) });
  assert.equal(response.status, 404);
});
test('reject cross-site mutation missing client marker and DNS rebinding host', async t => {
  const { base } = await setup(t, { env: {} });
  const cross = await fetch(base + '/api/demo', { method: 'POST', headers: { Origin: 'https://example.com', 'X-Lab-Client': '1', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(cross.status, 403);
  const marker = await fetch(base + '/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(marker.status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = rawRequest(base + '/api/status', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
});
test('static allowlist does not expose source environment or traversal', async t => {
  const { request } = await setup(t, { env: {} });
  for (const path of ['/.env', '/server/agent.mjs', '/engine.js', '/%2e%2e/package.json', '/api/unknown']) assert.equal((await request(path)).status, 404);
});
test('invalid bodies csv and analysis inputs fail without crashing', async t => {
  const { request } = await setup(t, { env: {} });
  assert.equal((await request('/api/datasets', { name: 'bad.csv', csv: 'x,x\n1,2' })).status, 400);
  assert.equal((await request('/api/analyze', {})).status, 404);
  const response = await request('/api/demo', undefined, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Lab-Client': '1' }, body: '{}' }); assert.equal(response.status, 415);
  assert.equal((await request('/api/status')).status, 200);
});
test('security headers are present and credentials never enter status', async t => {
  const { request } = await setup(t, { env: { LAB_MODEL_URL: 'https://example.com/v1', LAB_MODEL_NAME: 'model', LAB_MODEL_KEY: 'secret123' } });
  const response = await request('/api/status'); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.ok(!(await response.text()).includes('secret123'));
});
