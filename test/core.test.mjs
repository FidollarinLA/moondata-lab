import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseCsv, step, summarize } from '../server/core.mjs';
import { DatasetStore } from '../server/datasets.mjs';
import { analyze, compare, downsample, toolsFor } from '../server/tools.mjs';
import { makeReport } from '../server/report.mjs';

const csv = 't,x\n0,0\n1,5\n2,10\n3,10\n';
function fixture(input = csv, name = 'motor.csv') {
  const store = new DatasetStore(); const d = store.add({ name, csv: input });
  return { store, d, selection: { datasetId: d.id, timeColumn: 't', valueColumn: 'x', timeUnit: 's', valueUnit: 'rpm', target: 10, initial: 0, stepTime: 0, bandPercent: 2, tailPercent: 20 } };
}
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('MoonBit JSON boundary exposes numbers and null without Option arrays', () => {
  const table = parseCsv('t,x\n0,\n1,2');
  assert.deepEqual(table.numeric_columns, [[0, 1], [null, 2]]);
  const m = step([0, 1, 2], [0, 5, 10], { target: 10, initial: 0, step_time: 0, band_percent: 2, tail_percent: 10 });
  assert.equal(m.settling_time, null); assert.equal(typeof m.rise_time, 'number');
});
test('CSV round trips Unicode, BOM, embedded delimiters and escaped quotes', () => {
  const table = parseCsv('\uFEFFt,"转速,🙂"\r\n0,"1"\r\n1,"a""b\n中"\r\n');
  assert.deepEqual(table.headers, ['t', '转速,🙂']);
  assert.equal(table.rows[1][1], 'a"b\n中');
});
test('CSV rejects structural errors and too many columns', () => {
  for (const text of ['a,a\n1,2', 'a,b\n1', 'a\n"x"z', 'a\n"x', 'a\nx"y', `${Array.from({ length: 129 }, (_, i) => `c${i}`).join(',')}\n${Array(129).fill('1').join(',')}`]) assert.throws(() => parseCsv(text));
});
test('missing, invalid, zero and numeric exponent are distinct', () => {
  const t = parseCsv('x\n""\nNaN\nInfinity\n0\n-1.25e2\n');
  assert.deepEqual(t.columns[0], { name: 'x', numeric: 2, missing: 1, invalid: 2 });
  assert.deepEqual(t.numeric_columns[0], [null, null, null, 0, -125]);
});
test('source fingerprint uses exact UTF-8 content including BOM', () => {
  const source = '\uFEFFt,x\r\n0,0\r\n1,1\r\n';
  const { d } = fixture(source);
  assert.equal(d.sha256, createHash('sha256').update(source, 'utf8').digest('hex'));
});
test('population statistics agree with independent algebra', () => {
  const s = summarize([1, 2, 3, 4]);
  close(s.mean, 2.5); close(s.stddev, Math.sqrt(1.25)); close(s.sample_stddev, Math.sqrt(5 / 3)); close(s.rms, Math.sqrt(7.5));
  assert.equal(summarize([8]).sample_stddev, null);
  assert.throws(() => summarize([])); assert.throws(() => summarize([Infinity]));
  assert.throws(() => summarize([1e308, -1e308]));
});
test('ramp has known rise time, IAE, tail and settling', () => {
  const { store, selection } = fixture(); const r = analyze(store, selection);
  close(r.metrics.rise_time, 1.6); close(r.metrics.iae, 10); close(r.metrics.settling_time, 2);
  close(r.metrics.tail_mean, 10); assert.equal(r.engine, 'MoonBit');
});
test('falling response overshoot uses step direction and zero target', () => {
  const m = step([0, 1, 2, 3, 4], [10, 5, -1, 0, 0], { target: 0, initial: 10, step_time: 0, band_percent: 2, tail_percent: 25 });
  close(m.overshoot_percent, 10); assert.equal(m.peak_value, -1); assert.equal(m.settling_time, 3);
});
test('IAE integrates absolute linear error across zero rather than endpoints alone', () => {
  const m = step([0, 1, 2], [0, 20, 10], { target: 10, initial: 0, step_time: 0, band_percent: 2, tail_percent: 10 });
  close(m.iae, 10);
});
test('non-sample step boundary is interpolated and pre-crossed thresholds stay unavailable', () => {
  const m = step([0, 1, 2, 3, 4], [0, 0, 10, 10, 10], { target: 10, initial: 0, step_time: 1.5, band_percent: 2, tail_percent: 20 });
  assert.equal(m.samples, 4); assert.equal(m.rise_time, null); close(m.iae, 1.25); close(m.settling_time, .5);
});
test('unsettled response and one final in-band sample never produce fake settling', () => {
  const m = step([0, 1, 2], [0, 5, 10], { target: 10, initial: 0, step_time: 0, band_percent: 2, tail_percent: 20 });
  assert.equal(m.settling_time, null); assert.match(m.settling_status, /not_observed/); assert.ok(m.warnings.length);
});
test('time unit conversion is applied once and range is explicit', () => {
  const { store, selection } = fixture('t,x\n0,0\n1000,5\n2000,10\n3000,10\n');
  const r = analyze(store, { ...selection, timeUnit: 'ms', rangeStart: 1, stepTime: 1 });
  close(r.metrics.settling_time, 1); assert.equal(r.excludedRows, 1); assert.equal(r.observation.start, 1);
});
test('duplicate, decreasing or missing time and invalid response are rejected', () => {
  for (const source of ['t,x\n0,0\n0,5\n2,10', 't,x\n1,0\n0,5\n2,10', 't,x\n0,0\n,5\n2,10', 't,x\n0,0\n1,\n2,10']) {
    const { store, selection } = fixture(source); assert.throws(() => analyze(store, selection));
  }
});
test('reject zero amplitude, invalid band, empty range and invalid unit', () => {
  const { store, selection } = fixture();
  for (const patch of [{ target: 0 }, { bandPercent: 0 }, { bandPercent: 51 }, { tailPercent: 0 }, { rangeStart: 10 }, { timeUnit: 'minutes' }, { timeColumn: 'x' }, { target: '10' }]) assert.throws(() => analyze(store, { ...selection, ...patch }));
});
test('comparison identifies incompatible conditions and rejects units or duplicate data', () => {
  const { store, selection } = fixture(); const b = store.add({ name: 'b.csv', csv });
  const other = { ...selection, datasetId: b.id };
  assert.equal(compare(store, [selection, other]).comparableStep, true);
  assert.ok(compare(store, [selection, { ...other, target: 12 }]).warnings.length);
  assert.throws(() => compare(store, [selection, { ...other, valueUnit: 'A' }]));
  assert.throws(() => compare(store, [selection, selection]));
});
test('comparison reports unequal settling bands tail windows and observation durations', () => {
  const { store, selection } = fixture(); const b = store.add({ name: 'longer.csv', csv: csv + '4,10\n' });
  const comparison = compare(store, [selection, { ...selection, datasetId: b.id, bandPercent: 5, tailPercent: 30 }]);
  assert.equal(comparison.warnings.length, 3);
  assert.match(comparison.warnings.join(' '), /误差带.*末段窗口.*观察时长/);
});
test('dataset count limit does not overwrite existing experiments', () => {
  const store = new DatasetStore();
  for (let i = 0; i < 12; i++) store.add({ name: `motor-${i}.csv`, csv });
  assert.throws(() => store.add({ name: 'overflow.csv', csv }), /12/);
  assert.equal(store.list().length, 12);
});
test('downsampling keeps spikes endpoints and time order', () => {
  const times = Array.from({ length: 10000 }, (_, i) => i), values = times.map(() => 0); values[103] = 999; values[7007] = -500;
  const points = downsample(times, values);
  assert.ok(points.length <= 1800); assert.deepEqual(points[0], [0, 0]); assert.deepEqual(points.at(-1), [9999, 0]);
  assert.ok(points.some(p => p[1] === 999)); assert.ok(points.some(p => p[1] === -500));
  assert.ok(points.every((p, i) => !i || p[0] > points[i - 1][0]));
});
test('Agent tool boundary cannot analyze unselected data or change confirmed parameters', () => {
  const { store, selection } = fixture(); const b = store.add({ name: 'private.csv', csv });
  const tools = toolsFor(store, [selection]);
  assert.throws(() => tools.execute('analyze_experiment', { dataset_id: b.id }));
  assert.throws(() => tools.execute('analyze_experiment', { dataset_id: selection.datasetId, target: 20 }));
  assert.throws(() => tools.execute('execute_command', { command: 'anything' }));
  assert.equal(tools.execute('analyze_experiment', { dataset_id: selection.datasetId }).selection.target, 10);
});
test('report preserves computed evidence and escapes untrusted names', () => {
  const { store, selection } = fixture(csv, '<img src=x> [link](https://example.com)');
  const result = analyze(store, selection), report = makeReport([result]);
  assert.match(report.markdown, /SHA-256/); assert.match(report.markdown, /1\.60000 s/);
  assert.ok(!report.markdown.includes('<img')); assert.ok(!report.markdown.includes('[link]('));
  assert.equal(report.json.results[0].metrics.iae, 10);
});
test('synthetic example overshoot agrees with closed-form second-order response', async () => {
  const { store, selection } = fixture(await readFile(new URL('../examples/motor-a.csv', import.meta.url), 'utf8'));
  const r = analyze(store, { ...selection, timeColumn: 'time_s', valueColumn: 'speed_rpm', target: 1000, stepTime: .5 });
  const expected = Math.exp(-.38 * Math.PI / Math.sqrt(1 - .38 ** 2)) * 100;
  close(r.metrics.overshoot_percent, expected, .02);
});
