import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from '../server/index.mjs';
import { listenForBrowser } from './browser-server.mjs';

// Public fixture stays in the ignored cache; commit measurements, never private uploads.
const source = await readFile(new URL('../.local/public-regression/cars.json', import.meta.url));
const rows = JSON.parse(source);
const pairs = rows.filter(r => typeof r.Horsepower === 'number' && typeof r.Miles_per_Gallon === 'number');
const expectedMean = pairs.reduce((sum, r) => sum + r.Miles_per_Gallon, 0) / pairs.length;
const server = createServer({ env: {} });
const base = await listenForBrowser(server);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const result = { checkedAt: new Date().toISOString(), validation: 'Automated public-data journey; not a novice usability study.', passed: false };
try {
  await page.goto(base);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#start-upload').click();
  await (await chooser).setFiles({ name: 'cars.json', mimeType: 'application/json', buffer: source });
  await page.locator('#report-button:enabled').waitFor();
  await page.locator('#plot-x').selectOption('Horsepower');
  for (const checkbox of await page.locator('#plot-ys input').all()) await checkbox.uncheck();
  await page.getByLabel('Miles_per_Gallon', { exact: true }).check();
  await page.locator('#plot-kind').selectOption('scatter');
  await page.locator('#plot-button').click(); await page.locator('#report-button:enabled').waitFor();
  const event = page.waitForEvent('download'); await page.locator('#json-report-button').click();
  const report = JSON.parse(await readFile(await (await event).path(), 'utf8'));
  const summary = report.statistics.series[0].summary;
  assert.equal(summary.count, pairs.length); assert.ok(Math.abs(summary.mean - expectedMean) < 1e-10);
  result.publicData = { name: 'cars', sourceRows: rows.length, completePairs: pairs.length, independentMean: expectedMean, reportedMean: summary.mean };
  await page.screenshot({ path: new URL('../artifacts/product-review-desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#chart');
    return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 2;
  });
  result.mobile = await page.locator('#chart').evaluate(svg => ({
    chartWidth: svg.getBoundingClientRect().width,
    minimumRenderedFont: Math.min(...Array.from(svg.querySelectorAll('text'), el => parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a)),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    plottedPoints: svg.querySelectorAll('circle').length,
  }));
  assert.equal(result.mobile.horizontalOverflow, false); assert.ok(result.mobile.minimumRenderedFont >= 11);
  assert.equal(result.mobile.plottedPoints, pairs.length); assert.deepEqual(errors, []);
  await page.locator('#chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: new URL('../artifacts/product-review-mobile.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  result.passed = true;
} catch (error) { result.failure = error.stack; throw error; }
finally {
  await writeFile(new URL('../artifacts/product-review.json', import.meta.url), JSON.stringify({ ...result, errors }, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify(result, null, 2));
