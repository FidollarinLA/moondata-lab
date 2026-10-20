import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from '../server/index.mjs';
import { listenForBrowser } from './browser-server.mjs';
const server = createServer({ env: {} }), base = await listenForBrowser(server);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const errors = [], checks = []; page.on('pageerror', e => errors.push(e.message));
let expectedFailure = false;
page.on('response', response => { if (response.status() >= 400 && !(expectedFailure && response.status() === 503 && response.url().endsWith('/api/data-report'))) errors.push(`${response.status()} ${response.url()}`); });
const passed = text => { checks.push(text); console.log(`PASS ${text}`); };
async function download() { const e = page.waitForEvent('download'); await page.locator('#export').click(); return JSON.parse(await readFile(await (await e).path(), 'utf8')); }
let success = false;
try {
  await page.goto(base + '/showcase');
  assert.equal(await page.locator('#export').isDisabled(), true);
  await page.locator('#compute').click(); await page.getByText('MoonBit 已计算', { exact: false }).waitFor();
  let result = await download(); assert.equal(result.syntheticDemo, true);
  assert.deepEqual(result.table.map(r => r.value), [270, 180, 50]);
  assert.equal(result.statistics.series[0].summary.count, 5); assert.equal(result.statistics.series[0].excludedRows, 1);
  passed('Live MoonBit sum and complete-sample count match independent expectations');
  await page.locator('#reducer').selectOption('mean'); assert.equal(await page.locator('#export').isDisabled(), true);
  await page.locator('#compute').click(); await page.getByText('MoonBit 已计算', { exact: false }).waitFor();
  result = await download(); assert.deepEqual(result.table.map(r => r.value), [135, 90, 50]); passed('Mean recomputes and changed query invalidates prior export');
  await page.locator('[data-mode=architecture]').click(); await page.locator('.stage').nth(3).click(); assert.match(await page.locator('#step-copy').innerText(), /完全没有调用模型/);
  await page.locator('[data-mode=data]').click(); await page.locator('#next').click(); assert.match(await page.locator('#step-title').innerText(), /缺失/);
  await page.locator('#play').click(); await page.waitForFunction(() => document.querySelector('#play').getAttribute('aria-pressed') === 'true'); await page.locator('#play').click();
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('paused')), true);
  passed('All three views, step controls and pause work');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/showcase-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.paper').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.screenshot({ path: 'artifacts/showcase-mobile.png', fullPage: true }); passed('390px layout has no overflow and reduced-motion disables illustration animation');
  expectedFailure = true;
  await page.route('**/api/data-report', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '演示服务暂不可用' }) }));
  await page.locator('#compute').click(); await page.getByText('无法完成计算', { exact: false }).waitFor(); assert.equal(await page.locator('#export').isDisabled(), true); assert.equal(await page.locator('.bar-row').count(), 0); passed('Compute failure clears stale chart and never fabricates success');
  assert.deepEqual(errors, []); success = true;
} finally {
  await writeFile('artifacts/showcase-review.json', JSON.stringify({ checkedAt: new Date().toISOString(), passed: success, checks, errors, modelCalled: false }, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
}
