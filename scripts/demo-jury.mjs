#!/usr/bin/env node
/**
 * 5-minute jury path without a browser: generate → explore → report fingerprint.
 * Usage: node scripts/demo-jury.mjs
 */
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { templates, generateDataset, explore, dataReport, downloadDataset } from '../server/data.mjs';
import { validateToolCall, AppError } from '../server/core.mjs';

const store = new DatasetStore();
const plan = templates.find(t => t.id === 'sales');
const dataset = generateDataset(store, plan);
const overview = explore(store, { datasetId: dataset.id, mode: 'overview' });
const group = explore(store, {
  datasetId: dataset.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum',
});
const report = dataReport(store, {
  datasetId: dataset.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum',
});
const exported = JSON.parse(downloadDataset(store, dataset.id, 'json').content);
const canon = exported.provenance.planCanonical;
if (!canon || !String(canon).startsWith('moondata.generate/1|')) {
  throw new Error('missing planCanonical fingerprint on generated dataset');
}
let rejectShell = false;
try {
  validateToolCall('run_shell', { cmd: 'ls' });
} catch (e) {
  rejectShell = e instanceof AppError || /ContractError|allowlist|允许/i.test(String(e?.message || e));
}
if (!rejectShell) throw new Error('allowlist failed to reject run_shell');

const east = group.table.find(r => r.group === '华东');
console.log(JSON.stringify({
  ok: true,
  edition: 'reproducible-synthetic + evidence workbench',
  notADataFrameLibrary: 'Use MoonFrame for general DF; see docs/DIFF_VS_MOONFRAME.md',
  dataset: { name: dataset.name, rows: dataset.rowCount, sha256: dataset.sha256, synthetic: dataset.synthetic },
  planCanonical: canon,
  rejectShellOk: rejectShell,
  overviewFields: overview.table.length,
  groupSumEast: east?.value ?? null,
  reportSha256InMarkdown: report.markdown.includes(dataset.sha256),
  reportBytes: Buffer.byteLength(report.markdown),
  selfCheck: createHash('sha256').update(canon).digest('hex').slice(0, 12),
}, null, 2));
