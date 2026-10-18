import { mkdir, writeFile } from 'node:fs/promises';
import { DatasetStore } from '../server/datasets.mjs';
import { templates, generateDataset, downloadDataset } from '../server/data.mjs';
await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
for (const template of templates) {
  const store = new DatasetStore(), dataset = generateDataset(store, template);
  for (const format of ['csv', 'json']) await writeFile(new URL(`../examples/${template.id}-synthetic.${format}`, import.meta.url), downloadDataset(store, dataset.id, format).content);
  console.log(`${template.id}: ${dataset.rowCount} synthetic rows · ${dataset.sha256}`);
}
