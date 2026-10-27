#!/usr/bin/env node
/**
 * Offline self-check: regenerate sales template and verify planCanonical + CSV SHA-256.
 * Usage: node scripts/fingerprint-check.mjs
 * Exit 0 only when MoonBit fingerprint and source hash agree with independent recomputation.
 */
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { canonicalPlan, canonicalExploreQuery, TOOL_ALLOWLIST_VALIDATOR, AppError, validateToolCall } from '../server/core.mjs';
import {
  templates, normalizePlan, planForFingerprint, generateDataset, downloadDataset, dataReport, explore,
} from '../server/data.mjs';
import { workbenchAgent, workbenchTools } from '../server/workbench-agent.mjs';

const store = new DatasetStore();
const plan = templates.find(t => t.id === 'sales');
if (!plan) throw new Error('sales template missing');

const expectedCanon = canonicalPlan(planForFingerprint(normalizePlan(plan)));
const proposeOnly = new DatasetStore();
const proposed = workbenchTools(proposeOnly, null).execute('propose_generation', plan);
const a = generateDataset(store, plan);
const b = generateDataset(store, plan);
const jsonA = JSON.parse(downloadDataset(store, a.id, 'json').content);
const csvA = downloadDataset(store, a.id, 'csv').content;
const csvHash = createHash('sha256').update(csvA).digest('hex');
const groupQuery = { datasetId: a.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum' };
const expectedQuery = canonicalExploreQuery({
  mode: 'group', group: '地区', value: '销售金额', reducer: 'sum',
});
const explored = explore(store, groupQuery);
const report = dataReport(store, groupQuery);
const agent = await workbenchAgent({
  store, datasetId: a.id, message: '概览当前数据', config: null,
});
let rejectShellMessage = null;
try {
  validateToolCall('run_shell', { cmd: 'ls' });
} catch (e) {
  rejectShellMessage = e instanceof AppError ? e.message : null;
}
let emptyDatasetIdMessage = null;
try {
  validateToolCall('plan_chart', { datasetId: '', action: 'plot' });
} catch (e) {
  emptyDatasetIdMessage = e instanceof AppError ? e.message : null;
}
const rejectStore = new DatasetStore();
const rejectTools = workbenchTools(rejectStore, null);
let invalidProposeEmptyCols = null;
try {
  rejectTools.execute('propose_generation', { rows: 5, seed: 1, columns: [] });
} catch (e) {
  invalidProposeEmptyCols = e instanceof AppError ? e.message : null;
}
let invalidProposeBadRows = null;
try {
  rejectTools.execute('propose_generation', {
    rows: 0, seed: 1, columns: [{ name: 'id', kind: 'sequence', start: 1, step: 1 }],
  });
} catch (e) {
  invalidProposeBadRows = e instanceof AppError ? e.message : null;
}
let unsupportedExploreMode = null;
try {
  validateToolCall('explore_dataset', { datasetId: 'ds', mode: 'pivot' });
} catch (e) {
  unsupportedExploreMode = e instanceof AppError ? e.message : null;
}
let invalidProposeBadSeed = null;
try {
  rejectTools.execute('propose_generation', {
    rows: 1, seed: 0, columns: [{ name: 'id', kind: 'sequence', start: 1, step: 1 }],
  });
} catch (e) {
  invalidProposeBadSeed = e instanceof AppError ? e.message : null;
}
const maxSeedPropose = rejectTools.execute('propose_generation', {
  rows: 1, seed: 2147483646, columns: [{ name: 'id', kind: 'sequence', start: 1, step: 1 }],
});

const checks = {
  planCanonicalMatchesMoonBit: jsonA.provenance.planCanonical === expectedCanon,
  provenanceEqualsExpected: jsonA.provenance.planCanonical === expectedCanon,
  proposePlanCanonicalMatchesGenerate: proposed.kind === 'generation-plan'
    && proposed.storeMutated === false
    && proposed.planCanonical === expectedCanon
    && proposed.planCanonical === jsonA.provenance.planCanonical
    && proposeOnly.list().length === 0,
  repeatGenerateSameSha: a.sha256 === b.sha256,
  csvShaMatchesDataset: a.sha256 === csvHash,
  reportEvidencePlanCanonical: report.evidence?.planCanonical === expectedCanon,
  reportJsonEvidence: JSON.parse(report.json).evidence?.planCanonical === expectedCanon,
  reportMarkdownCitesCanon: report.markdown.includes(expectedCanon),
  exploreAttachesQueryCanonical: explored.queryCanonical === expectedQuery,
  reportEvidenceQueryCanonical: report.evidence?.queryCanonical === expectedQuery,
  reportMarkdownCitesQueryCanonical: report.markdown.includes(expectedQuery),
  allowlistRejectsShellExact: rejectShellMessage === 'Tool not allowlisted: run_shell',
  emptyDatasetIdRejectExact: emptyDatasetIdMessage === 'plan_chart requires non-empty datasetId',
  invalidProposeEmptyColumnsExact: invalidProposeEmptyCols === 'Plan requires 1..32 columns'
    && rejectStore.list().length === 0,
  invalidProposeOutOfRangeRowsExact: invalidProposeBadRows === 'Plan rows/seed out of generation contract range'
    && rejectStore.list().length === 0,
  unsupportedExploreModeExact: unsupportedExploreMode === 'Unsupported explore mode',
  invalidProposeSeedBoundsExact: invalidProposeBadSeed === 'Plan rows/seed out of generation contract range'
    && maxSeedPropose.storeMutated === false
    && String(maxSeedPropose.planCanonical || '').includes('|seed=2147483646|')
    && rejectStore.list().length === 0,
  agentTraceContractValidator: agent.trace?.[0]?.contract?.validator === TOOL_ALLOWLIST_VALIDATOR
    && agent.trace[0].contract.allowlisted === true,
  agentEvidenceToolsValidated: agent.evidence?.toolAllowlistValidator === TOOL_ALLOWLIST_VALIDATOR
    && Array.isArray(agent.evidence?.toolsValidated)
    && agent.evidence.toolsValidated.includes('profile_dataset'),
};

const ok = Object.values(checks).every(Boolean);
const out = {
  ok,
  edition: 'fingerprint self-check',
  expectedCanon,
  datasetSha256: a.sha256,
  checks,
};
console.log(JSON.stringify(out, null, 2));
if (!ok) {
  console.error('fingerprint-check failed');
  process.exit(1);
}
