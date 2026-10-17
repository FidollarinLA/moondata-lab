import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer } from '../server/index.mjs';

const directory = new URL('../artifacts/', import.meta.url);
await mkdir(directory, { recursive: true });
const checks = [], errors = [], servers = [];
const record = label => { checks.push(label); console.log(`PASS ${label}`); };
async function listen(server) {
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(10_000);
async function idle() { await page.waitForFunction(() => !document.querySelector('#send-button').disabled); }
async function exportFile(id) {
  const wait = page.waitForEvent('download'); await page.locator(id).click();
  return readFile(await (await wait).path(), 'utf8');
}
async function field(id, value) { await page.locator(id).fill(String(value)); }
try {
  const base = await listen(createServer({ env: {} }));
  await page.goto(base);
  await page.locator('#model-label').getByText('内置分析模式 · 未连接模型').waitFor();
  assert.equal(await page.locator('#send-button').isDisabled(), true);
  record('empty state labels builtin mode and disables analysis without data');

  await page.locator('#demo-button').click();
  await page.locator('#evidence-card').waitFor({ state: 'visible' }); await idle();
  assert.equal(await page.locator('.dataset-item').count(), 2);
  assert.match(await page.locator('#metrics').innerText(), /27\.51/);
  assert.match(await page.locator('#metrics').innerText(), /1\.992/);
  assert.equal(await page.locator('#compare-toggle').isChecked(), true);
  record('synthetic demo loads two experiments and computes independent response comparison');

  const json = JSON.parse(await exportFile('#json-button'));
  assert.equal(json.results.length, 2); assert.ok(json.results[0].dataset.synthetic);
  const markdown = await exportFile('#report-button'); assert.match(markdown, /SHA-256/); assert.match(markdown, /不代表实测/);
  const svg = await exportFile('#svg-button'); assert.match(svg, /<svg/); assert.ok(!svg.includes('data-cursor'));
  const csv = await exportFile('#csv-button'); assert.match(csv, /time_s,"speed_rpm"/); assert.equal(csv.trim().split('\n').length, 1202);
  record('downloads JSON Markdown SVG and full selected CSV');

  await page.locator('[data-prompt]').first().click(); await page.locator('.tool-trace').waitFor(); await idle();
  assert.match(await page.locator('.assistant-message').last().innerText(), /未连接大模型/);
  const singleReport = JSON.parse(await exportFile('#json-button'));
  assert.equal(singleReport.results.length, 1);
  record('single analysis inside comparison mode exports exactly the displayed experiment');
  await page.locator('[data-prompt]').nth(1).click(); await idle();
  assert.match(await page.locator('#metrics').innerText(), /对比/);
  await page.locator('#toast').waitFor({ state: 'hidden' });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: new URL('workbench-desktop.png', directory).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });

  await field('#target', 900);
  assert.equal(await page.locator('#evidence-card').isHidden(), true); assert.equal(await page.locator('#svg-button').isDisabled(), true);
  await page.locator('#analyze-button').click(); await page.locator('#evidence-card').waitFor({ state: 'visible' }); await idle();
  assert.match(await page.locator('#evidence').innerText(), /初始值或目标值不同/);
  record('parameter edits invalidate prior results and unequal conditions show comparison caveat');

  await field('#target', 1000); await page.locator('#analyze-button').click(); await page.locator('#evidence-card').waitFor({ state: 'visible' }); await idle();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  assert.ok(size.scroll <= size.viewport, JSON.stringify(size));
  const viewBox = await page.locator('#chart svg').getAttribute('viewBox'); assert.ok(Number(viewBox.split(' ')[2]) < 500);
  await page.screenshot({ path: new URL('workbench-mobile.png', directory).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  record('390px viewport has no page overflow and chart uses readable responsive coordinates');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('#value-column').selectOption('current_a');
  assert.equal(await page.locator('#target').inputValue(), '');
  assert.equal(await page.locator('#initial').inputValue(), '');
  assert.equal(await page.locator('#value-unit').inputValue(), '');
  record('changing physical response signal requires fresh initial target and unit confirmation');

  const uploadedSource = '\uFEFFt_ms,speed_rpm\r\n0,0\r\n1000,5\r\n2000,10\r\n3000,10\r\n';
  await page.locator('#file-input').setInputFiles({ name: '实验🙂-<img src=x>.csv', mimeType: 'text/csv', buffer: Buffer.from(uploadedSource) });
  await page.waitForFunction(() => document.querySelectorAll('.dataset-item').length === 3); await idle();
  assert.equal(await page.locator('#time-unit').inputValue(), 'ms');
  await field('#initial', 0); await field('#target', 10); await field('#step-time', 0);
  await page.locator('#analyze-button').click(); await page.locator('#evidence-card').waitFor({ state: 'visible' }); await idle();
  const imported = JSON.parse(await exportFile('#json-button'));
  assert.equal(imported.results[0].dataset.sha256, createHash('sha256').update(uploadedSource).digest('hex'));
  assert.equal(imported.results[0].metrics.rise_time, 1.6);
  assert.equal(await page.locator('img[src=x]').count(), 0);
  record('real upload preserves BOM Unicode checksum and milliseconds while treating filenames as text');

  await page.locator('#file-input').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('x,x\n1,2') });
  await page.locator('#notice.error').waitFor(); assert.equal(await page.locator('.dataset-item').count(), 3);
  record('malformed CSV is rejected without replacing existing experiment');

  await page.locator('#file-input').setInputFiles({ name: 'duplicate-time.csv', mimeType: 'text/csv', buffer: Buffer.from('t,x\n0,0\n0,5\n2,10\n3,10') });
  await page.waitForFunction(() => document.querySelectorAll('.dataset-item').length === 4); await idle();
  await field('#initial', 0); await field('#target', 10);
  await page.locator('#analyze-button').click(); await page.locator('#notice.error').waitFor();
  assert.match(await page.locator('#notice').innerText(), /不严格递增/); assert.equal(await page.locator('#evidence-card').isHidden(), true);
  record('duplicate timestamp fails visibly and cannot retain stale result exports');

  let mode = 'normal'; let requests = 0; let rawLeaked = false;
  const provider = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests++; if (body.includes('UNIQUE_PRIVATE_RAW')) rawLeaked = true;
    if (mode === 'error') { res.writeHead(401); res.end('secret-provider-detail'); return; }
    if (mode === 'slow') { const timer = setTimeout(() => { if (!res.destroyed) { res.writeHead(504); res.end(); } }, 30_000); res.on('close', () => clearTimeout(timer)); return; }
    const input = JSON.parse(body);
    const hasResult = input.messages.some(m => m.role === 'tool');
    const message = hasResult ? { role: 'assistant', content: '已按工具结果完成实验比较，指标以结果表为准。' } : { role: 'assistant', content: null, tool_calls: [{ id: 'comparison', type: 'function', function: { name: 'compare_experiments', arguments: '{}' } }] };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] }));
  });
  const providerBase = await listen(provider);
  const modelBase = await listen(createServer({ env: { LAB_MODEL_URL: `${providerBase}/v1`, LAB_MODEL_NAME: 'protocol-test-model', LAB_MODEL_KEY: 'local-test-key' } }));
  await page.goto(modelBase); await page.locator('#model-label').getByText('模型 · protocol-test-model').waitFor();
  await page.locator('#demo-button').click(); await page.locator('#evidence-card').waitFor({ state: 'visible' }); await idle();
  await page.locator('[data-prompt]').nth(1).click(); await page.locator('.tool-trace').waitFor(); await idle();
  assert.equal(requests, 2); assert.equal(rawLeaked, false); assert.match(await page.locator('.assistant-message').last().innerText(), /模型文字解释需研究者核对/);
  assert.ok(!(await page.content()).includes('local-test-key'));
  record('browser model mode completes actual HTTP tool-call loop against a local protocol stub');

  mode = 'error'; await field('#question', '再次比较这两组实验'); await page.locator('#send-button').click(); await page.locator('.message.error').waitFor(); await idle();
  assert.match(await page.locator('.message.error').last().innerText(), /HTTP 401/); assert.ok(!(await page.content()).includes('secret-provider-detail'));
  record('provider errors stay visible sanitized and recover controls');

  mode = 'slow'; await field('#question', '再比较一次'); await page.locator('#send-button').click(); await page.locator('#stop-button').waitFor({ state: 'visible' }); await page.locator('#stop-button').click(); await idle();
  assert.match(await page.locator('.assistant-message').last().innerText(), /已停止本次请求/);
  mode = 'normal';
  await new Promise(resolve => setTimeout(resolve, 100));
  await field('#question', '比较两组实验'); await page.locator('#send-button').click(); await idle();
  assert.match(await page.locator('.assistant-message').last().innerText(), /已按工具结果/);
  record('stop aborts model request releases busy session and permits a subsequent analysis');
  assert.deepEqual(errors, []); record('no uncaught browser errors');
  const evidence = { checkedAt: new Date().toISOString(), passed: true, browser: await browser.version(), viewport: [1440, 1050], mobileViewport: [390, 844], checks, errors, externalModelValidated: false, modelEvidence: 'Local HTTP protocol stub, not a paid or external model.' };
  await writeFile(new URL('browser-verification.json', directory), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (e) {
  await page.screenshot({ path: new URL('browser-failure.png', directory).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true }).catch(() => {});
  await writeFile(new URL('browser-verification.json', directory), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, errors, failure: e.stack }, null, 2));
  throw e;
} finally {
  await browser.close();
  await Promise.all(servers.map(s => { s.closeAllConnections(); return new Promise(resolve => s.close(resolve)); }));
}
