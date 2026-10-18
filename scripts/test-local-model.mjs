import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startLocalModel } from '../server/local-runtime.mjs';
import { DatasetStore } from '../server/datasets.mjs';
import { importDataset } from '../server/data.mjs';
import { workbenchAgent } from '../server/workbench-agent.mjs';
import { createServer } from '../server/index.mjs';
import { listenForBrowser } from './browser-server.mjs';
const model = await startLocalModel({ port: 4325 });
const config = { kind: 'local-planner', endpoint: `${model.origin}/v1/chat/completions`, model: model.model };
const checks = []; let server, browser;
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
const source = '日期,地区,收入,支出\n2026-01-01,东,100,40\n2026-01-03,西,150,60\n2026-01-10,东,200,70';
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
try {
  const store = new DatasetStore(), d = importDataset(store, { name: 'synthetic-ledger.csv', content: source });
  const selection = { datasetId: d.id, mode: 'plot', x: '日期', yColumns: ['收入', '支出'], kind: 'auto', reducer: 'mean' };
  async function ask(message, query = selection) { return workbenchAgent({ store, datasetId: d.id, message, query, config }); }
  const a = await ask('以日期为横轴，收入和支出为纵轴画折线图'); assert.equal(a.artifacts[0]?.query.x, '日期'); assert.deepEqual(a.artifacts[0].query.yColumns, ['收入', '支出']); assert.equal(a.artifacts[0].chart.kind, 'line'); record('real Qwen maps Chinese request to date X and two Y series');
  const b = await ask('把我当前选择的几列换成柱状图'); assert.equal(b.artifacts[0]?.chart.kind, 'bar'); assert.equal(b.artifacts[0].query.reducer, 'mean'); assert.deepEqual(b.artifacts[0].query.yColumns, selection.yColumns); record('style-only conversation retains user axes and aggregation');
  const c = await ask('按地区汇总收入总和，画柱状图'); assert.equal(c.artifacts[0]?.query.x, '地区'); assert.deepEqual(c.artifacts[0].query.yColumns, ['收入']); assert.equal(c.artifacts[0].query.reducer, 'sum'); assert.deepEqual(c.artifacts[0].chart.points.map(p => p.y), [300, 150]); record('real Qwen chooses categorical sum and MoonBit computes 300 and 150');
  const e = await ask('以收入为横轴、支出为纵轴画散点图'); assert.equal(e.artifacts[0]?.query.x, '收入'); assert.deepEqual(e.artifacts[0].query.yColumns, ['支出']); assert.equal(e.artifacts[0].chart.kind, 'scatter'); record('real Qwen changes explicit axes to numeric scatter');
  const invalid = await ask('以湿度为横轴画图'); assert.equal(invalid.artifacts.length, 0); assert.equal(invalid.mode, 'validation'); record('field validation prevents missing-axis substitution before inference');
  const plain = importDataset(store, { name: 'text.csv', content: '类别,描述\nA,好\nB,好\nA,一般' });
  const count = await workbenchAgent({ store, datasetId: plain.id, message: '按类别统计行数画柱状图', config }); assert.equal(count.artifacts[0]?.chart.kind, 'bar'); assert.deepEqual(count.artifacts[0].query.yColumns, []); assert.deepEqual(count.artifacts[0].chart.points.map(p => p.y), [2, 1]); record('real Qwen handles text-only data through count chart');
  server = createServer({ env: { LAB_LOCAL_MODEL_URL: `${model.origin}/v1`, LAB_LOCAL_MODEL_NAME: model.model } }); const base = await listenForBrowser(server);
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true }); page.setDefaultTimeout(90000);
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(base); await page.locator('.template').first().waitFor(); assert.match(await page.locator('#model-label').innerText(), /本地小模型/);
  await page.locator('#upload').setInputFiles({ name: 'synthetic-ledger.csv', mimeType: 'text/csv', buffer: Buffer.from(source) }); await page.locator('#report-button:enabled').waitFor();
  await page.locator('#plot-x').selectOption('日期'); for (const checkbox of await page.locator('#plot-ys input').all()) await checkbox.uncheck();
  await page.getByRole('checkbox', { name: '收入', exact: true }).check(); await page.getByRole('checkbox', { name: '支出', exact: true }).check();
  await page.locator('#describe-button').click(); await page.locator('#message').fill('把我当前选择的几列换成折线图'); await page.locator('#send-button').click(); await page.locator('#send-button:enabled').waitFor();
  assert.equal(await page.locator('#chart polyline').count(), 2); assert.match(await page.locator('.assistant-message').last().innerText(), /本地小模型已规划并绘图/);
  const event = page.waitForEvent('download'); await page.locator('#json-report-button').click(); const report = JSON.parse(await readFile(await (await event).path(), 'utf8')); assert.equal(report.query.x, '日期'); assert.deepEqual(report.query.yColumns, ['收入', '支出']); assert.equal(report.statistics.series[0].summary.mean, 150); record('real browser selection and dialog produce two lines and a source-backed report');
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: new URL('../artifacts/browser-local-model.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.locator('#message').fill('以收入为横轴、支出为纵轴画散点图'); await page.locator('#send-button').click(); await page.locator('#send-button:enabled').waitFor();
  assert.equal(await page.locator('#plot-x').inputValue(), '收入'); assert.equal(await page.getByRole('checkbox', { name: '收入', exact: true }).isChecked(), false); assert.equal(await page.getByRole('checkbox', { name: '支出', exact: true }).isChecked(), true); assert.equal(await page.locator('#chart circle').count(), 3); assert.deepEqual(pageErrors, []); record('real browser follow-up changes axes and redraws scatter without script errors');
  await writeFile(new URL('../artifacts/local-model-acceptance.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, model: model.model, runtime: 'llama.cpp b11718 Windows CPU', modelSha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031', syntheticOnly: true, checks, caveat: 'Small synthetic acceptance set, not a general language-understanding benchmark.' }, null, 2));
} catch (e) { await writeFile(new URL('../artifacts/local-model-acceptance.json', import.meta.url), JSON.stringify({ passed: false, checks, failure: e.stack }, null, 2)); throw e; }
finally { if (browser) await browser.close(); if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); } model.stop(); }
