#!/usr/bin/env node
/**
 * Offline self-check: regenerate sales template and verify planCanonical + CSV SHA-256.
 * Usage: node scripts/fingerprint-check.mjs
 * Exit 0 only when MoonBit fingerprint and source hash agree with independent recomputation.
 */
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { canonicalPlan } from '../server/core.mjs';
import {
  templates, normalizePlan, planForFingerprint, generateDataset, downloadDataset, dataReport,
} from '../server/data.mjs';

const store = new DatasetStore();
const plan = templates.find(t => t.id === 'sales');
if (!plan) throw new Error('sales template missing');

const expectedCanon = canonicalPlan(planForFingerprint(normalizePlan(plan)));
const a = generateDataset(store, plan);
const b = generateDataset(store, plan);
const jsonA = JSON.parse(downloadDataset(store, a.id, 'json').content);
const csvA = downloadDataset(store, a.id, 'csv').content;
const csvHash = createHash('sha256').update(csvA).digest('hex');
const report = dataReport(store, {
  datasetId: a.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum',
});

const checks = {
  planCanonicalMatchesMoonBit: jsonA.provenance.planCanonical === expectedCanon,
  provenanceEqualsExpected: jsonA.provenance.planCanonical === expectedCanon,
  repeatGenerateSameSha: a.sha256 === b.sha256,
  csvShaMatchesDataset: a.sha256 === csvHash,
  reportEvidencePlanCanonical: report.evidence?.planCanonical === expectedCanon,
  reportJsonEvidence: JSON.parse(report.json).evidence?.planCanonical === expectedCanon,
  reportMarkdownCitesCanon: report.markdown.includes(expectedCanon),
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
