import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from '../server/index.mjs';
import { listenForBrowser } from './browser-server.mjs';

const directory = new URL('../artifacts/', import.meta.url); await mkdir(directory, { recursive: true });
const checks = [], errors = [], servers = [];
const record = label => { checks.push(label); console.log(`PASS ${label}`); };
async function listen(server) { servers.push(server); return listenForBrowser(server); }
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
async function ready() { await page.locator('#report-button:enabled').waitFor(); }
async function update() { await page.locator('#analyze-button').click(); await ready(); }
async function upload(name, text) {
  await page.locator('#upload').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.waitForFunction(name => document.querySelector('#dataset-select option:checked')?.textContent.startsWith(name) && !document.querySelector('#report-button').disabled, name);
}
async function download(selector) { const event = page.waitForEvent('download'); await page.locator(selector).click(); return readFile(await (await event).path(), 'utf8'); }
async function idle() { await page.locator('#send-button:enabled').waitFor(); }
try {
  const base = await listen(createServer({ env: {} })); await page.goto(base); await page.locator('.template').first().waitFor();
  assert.match(await page.locator('#model-label').innerText(), /未连接大模型/); assert.equal(await page.locator('.field').count(), 6);
  await page.locator('[data-template="custom"]').click(); assert.equal(await page.locator('.field').count(), 2); assert.equal(await page.locator('#plan-name').inputValue(), '其他 / 自定义');
  await page.locator('[data-template="sales"]').click();
  await page.screenshot({ path: new URL('browser-generate.png', directory).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  record('general workbench exposes other/custom option and four domain templates');
  await page.locator('#rows').fill('40'); await page.locator('#generate-button').click(); await ready();
  assert.match(await page.locator('#source-label').innerText(), /合成/); assert.match(await page.locator('#metrics').innerText(), /40/);
  const a = JSON.parse(await download('[data-download="json"]')); assert.equal(a.records.length, 40); assert.ok(a.records.every(r => r._synthetic === true)); assert.equal(a.provenance.plan.seed, 42);
  assert.match(a.provenance.planCanonical, /^moondata\.generate\/1\|/);
  assert.match(await page.locator('#fingerprint').innerText(), /planCanonical/);
  assert.match(await page.locator('#fingerprint').getAttribute('title'), /^moondata\.generate\/1\|/);
  const csv = await download('[data-download="csv"]'); assert.ok(csv.includes('"_synthetic"')); assert.equal(csv.trim().split('\n').length, 41);
  const jsonl = await download('[data-download="jsonl"]'); assert.equal(jsonl.trim().split('\n').length, 40);
  record('schema generation and three full dataset downloads preserve types and synthetic marks');
  await page.locator('#tab-generate').click(); await page.locator('#generate-button').click(); await page.waitForFunction(() => document.querySelectorAll('.dataset-item').length === 2 && !document.querySelector('#report-button').disabled); const b = JSON.parse(await download('[data-download="json"]')); assert.equal(a.sourceSha256, b.sourceSha256);
  record('same schema and seed reproduce exact dataset hash through UI');
  await page.locator('#advanced-analysis > summary').click(); await page.locator('#mode').selectOption('group'); await page.locator('#group').selectOption('地区'); await page.locator('#reducer').selectOption('sum'); await page.locator('#value').selectOption('销售金额'); await update();
  assert.equal(await page.locator('#chart rect').count(), 4); assert.match(await download('#svg-button'), /<svg/);
  assert.match(await page.locator('#fingerprint').innerText(), /queryCanonical/);
  assert.match(await page.locator('#fingerprint').getAttribute('title'), /moondata\.explore\/1\|mode=group/);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: new URL('browser-analysis.png', directory).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  record('generated sales ledger groups and renders an exportable bar chart');
  const source = '地区,金额,x,y,日期\n东,10,1,3,2026-01-03\n西,20,2,5,2026-01-01\n东,30,3,7,2026-01-02\n西,,4,9,2026-01-04\n,40,,11,2026-01-05';
  await upload('ledger.csv', source); assert.match(await page.locator('#source-label').innerText(), /用户导入/);
  assert.match(await page.locator('#fingerprint').innerText(), /导入数据（无 planCanonical）/);
  await page.locator('#mode').selectOption('group'); await page.locator('#group').selectOption('地区'); await page.locator('#reducer').selectOption('sum'); await page.locator('#value').selectOption('金额'); await update();
  const report = JSON.parse(await download('#json-report-button')); assert.deepEqual(report.table.map(r => r.value), [40, 20, 40]); assert.equal(report.excludedRows, 1); assert.match(await download('#report-button'), /SHA-256/);
  record('non-time ledger imports and group sums agree with independent expected values');
  await page.locator('#reducer').selectOption('mean'); assert.equal(await page.locator('#report-button').isDisabled(), true); assert.equal(await page.locator('#svg-button').isDisabled(), true); await update();
  assert.deepEqual(JSON.parse(await download('#json-report-button')).table.map(r => r.value), [20, 20, 40]); record('changed queries disable stale reports and recalculate');
  await page.locator('#mode').selectOption('distribution'); await page.locator('#value').selectOption('金额'); await page.locator('#bins').fill('2'); await update();
  const hist = JSON.parse(await download('#json-report-button')); assert.equal(hist.statistics.median, 25); assert.deepEqual(hist.table.map(b => b.count), [2, 2]); record('histogram frequencies and interpolated median are correct');
  assert.equal(await page.locator('#mode option[value="scatter"]').count(), 0); assert.equal(await page.locator('#mode option[value="line"]').count(), 0); record('advanced analysis no longer duplicates free-plot scatter/line modes');
  await page.locator('#plot-x').selectOption('x'); for (const checkbox of await page.locator('#plot-ys input').all()) await checkbox.uncheck();
  await page.getByLabel('y', { exact: true }).check(); await page.locator('#plot-kind').selectOption('scatter'); await page.locator('#plot-button').click(); await ready();
  const scatter = JSON.parse(await download('#json-report-button')); assert.equal(scatter.statistics.series[0].summary.count, 4); assert.ok(Math.abs(scatter.statistics.series[0].summary.pearson - 1) < 1e-12); assert.equal(await page.locator('#chart circle').count(), 4); record('free-plot scatter uses complete numeric pairs and exact correlation');
  await page.locator('#plot-x').selectOption('日期'); for (const checkbox of await page.locator('#plot-ys input').all()) await checkbox.uncheck();
  await page.getByLabel('金额', { exact: true }).check(); await page.locator('#plot-kind').selectOption('line'); await page.locator('#plot-button').click(); await ready();
  const dateLine = JSON.parse(await download('#json-report-button')); assert.equal(dateLine.chart.xMode, 'date'); assert.equal(dateLine.chart.series[0].points[1].xLabel, '2026-01-01'); assert.equal(await page.locator('#chart polyline').count(), 1); record('free-plot date line uses actual UTC spacing and preserves source row order');
  await page.locator('#plot-x').selectOption('x'); for (const checkbox of await page.locator('#plot-ys input').all()) await checkbox.uncheck();
  await page.getByLabel('金额', { exact: true }).check(); await page.getByLabel('y', { exact: true }).check(); await page.locator('#plot-kind').selectOption('line'); await page.locator('#plot-button').click(); await ready();
  assert.equal(await page.locator('#chart polyline').count(), 2); const multi = JSON.parse(await download('#json-report-button')); assert.deepEqual(multi.query.yColumns, ['金额', 'y']); assert.equal(multi.chart.xMode, 'number');
  record('free plot builder renders selected X with multiple Y series and actual numeric spacing');
  await page.locator('#plot-kind').selectOption('scatter'); assert.equal(await page.locator('#svg-button').isDisabled(), true); await page.locator('#plot-button').click(); await ready(); assert.equal(await page.locator('#chart circle').count(), 7); record('chart style selection invalidates exports and redraws both scatter series');
  await page.locator('#recommend-button').click(); await ready(); assert.equal(JSON.parse(await download('#json-report-button')).query.x, '日期'); record('one-click field recommendation creates chart without claiming model inference');
  await upload('rows.json', '[{"id":"001","score":3,"ok":true},{"id":"002","score":5,"extra":"a"}]');
  assert.equal(JSON.parse(await download('[data-download="json"]')).records[0].id, '001');
  await upload('rows.jsonl', '{"group":"A","v":1}\n{"group":"B","v":2}\n'); assert.match(await page.locator('#metrics').innerText(), /2/); record('JSON and JSONL preserve scalar types union headers and text IDs');
  await page.locator('#upload').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('[{"x":{}}]') }); await page.locator('#notice.error').waitFor(); assert.match(await page.locator('#notice').innerText(), /嵌套/); record('nested unsupported data yields actionable error and keeps prior data');
  await upload('unsafe.csv', '<img src=x onerror=alert(1)>,金额\n<script>alert(1)</script>,1\n'); assert.equal(await page.locator('#preview img').count(), 0); assert.equal(await page.locator('#preview script').count(), 0); record('untrusted headers and cells render as text');
  const count = await page.locator('.dataset-item').count(); await page.locator('[data-prompt="生成销售台账示例"]').click(); await idle(); assert.equal(await page.locator('.dataset-item').count(), count); assert.equal(await page.locator('#generate-panel').isVisible(), true); assert.match(await page.locator('.assistant-message').last().innerText(), /尚未创建/); record('offline assistant proposes a template and never creates data silently');
  await page.locator('#message').fill('预测明年的市场'); await page.locator('#send-button').click(); await idle(); assert.match(await page.locator('.assistant-message').last().innerText(), /自由自然语言需要配置/);
  record('offline unsupported prompts do not fabricate model reasoning');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: new URL('browser-mobile.png', directory).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.locator('#tab-analyze').click(); assert.equal(await page.locator('#dataset-select').isVisible(), true); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); record('390px layouts keep dataset switching and forms reachable without page overflow');
  await page.setViewportSize({ width: 1440, height: 1100 });
  let calls = 0; const requests = [];
  const modelBase = await listen(createServer({ env: { LAB_MODEL_URL: 'https://model.example/v1', LAB_MODEL_NAME: 'stub-test' }, fetchImpl: async (_, init) => {
    calls++; requests.push(JSON.parse(init.body));
    const call = (name, args) => ({ content: null, tool_calls: [{ id: `call${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    const message = calls === 1 ? call('propose_generation', { name: 'AI方案', rows: 7, seed: 5, columns: [{ name: 'x', kind: 'sequence' }, { name: 'y', kind: 'linear', source: 'x', slope: 2 }] }) : calls === 3 ? call('explore_dataset', { mode: 'scatter', x: 'x', y: 'y' }) : { content: '已使用工具。方案请检查，数值以结果为准。' };
    return Response.json({ choices: [{ message }] });
  } }));
  await page.goto(modelBase); await page.locator('.template').first().waitFor(); await page.locator('#message').fill('生成两个线性相关字段'); await page.locator('#send-button').click(); await idle();
  assert.equal(await page.locator('.dataset-item').count(), 0); assert.equal(await page.locator('#rows').inputValue(), '7'); await page.locator('#generate-button').click(); await ready();
  await page.locator('#message').fill('分析这两个字段的相关性'); await page.locator('#send-button').click(); await idle();
  const mr = JSON.parse(await download('#json-report-button')); assert.equal(mr.query.mode, 'scatter'); assert.ok(Math.abs(mr.statistics.pearson - 1) < 1e-12); assert.equal(calls, 4);
  const evidence = JSON.parse(requests[3].messages.at(-1).content); assert.equal(evidence.profile.preview, undefined); assert.equal(evidence.table, undefined); record('model protocol stub proposes schema then calls bounded MoonBit analysis without raw sample transfer');
  let upstreamAborted = false;
  const cancelBase = await listen(createServer({ env: { LAB_MODEL_URL: 'https://model.example/v1', LAB_MODEL_NAME: 'cancel-test' }, fetchImpl: (_, init) => new Promise((_, reject) => { init.signal.addEventListener('abort', () => { upstreamAborted = true; reject(new Error('aborted')); }, { once: true }); }) }));
  await page.goto(cancelBase); await page.locator('.template').first().waitFor(); await page.locator('#message').fill('帮我生成数据'); await page.locator('#send-button').click(); await page.locator('#stop-button').waitFor(); await page.waitForTimeout(150); await page.locator('#stop-button').click(); await idle(); await page.waitForTimeout(100); assert.ok(upstreamAborted); assert.match(await page.locator('#notice').innerText(), /停止/); record('cancel stops UI request and aborts model upstream');
  assert.deepEqual(errors, []); record('all browser paths complete without uncaught JavaScript errors');
  await writeFile(new URL('browser-acceptance.json', directory), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks, errors, modelValidation: 'Protocol stubs only, not an external model service.' }, null, 2));
} catch (e) { await writeFile(new URL('browser-acceptance.json', directory), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, errors, failure: e.stack }, null, 2)); throw e; }
finally { await browser.close(); for (const s of servers) { s.closeAllConnections(); await new Promise(r => s.close(r)); } }
