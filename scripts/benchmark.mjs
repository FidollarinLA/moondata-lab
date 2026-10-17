import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { DatasetStore } from '../server/datasets.mjs';
import { analyze } from '../server/tools.mjs';

const rows = ['time_s,speed_rpm'];
for (let i = 0; i < 100000; i++) {
  const t = i / 1000; rows.push(`${t},${1000 * (1 - Math.exp(-t * 4))}`);
}
const csv = rows.join('\n'), store = new DatasetStore();
const start = performance.now();
const dataset = store.add({ name: 'synthetic-100k.csv', csv, synthetic: true });
const importedAt = performance.now();
const result = analyze(store, { datasetId: dataset.id, timeColumn: 'time_s', valueColumn: 'speed_rpm', timeUnit: 's', valueUnit: 'rpm', target: 1000, initial: 0, stepTime: 0, bandPercent: 2, tailPercent: 10 });
const finished = performance.now();
const measurement = { measuredAt: new Date().toISOString(), platform: `${process.platform}/${process.arch}`, node: process.version, rows: 100000, bytes: Buffer.byteLength(csv), importMs: importedAt - start, analyzeMs: finished - importedAt, chartPoints: result.chart.points.length, allRawSamplesUsed: result.summary.count === 100000, metrics: result.metrics, caveat: 'Single local synthetic run, not a cross-platform performance guarantee.' };
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/benchmark.json', import.meta.url), JSON.stringify(measurement, null, 2));
console.log(JSON.stringify(measurement, null, 2));
