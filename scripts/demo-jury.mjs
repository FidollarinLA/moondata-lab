#!/usr/bin/env node
/**
 * 5-minute jury path without a browser: generate → explore → report fingerprint.
 * Usage: node scripts/demo-jury.mjs
 */
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { templates, generateDataset, explore, dataReport, downloadDataset } from '../server/data.mjs';
import { validateToolCall, AppError, canonicalExploreQuery, TOOL_ALLOWLIST_VALIDATOR } from '../server/core.mjs';
import { workbenchAgent, workbenchTools } from '../server/workbench-agent.mjs';

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
let rejectShellMessage = null;
try {
  validateToolCall('run_shell', { cmd: 'ls' });
} catch (e) {
  rejectShellMessage = String(e?.message || e);
  rejectShell = e instanceof AppError && e.message === 'Tool not allowlisted: run_shell';
}
if (!rejectShell) throw new Error(`allowlist failed to reject run_shell with stable message: ${rejectShellMessage}`);
try {
  validateToolCall('plan_chart', { datasetId: '', action: 'plot' });
  throw new Error('empty datasetId should reject');
} catch (e) {
  if (!(e instanceof AppError) || e.message !== 'plan_chart requires non-empty datasetId') {
    throw new Error(`empty datasetId reject message unstable: ${e?.message}`);
  }
}

const agent = await workbenchAgent({
  store,
  datasetId: dataset.id,
  message: '概览当前数据',
  config: null,
});
if (agent.trace?.[0]?.contract?.validator !== TOOL_ALLOWLIST_VALIDATOR || !agent.trace[0].contract.allowlisted) {
  throw new Error('builtin agent trace missing MoonBit allowlist contract evidence');
}
if (agent.evidence?.toolAllowlistValidator !== TOOL_ALLOWLIST_VALIDATOR
  || !agent.evidence?.toolsValidated?.includes('profile_dataset')) {
  throw new Error('builtin agent evidence.toolsValidated missing profile_dataset');
}

const beforePropose = store.list().length;
const proposed = await workbenchAgent({
  store, datasetId: null, message: '生成销售台账示例', config: null,
});
if (proposed.artifacts?.[0]?.kind !== 'generation-plan'
  || proposed.artifacts[0].storeMutated !== false
  || !String(proposed.artifacts[0].planCanonical || '').startsWith('moondata.generate/1|')
  || store.list().length !== beforePropose) {
  throw new Error('propose_generation must return planCanonical without mutating the store');
}
if (!proposed.evidence?.toolsValidated?.includes('propose_generation')) {
  throw new Error('propose_generation path missing toolsValidated evidence');
}
if (proposed.artifacts[0].planCanonical !== canon) {
  throw new Error('propose_generation planCanonical must match sales generate provenance');
}
const beforeInvalid = store.list().length;
const tools = workbenchTools(store, null);
let invalidProposeOk = false;
try {
  tools.execute('propose_generation', { rows: 5, seed: 1, columns: [] });
} catch (e) {
  invalidProposeOk = e instanceof AppError
    && e.message === 'Plan requires 1..32 columns'
    && store.list().length === beforeInvalid;
}
if (!invalidProposeOk) {
  throw new Error('invalid propose_generation must reject with Plan requires 1..32 columns and leave store unchanged');
}

const east = group.table.find(r => r.group === '华东');
console.log(JSON.stringify({
  ok: true,
  edition: 'reproducible-synthetic + evidence workbench',
  notADataFrameLibrary: 'Use MoonFrame for general DF; see docs/DIFF_VS_MOONFRAME.md',
  dataset: { name: dataset.name, rows: dataset.rowCount, sha256: dataset.sha256, synthetic: dataset.synthetic },
  planCanonical: canon,
  rejectShellOk: rejectShell,
  rejectShellMessage: 'Tool not allowlisted: run_shell',
  emptyDatasetIdRejectOk: true,
  allowlistEvidenceOk: true,
  proposeGenerationNoStoreOk: true,
  invalidProposeNoStoreOk: true,
  proposeMatchesGenerateCanon: proposed.artifacts[0].planCanonical === canon,
  proposePlanCanonical: proposed.artifacts[0].planCanonical,
  toolsValidated: agent.evidence.toolsValidated,
  overviewFields: overview.table.length,
  groupSumEast: east?.value ?? null,
  reportSha256InMarkdown: report.markdown.includes(dataset.sha256),
  reportPlanCanonicalOk: report.markdown.includes(canon) && report.result.dataset.planCanonical === canon,
  reportEvidenceOk: report.evidence?.planCanonical === canon && JSON.parse(report.json).evidence?.planCanonical === canon && Array.isArray(JSON.parse(report.json).table),
  queryCanonical: report.evidence?.queryCanonical ?? null,
  reportQueryCanonicalOk: !!report.evidence?.queryCanonical?.startsWith('moondata.explore/1|'),
  reportBytes: Buffer.byteLength(report.markdown),
  selfCheck: createHash('sha256').update(canon).digest('hex').slice(0, 12),
}, null, 2));
if (!report.markdown.includes(canon) || report.result.dataset.planCanonical !== canon) {
  throw new Error('report must cite provenance.planCanonical');
}
if (report.evidence?.planCanonical !== canon || JSON.parse(report.json).evidence?.planCanonical !== canon) {
  throw new Error('JSON report evidence.planCanonical missing or mismatched');
}
const expectedQuery = canonicalExploreQuery({
  mode: 'group', group: '地区', reducer: 'sum', value: '销售金额',
});
if (report.evidence?.queryCanonical !== expectedQuery || !report.markdown.includes(expectedQuery)) {
  throw new Error('report must cite MoonBit queryCanonical evidence');
}
