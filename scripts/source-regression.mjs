import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { importDataset, profile, explore, dataReport } from '../server/data.mjs';

const sources = [
  { name: 'usgs-earthquakes-2025-01-m4', format: 'csv', url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2025-01-01&endtime=2025-02-01&minmagnitude=4&orderby=time-asc', documentation: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/csv.php', attribution: 'USGS ANSS earthquake catalog; source corrections may change later responses.', x: 'depth', y: 'mag' },
  { name: 'nasa-exoplanets-first-200', format: 'json', url: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=' + encodeURIComponent('select top 200 pl_name,hostname,discoverymethod,disc_year,pl_orbper,pl_rade from pscomppars order by pl_name') + '&format=json', documentation: 'https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html', attribution: 'NASA Exoplanet Archive, operated by Caltech/IPAC; original scientific measurements have their own references. A bounded query, not the entire archive.', x: 'pl_orbper', y: 'pl_rade' },
];
const cache = new URL('../.local/source-regression/', import.meta.url); await mkdir(cache, { recursive: true });
const results = [];
for (const source of sources) {
  const record = { ...source, passed: false, license: 'Public provider download; attribution preserved, no blanket redistribution license inferred.', transformations: 'None. Exact downloaded CSV or flat JSON imported.' };
  try {
    const file = new URL(`${source.name}.${source.format}`, cache), metadata = new URL(`${source.name}.meta.json`, cache);
    let content;
    try { content = await readFile(file, 'utf8'); Object.assign(record, JSON.parse(await readFile(metadata, 'utf8'))); }
    catch {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      content = await response.text(); record.retrievedAt = new Date().toISOString();
      await writeFile(file, content); await writeFile(metadata, JSON.stringify({ retrievedAt: record.retrievedAt }));
    }
    record.sha256 = createHash('sha256').update(content).digest('hex');
    const store = new DatasetStore(), d = importDataset(store, { name: source.name, content, format: source.format });
    const p = profile(store, d.id); record.rows = p.rowCount; record.columns = p.columns.length;
    assert.ok(p.rowCount > 0); explore(store, { ...p.recommendation, datasetId: d.id });
    const query = { datasetId: d.id, mode: 'plot', x: source.x, yColumns: [source.y], kind: 'scatter' };
    const report = dataReport(store, query).result;
    const stored = store.get(d.id), xi = stored.headers.indexOf(source.x), yi = stored.headers.indexOf(source.y);
    const pairs = stored.rows.map((_, i) => [stored.numericColumns[xi][i], stored.numericColumns[yi][i]]).filter(([x, y]) => x !== null && y !== null);
    const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    const actual = report.statistics.series[0];
    assert.equal(actual.summary.count, pairs.length); assert.equal(actual.excludedRows, stored.rows.length - pairs.length);
    assert.ok(Math.abs(actual.summary.mean - meanY) <= Math.max(1e-10, Math.abs(meanY) * 1e-10));
    record.query = query; record.completePairs = pairs.length; record.excludedRows = actual.excludedRows;
    record.independentMean = meanY; record.reportedMean = actual.summary.mean;
    record.passed = true; record.checks = ['unaltered-import', 'recommended-plot', 'explicit-scatter', 'recomputed-report', 'pair-count', 'independent-mean'];
  } catch (error) { record.error = error.message; }
  results.push(record); console.log(`${record.passed ? 'PASS' : 'FAIL'} ${source.name} ${record.rows ?? ''} ${record.error ?? ''}`);
}
await writeFile(new URL('../artifacts/source-regression.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.every(r => r.passed), results, caveat: 'Two direct-provider snapshots supplement the 40 curated tables. This is not model evaluation, a license audit or complete coverage of raw scientific data. Math cross-check uses imported numeric pairs; parser correctness is separately tested.' }, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
