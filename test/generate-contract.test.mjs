import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { canonicalPlan, canonicalExploreQuery, generateRows } from '../server/core.mjs';
import {
  normalizePlan, planForFingerprint, generateDataset, downloadDataset, templates, dataReport, explore,
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

test('missing then boolean consumes RNG in documented order', () => {
  // missing draw first; null skips boolean draw. seed=1, missing=0.3, p=0.5 → null,null,true,true,null
  const plan = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'ok', kind: 'boolean', probability: 0.5, missing: 0.3 }],
  });
  assert.deepEqual(generateRows(plan).rows.map(r => r[0]), [null, null, true, true, null]);
  const heavy = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'ok', kind: 'boolean', probability: 0.5, missing: 0.8 }],
  });
  assert.deepEqual(generateRows(heavy).rows.map(r => r[0]), [null, null, null, null, null]);
});

test('category equal-probability rows match Park–Miller index closed form', () => {
  // index = floor(u * n); seed=1 → u-seq as in METHODS; [A,B] → A,A,B; [X,Y,Z] → X,X,Z.
  const two = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'g', kind: 'category', choices: ['A', 'B'] }],
  });
  assert.deepEqual(generateRows(two).rows.map(r => r[0]), ['A', 'A', 'B']);
  const three = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'g', kind: 'category', choices: ['X', 'Y', 'Z'] }],
  });
  assert.deepEqual(generateRows(three).rows.map(r => r[0]), ['X', 'X', 'Z']);
  const weighted = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'g', kind: 'category', choices: ['A', 'A', 'B'] }],
  });
  assert.deepEqual(generateRows(weighted).rows.map(r => r[0]), ['A', 'A', 'B']);
});

test('sequence and text are seed-independent closed forms', () => {
  // start + i*step; text prefixes the value. No RNG — seed must not change rows.
  const seqA = normalizePlan({
    rows: 3, seed: 99, columns: [{ name: 'id', kind: 'sequence', start: 10, step: 5 }],
  });
  const seqB = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'id', kind: 'sequence', start: 10, step: 5 }],
  });
  assert.deepEqual(generateRows(seqA).rows.map((r) => r[0]), [10, 15, 20]);
  assert.deepEqual(generateRows(seqB).rows.map((r) => r[0]), [10, 15, 20]);

  const textA = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 't', kind: 'text', prefix: 'R-', start: 1, step: 1 }],
  });
  const textB = normalizePlan({
    rows: 3, seed: 42, columns: [{ name: 't', kind: 'text', prefix: 'R-', start: 1, step: 1 }],
  });
  assert.deepEqual(generateRows(textA).rows.map((r) => r[0]), ['R-1', 'R-2', 'R-3']);
  assert.deepEqual(generateRows(textB).rows.map((r) => r[0]), ['R-1', 'R-2', 'R-3']);

  // Negative step is allowed (unlike step=0); still seed-independent.
  const seqNegA = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'id', kind: 'sequence', start: 10, step: -3 }],
  });
  const seqNegB = normalizePlan({
    rows: 3, seed: 99, columns: [{ name: 'id', kind: 'sequence', start: 10, step: -3 }],
  });
  assert.deepEqual(generateRows(seqNegA).rows.map((r) => r[0]), [10, 7, 4]);
  assert.deepEqual(generateRows(seqNegB).rows.map((r) => r[0]), [10, 7, 4]);
  assert.match(
    canonicalPlan(planForFingerprint(seqNegA)),
    /kind=sequence,start=10,step=-3/,
  );
  const textNeg = normalizePlan({
    rows: 3, seed: 7, columns: [{ name: 't', kind: 'text', prefix: 'N', start: 5, step: -1 }],
  });
  assert.deepEqual(generateRows(textNeg).rows.map((r) => r[0]), ['N5', 'N4', 'N3']);
});

test('missing then sequence or text consumes RNG in documented order', () => {
  // missing draw only; kept cells use start+i*step (row index). seed=1, missing=0.3
  const seq = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'id', kind: 'sequence', start: 10, step: 5, missing: 0.3 }],
  });
  assert.deepEqual(generateRows(seq).rows.map((r) => r[0]), [null, null, 20, 25, 30]);
  const text = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 't', kind: 'text', prefix: 'R-', start: 1, step: 1, missing: 0.3 }],
  });
  assert.deepEqual(generateRows(text).rows.map((r) => r[0]), [null, null, 'R-3', 'R-4', 'R-5']);
});

test('linear null source skips noise draw; noise zero still consumes RNG', () => {
  // Independent: miss then maybe int; on present source linear always draws noise u even if noise=0.
  // seed=1 → (null,null),(null,null),(5,11),(null,null),(null,null)
  const plan = normalizePlan({
    rows: 5, seed: 1,
    columns: [
      { name: 'x', kind: 'integer', min: 0, max: 10, missing: 0.3 },
      { name: 'y', kind: 'linear', source: 'x', slope: 2, intercept: 1, noise: 0, decimals: 2 },
    ],
  });
  assert.deepEqual(
    generateRows(plan).rows.map((r) => [r[0], r[1]]),
    [[null, null], [null, null], [5, 11], [null, null], [null, null]],
  );
});

test('missing then integer consumes RNG in documented order', () => {
  // missing draw first; null skips integer floor draw.
  // seed=1, missing=0.3, [0,10], five rows → null,null,5,2,null
  const plan = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'n', kind: 'integer', min: 0, max: 10, missing: 0.3 }],
  });
  assert.deepEqual(generateRows(plan).rows.map((r) => r[0]), [null, null, 5, 2, null]);
  const heavy = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'n', kind: 'integer', min: 0, max: 10, missing: 0.8 }],
  });
  assert.deepEqual(generateRows(heavy).rows.map((r) => r[0]), [null, null, null, null, null]);
});

test('integer closed interval matches independent Park–Miller floor form', () => {
  // value = min + floor(u * (max-min+1)); seed=1 → u as in METHODS.
  const M = 2147483647;
  const u = [16807 / M, 282475249 / M, 1622650073 / M];
  const iv = (min, max) => u.map((ui) => min + Math.floor(ui * (max - min + 1)));
  assert.deepEqual(iv(0, 10), [0, 1, 8]);
  assert.deepEqual(iv(3, 5), [3, 3, 5]);
  assert.deepEqual(iv(7, 7), [7, 7, 7]);

  for (const [min, max, expected] of [
    [0, 10, [0, 1, 8]],
    [3, 5, [3, 3, 5]],
    [7, 7, [7, 7, 7]],
  ]) {
    const plan = normalizePlan({
      rows: 3, seed: 1,
      columns: [{ name: 'n', kind: 'integer', min, max }],
    });
    assert.deepEqual(generateRows(plan).rows.map((r) => r[0]), expected);
  }
});

test('linear with noise matches independent Park–Miller closed form', () => {
  // y = round(slope*src + intercept + noise*(2u-1), decimals); sequence uses no RNG.
  const M = 2147483647;
  const u = [16807 / M, 282475249 / M, 1622650073 / M];
  const round = (x, d) => {
    const s = 10 ** d;
    return Math.round(x * s) / s;
  };
  const expected = u.map((ui, i) => round(2 * (i + 1) + 1 + 0.5 * (2 * ui - 1), 2));
  assert.deepEqual(expected, [2.5, 4.63, 7.26]);

  const noisy = normalizePlan({
    rows: 3, seed: 1,
    columns: [
      { name: 'x', kind: 'sequence', start: 1, step: 1 },
      { name: 'y', kind: 'linear', source: 'x', slope: 2, intercept: 1, noise: 0.5, decimals: 2 },
    ],
  });
  assert.deepEqual(generateRows(noisy).rows.map((r) => r[1]), expected);

  const quiet = normalizePlan({
    rows: 3, seed: 1,
    columns: [
      { name: 'x', kind: 'sequence', start: 1, step: 1 },
      { name: 'y', kind: 'linear', source: 'x', slope: 2, intercept: 1, noise: 0, decimals: 2 },
    ],
  });
  assert.deepEqual(generateRows(quiet).rows.map((r) => r[1]), [3, 5, 7]);
});

test('missing then linear consumes RNG in documented order', () => {
  // linear missing draw first; null skips noise (noise=0 still draws when kept). seed=1 → (1,null)…
  const plan = normalizePlan({
    rows: 5, seed: 1,
    columns: [
      { name: 'x', kind: 'sequence', start: 1, step: 1 },
      { name: 'y', kind: 'linear', source: 'x', slope: 2, intercept: 1, noise: 0, decimals: 2, missing: 0.3 },
    ],
  });
  assert.deepEqual(
    generateRows(plan).rows.map((r) => [r[0], r[1]]),
    [[1, null], [2, null], [3, 7], [4, 9], [5, null]],
  );
  const heavy = normalizePlan({
    rows: 5, seed: 1,
    columns: [
      { name: 'x', kind: 'sequence', start: 1, step: 1 },
      { name: 'y', kind: 'linear', source: 'x', slope: 2, intercept: 1, noise: 0, decimals: 2, missing: 0.8 },
    ],
  });
  assert.deepEqual(
    generateRows(heavy).rows.map((r) => [r[0], r[1]]),
    [[1, null], [2, null], [3, null], [4, null], [5, null]],
  );
});

test('missing then number consumes RNG in documented order', () => {
  // missing draw first; null skips number lerp. seed=1, missing=0.3, [0,10]@2 → null,null,4.59,2.19,null
  const plan = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'x', kind: 'number', min: 0, max: 10, decimals: 2, missing: 0.3 }],
  });
  assert.deepEqual(
    generateRows(plan).rows.map((r) => r[0]),
    [null, null, 4.59, 2.19, null],
  );
});

test('missing then category consumes RNG in documented order', () => {
  // missing draw first; null skips category index. seed=1, missing=0.3 → null,null,A,A,null / null,null,Y,X,null
  const ab = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'g', kind: 'category', choices: ['A', 'B'], missing: 0.3 }],
  });
  assert.deepEqual(generateRows(ab).rows.map((r) => r[0]), [null, null, 'A', 'A', null]);
  const xyz = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'g', kind: 'category', choices: ['X', 'Y', 'Z'], missing: 0.3 }],
  });
  assert.deepEqual(generateRows(xyz).rows.map((r) => r[0]), [null, null, 'Y', 'X', null]);
  const heavy = normalizePlan({
    rows: 5, seed: 1,
    columns: [{ name: 'g', kind: 'category', choices: ['A', 'B'], missing: 0.8 }],
  });
  assert.deepEqual(generateRows(heavy).rows.map((r) => r[0]), [null, null, null, null, null]);
});

test('number lerp rows match independent Park–Miller closed form', () => {
  // raw = min*(1-u)+max*u; round to decimals then clamp. seed=1 → u as in METHODS.
  const M = 2147483647;
  const u = [16807 / M, 282475249 / M, 1622650073 / M];
  const round = (x, d) => {
    const s = 10 ** d;
    return Math.round(x * s) / s;
  };
  const expected10 = u.map((ui) => round(0 * (1 - ui) + 10 * ui, 2));
  assert.deepEqual(expected10, [0, 1.32, 7.56]);

  const wide = normalizePlan({
    rows: 3, seed: 1,
    columns: [{ name: 'x', kind: 'number', min: 0, max: 10, decimals: 2 }],
  });
  assert.deepEqual(generateRows(wide).rows.map((r) => r[0]), expected10);

  const narrow = normalizePlan({
    rows: 3, seed: 1,
    columns: [{ name: 'x', kind: 'number', min: 1, max: 2, decimals: 3 }],
  });
  assert.deepEqual(
    generateRows(narrow).rows.map((r) => r[0]),
    u.map((ui) => round(1 * (1 - ui) + 2 * ui, 3)),
  );

  // decimals=0 rounds to integers; fingerprint cites decimals=0 (not omitted).
  const zeroDec = normalizePlan({
    rows: 3, seed: 1,
    columns: [{ name: 'x', kind: 'number', min: 0, max: 10, decimals: 0 }],
  });
  assert.deepEqual(generateRows(zeroDec).rows.map((r) => r[0]), [0, 1, 8]);
  assert.equal(
    canonicalPlan(planForFingerprint(zeroDec)),
    'moondata.generate/1|rows=3|seed=1|columns=[{name=x,kind=number,min=0,max=10,decimals=0}]',
  );
});

test('boolean and date rows match independent Park–Miller / day arithmetic', () => {
  // seed=1 → u = [16807, 282475249, 1622650073] / 2147483647
  // boolean true iff u < probability; date = start_day + i*step (no RNG when missing=0).
  const M = 2147483647;
  const u = [16807 / M, 282475249 / M, 1622650073 / M];
  assert.ok(u[0] < 0.5 && u[1] < 0.5 && u[2] > 0.5);
  assert.ok(u.every((ui) => ui > 0 && ui < 1));

  const boolPlan = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'ok', kind: 'boolean', probability: 0.5 }],
  });
  assert.deepEqual(generateRows(boolPlan).rows.map(r => r[0]), [true, true, false]);

  // Park–Miller u ∈ (0,1): probability=0 → never true; probability=1 → always true.
  const never = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'ok', kind: 'boolean', probability: 0 }],
  });
  assert.deepEqual(generateRows(never).rows.map(r => r[0]), [false, false, false]);
  const always = normalizePlan({
    rows: 3, seed: 1, columns: [{ name: 'ok', kind: 'boolean', probability: 1 }],
  });
  assert.deepEqual(generateRows(always).rows.map(r => r[0]), [true, true, true]);

  const store = new DatasetStore();
  const dates = generateDataset(store, {
    rows: 3, seed: 1, name: 'days',
    columns: [{ name: 'day', kind: 'date', startDate: '2026-01-01', step: 1 }],
  });
  assert.deepEqual(store.get(dates.id).records.map(r => r.day), ['2026-01-01', '2026-01-02', '2026-01-03']);

  const back = generateDataset(store, {
    rows: 3, seed: 99, name: 'back',
    columns: [{ name: 'day', kind: 'date', startDate: '2026-01-03', step: -1 }],
  });
  assert.deepEqual(store.get(back.id).records.map(r => r.day), ['2026-01-03', '2026-01-02', '2026-01-01']);

  // step=0 repeats start day; seed change does not alter rows (no RNG).
  const zeroA = generateDataset(store, {
    rows: 3, seed: 1, name: 'zero-a',
    columns: [{ name: 'day', kind: 'date', startDate: '2026-01-01', step: 0 }],
  });
  const zeroB = generateDataset(store, {
    rows: 3, seed: 99, name: 'zero-b',
    columns: [{ name: 'day', kind: 'date', startDate: '2026-01-01', step: 0 }],
  });
  assert.deepEqual(store.get(zeroA.id).records.map(r => r.day), ['2026-01-01', '2026-01-01', '2026-01-01']);
  assert.deepEqual(store.get(zeroB.id).records.map(r => r.day), ['2026-01-01', '2026-01-01', '2026-01-01']);
  assert.match(
    store.get(zeroA.id).provenance.planCanonical,
    /kind=date,step=0,start_day=20454/,
  );
});

test('missing then date consumes RNG in documented order', () => {
  // missing draw only; kept cells use start_day+i*step (row index). seed=1, missing=0.3 → null,null,Jan3..5
  const store = new DatasetStore();
  const kept = generateDataset(store, {
    rows: 5, seed: 1, name: 'days-m',
    columns: [{ name: 'day', kind: 'date', startDate: '2026-01-01', step: 1, missing: 0.3 }],
  });
  assert.deepEqual(
    store.get(kept.id).records.map((r) => r.day),
    [null, null, '2026-01-03', '2026-01-04', '2026-01-05'],
  );
  const heavy = generateDataset(store, {
    rows: 5, seed: 1, name: 'days-h',
    columns: [{ name: 'day', kind: 'date', startDate: '2026-01-01', step: 1, missing: 0.8 }],
  });
  assert.deepEqual(store.get(heavy.id).records.map((r) => r.day), [null, null, null, null, null]);
});

test('explore distribution/scatter/line queryCanonical closed forms', () => {
  const dist =
    'moondata.explore/1|mode=distribution|value=金额|bins=10';
  assert.equal(
    canonicalExploreQuery({ bins: 10, value: '金额', mode: 'distribution', datasetId: 'sess' }),
    dist,
  );
  assert.equal(
    canonicalExploreQuery({ mode: 'distribution', value: '金额', bins: 10 }),
    dist,
  );
  assert.equal(
    canonicalExploreQuery({ y: '金额', x: '数量', mode: 'scatter' }),
    'moondata.explore/1|mode=scatter|x=数量|y=金额',
  );
  assert.equal(
    canonicalExploreQuery({ mode: 'line', x: '日期', y: '金额' }),
    'moondata.explore/1|mode=line|x=日期|y=金额',
  );
});

test('plot multi yColumns queryCanonical preserves series order', () => {
  const expected =
    'moondata.explore/1|mode=plot|x=地区|yColumns=[金额,数量]|kind=bar|reducer=sum';
  assert.equal(
    canonicalExploreQuery({
      reducer: 'sum', kind: 'bar', yColumns: ['金额', '数量'], x: '地区', mode: 'plot',
    }),
    expected,
  );
  assert.equal(
    canonicalExploreQuery({
      mode: 'plot', x: '地区', yColumns: ['金额', '数量'], kind: 'bar', reducer: 'sum',
    }),
    expected,
  );
  const swapped = canonicalExploreQuery({
    mode: 'plot', x: '地区', yColumns: ['数量', '金额'], kind: 'bar', reducer: 'sum',
  });
  assert.equal(swapped, 'moondata.explore/1|mode=plot|x=地区|yColumns=[数量,金额]|kind=bar|reducer=sum');
  assert.notEqual(swapped, expected);
});

test('explore queryCanonical is order-stable and cited in report evidence', () => {
  const expected =
    'moondata.explore/1|mode=group|group=地区|reducer=sum|value=金额';
  assert.equal(
    canonicalExploreQuery({
      mode: 'group', group: '地区', reducer: 'sum', value: '金额', datasetId: 'sess',
    }),
    expected,
  );
  assert.equal(
    canonicalExploreQuery({
      value: '金额', reducer: 'sum', group: '地区', mode: 'group',
    }),
    expected,
  );
  assert.equal(canonicalExploreQuery({ mode: 'overview' }), 'moondata.explore/1|mode=overview');

  // group without value omits value= from the fingerprint (count / optional push_str).
  const countCanon = 'moondata.explore/1|mode=group|group=地区|reducer=count';
  assert.equal(
    canonicalExploreQuery({ mode: 'group', group: '地区', reducer: 'count' }),
    countCanon,
  );
  assert.equal(
    canonicalExploreQuery({ reducer: 'count', group: '地区', mode: 'group', datasetId: 'x' }),
    countCanon,
  );

  const store = new DatasetStore();
  const d = generateDataset(store, { ...templates[0], rows: 20 });
  const qCanon = 'moondata.explore/1|mode=group|group=地区|reducer=sum|value=销售金额';
  const explored = explore(store, {
    datasetId: d.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum',
  });
  assert.equal(explored.queryCanonical, qCanon);
  const report = dataReport(store, {
    datasetId: d.id, mode: 'group', group: '地区', value: '销售金额', reducer: 'sum',
  });
  assert.equal(report.evidence.queryCanonical, qCanon);
  assert.ok(report.markdown.includes(qCanon));

  const counted = explore(store, {
    datasetId: d.id, mode: 'group', group: '地区', reducer: 'count',
  });
  assert.equal(counted.queryCanonical, countCanon);
  const countReport = dataReport(store, {
    datasetId: d.id, mode: 'group', group: '地区', reducer: 'count',
  });
  assert.equal(countReport.evidence.queryCanonical, countCanon);
  assert.ok(countReport.markdown.includes(countCanon));
  assert.equal(JSON.parse(report.json).evidence.queryCanonical, qCanon);
});

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
  assert.equal(report.evidence.planCanonical, EXPECTED_DATE_BOOL_MISS);
  assert.equal(report.evidence.sourceSha256, d.sha256);
  assert.equal(JSON.parse(report.json).evidence.planCanonical, EXPECTED_DATE_BOOL_MISS);
});
