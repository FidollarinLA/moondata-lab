import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { canonicalPlan } from '../server/core.mjs';
import {
  normalizePlan, planForFingerprint, generateDataset, downloadDataset, templates, dataReport,
} from '../server/data.mjs';

/** Independent expected fingerprint (includes decimals on linear — matches normalizePlan defaults). */
const EXPECTED_MULTI =
  'moondata.generate/1|rows=5|seed=7|columns=[{name=id,kind=text,start=1,step=1,prefix=R-},{name=g,kind=category,choices=[A,B]},{name=x,kind=integer,min=0,max=10},{name=y,kind=linear,decimals=2,source=x,slope=2,intercept=1,noise=0.5}]';

const multiPlan = {
  rows: 5,
  seed: 7,
  name: 'prop',
  columns: [
    { name: 'id', kind: 'text', prefix: 'R-', start: 1, step: 1 },
    { name: 'g', kind: 'category', choices: ['A', 'B'] },
    { name: 'x', kind: 'integer', min: 0, max: 10 },
    { name: 'y', kind: 'linear', source: 'x', slope: 2, intercept: 1, noise: 0.5, decimals: 2 },
  ],
};

test('multi-kind planCanonical is key-order stable with independent expected wire form', () => {
  const a = {
    seed: 7,
    rows: 5,
    columns: [
      { name: 'id', kind: 'text', prefix: 'R-', start: 1, step: 1 },
      { kind: 'category', choices: ['A', 'B'], name: 'g' },
      { max: 10, min: 0, name: 'x', kind: 'integer' },
      { noise: 0.5, source: 'x', slope: 2, name: 'y', kind: 'linear', intercept: 1, decimals: 2 },
    ],
  };
  const b = {
    columns: [
      { step: 1, start: 1, prefix: 'R-', kind: 'text', name: 'id' },
      { name: 'g', choices: ['A', 'B'], kind: 'category' },
      { kind: 'integer', name: 'x', min: 0, max: 10 },
      { kind: 'linear', name: 'y', source: 'x', slope: 2, intercept: 1, noise: 0.5, decimals: 2 },
    ],
    seed: 7,
    rows: 5,
  };
  assert.equal(canonicalPlan(a), EXPECTED_MULTI);
  assert.equal(canonicalPlan(b), EXPECTED_MULTI);
  assert.notEqual(canonicalPlan({ ...a, seed: 8 }), EXPECTED_MULTI);
});

test('same normalized plan → same planCanonical and CSV sha256; seed change diverges both', () => {
  const store = new DatasetStore();
  const first = generateDataset(store, multiPlan);
  const again = generateDataset(store, {
    rows: multiPlan.rows,
    seed: multiPlan.seed,
    name: multiPlan.name,
    columns: [
      { step: 1, start: 1, prefix: 'R-', kind: 'text', name: 'id' },
      { choices: ['A', 'B'], name: 'g', kind: 'category' },
      { kind: 'integer', max: 10, min: 0, name: 'x' },
      { intercept: 1, noise: 0.5, slope: 2, source: 'x', kind: 'linear', name: 'y', decimals: 2 },
    ],
  });
  const jsonA = JSON.parse(downloadDataset(store, first.id, 'json').content);
  const jsonB = JSON.parse(downloadDataset(store, again.id, 'json').content);
  assert.equal(jsonA.provenance.planCanonical, EXPECTED_MULTI);
  assert.equal(jsonB.provenance.planCanonical, EXPECTED_MULTI);
  assert.equal(first.sha256, again.sha256);
  assert.equal(
    first.sha256,
    createHash('sha256').update(downloadDataset(store, first.id, 'csv').content).digest('hex'),
  );

  const other = generateDataset(store, { ...multiPlan, seed: 8 });
  const jsonC = JSON.parse(downloadDataset(store, other.id, 'json').content);
  assert.notEqual(other.sha256, first.sha256);
  assert.notEqual(jsonC.provenance.planCanonical, EXPECTED_MULTI);
  assert.match(jsonC.provenance.planCanonical, /seed=8/);
  assert.doesNotMatch(jsonC.provenance.planCanonical, /seed=7/);
});

test('planForFingerprint matches MoonBit canonical surface used in provenance', () => {
  const store = new DatasetStore();
  const d = generateDataset(store, templates[0]);
  const json = JSON.parse(downloadDataset(store, d.id, 'json').content);
  const expected = canonicalPlan(planForFingerprint(normalizePlan(templates[0])));
  assert.equal(json.provenance.planCanonical, expected);
  assert.match(expected, /^moondata\.generate\/1\|rows=300\|seed=42\|/);
});

const EXPECTED_DATE_BOOL_MISS =
  'moondata.generate/1|rows=4|seed=11|columns=[{name=day,kind=date,step=1,start_day=20454},{name=ok,kind=boolean,probability=0.25},{name=n,kind=integer,min=1,max=5,missing=0.1}]';

test('date/boolean/missing fingerprint surface and report cites planCanonical', () => {
  const raw = {
    rows: 4,
    seed: 11,
    columns: [
      { step: 1, start_day: 20454, kind: 'date', name: 'day' },
      { probability: 0.25, name: 'ok', kind: 'boolean' },
      { missing: 0.1, max: 5, min: 1, name: 'n', kind: 'integer' },
    ],
  };
  assert.equal(canonicalPlan(raw), EXPECTED_DATE_BOOL_MISS);

  const store = new DatasetStore();
  const d = generateDataset(store, {
    rows: 4,
    seed: 11,
    name: 'dbm',
    columns: [
      { name: 'day', kind: 'date', startDate: '2026-01-01', step: 1 },
      { name: 'ok', kind: 'boolean', probability: 0.25 },
      { name: 'n', kind: 'integer', min: 1, max: 5, missing: 0.1 },
    ],
  });
  const json = JSON.parse(downloadDataset(store, d.id, 'json').content);
  assert.equal(json.provenance.planCanonical, EXPECTED_DATE_BOOL_MISS);

  const report = dataReport(store, { datasetId: d.id, mode: 'overview' });
  assert.equal(report.result.dataset.planCanonical, EXPECTED_DATE_BOOL_MISS);
  assert.match(report.markdown, /planCanonical：/);
  assert.ok(report.markdown.includes(EXPECTED_DATE_BOOL_MISS));
});
