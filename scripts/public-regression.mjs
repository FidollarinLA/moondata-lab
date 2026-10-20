import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatasetStore } from '../server/datasets.mjs';
import { importDataset, profile, explore, dataReport } from '../server/data.mjs';
const revision = '175a81ca00b2a0d9bd1159ddcf2b7b232e591d93';
const base = `https://raw.githubusercontent.com/vega/vega-datasets/${revision}/`;
const cache = new URL('../.local/public-regression/', import.meta.url); await mkdir(cache, { recursive: true });
let catalog; try { catalog = JSON.parse(await readFile(new URL('catalog.json', cache), 'utf8')); } catch { catalog = await (await fetch(base + 'datapackage.json')).json(); await writeFile(new URL('catalog.json', cache), JSON.stringify(catalog)); }
// Explicitly exclude same-source size variants (flights, S&P, Gapminder), lookup
// fixtures and generated normal/uniform samples; retain distinct public tables.
const selected = new Set('airports,barley,bird_migration,birdstrikes,budget,burtin,cars,co2_concentration,countries,crimea,disasters,driving,flights_airport,football,gapminder,github,global_temp,income,iowa_electricity,jobs,la_riots,london_centroids,monarchs,movies,obesity,ohlc,penguins,political_contributions,population,seattle_weather,sp500,species,stocks,udistrict,unemployment_across_industries,us_employment,us_state_capitals,weather,wheat,windvectors'.split(','));
const resources = catalog.resources.filter(r => selected.has(r.name));
const results = [];
for (const r of resources) {
  const url = base + 'data/' + r.path, file = new URL(encodeURIComponent(r.path), cache);
  const result = { name: r.name, title: r.title, url, format: r.format, upstreamSources: r.sources ?? [], licenses: r.licenses ?? [], status: 'failed' };
  try {
    let content; try { content = await readFile(file, 'utf8'); } catch { const response = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error(`Download HTTP ${response.status}`); content = await response.text(); await writeFile(file, content); }
    result.sha256 = createHash('sha256').update(content).digest('hex');
    const store = new DatasetStore(), d = importDataset(store, { name: r.path, format: r.format, content });
    const p = profile(store, d.id); result.rows = p.rowCount; result.columns = p.columns.length;
    const q = { ...p.recommendation, datasetId: d.id }; const plot = explore(store, q); dataReport(store, plot.query);
    const checks = ['import', 'profile', 'recommended-plot', 'recomputed-report'];
    const numeric = p.columns.filter(c => c.numeric > 0);
    if (numeric.length) {
      const field = numeric[0], i = store.get(d.id).headers.indexOf(field.name), values = store.get(d.id).numericColumns[i].filter(v => v !== null);
      const reference = values.reduce((s, v) => s + v, 0) / values.length;
      if (!field.summary || Math.abs(field.summary.mean - reference) > Math.max(1e-7, Math.abs(reference) * 1e-9)) throw new Error('Independent mean mismatch');
      const hist = explore(store, { datasetId: d.id, mode: 'distribution', value: field.name, bins: 10 });
      if (hist.table.reduce((s, b) => s + b.count, 0) !== values.length) throw new Error('Histogram count mismatch'); checks.push('independent-mean', 'histogram-count');
    }
    result.status = 'passed'; result.checks = checks; result.query = q;
  } catch (e) { result.error = e.message; }
  results.push(result); console.log(`${result.status.toUpperCase()} ${r.name}: ${result.rows ?? '?'} rows ${result.error ?? ''}`);
}
const report = { checkedAt: new Date().toISOString(), revision, source: 'https://github.com/vega/vega-datasets', datasetCount: results.length, passed: results.filter(r => r.status === 'passed').length, selectionPolicy: '40 distinct named tables; same-source size variants and generated fixtures excluded. All are curated by one Vega catalog; upstream provenance is recorded per resource. This is not 40 independent collection organizations.', results, caveat: 'Software regression on public curated datasets. Not a novice usability study or open-domain model accuracy evaluation. Cached originals remain local; no silent preprocessing.' };
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/public-regression.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`TOTAL ${report.passed}/${report.datasetCount}`);
