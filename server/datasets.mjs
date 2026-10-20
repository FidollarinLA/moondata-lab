import { createHash, randomUUID } from 'node:crypto';
import { AppError, parseCsv, summarize, text } from './core.mjs';

export class DatasetStore {
  constructor() { this.datasets = new Map(); }
  add({ name, csv, synthetic = false, sourceText = csv, sourceFormat = 'csv', provenance = null, records = null }) {
    text(name, '文件名', 200);
    if (typeof csv !== 'string' || Buffer.byteLength(csv) > 10 * 1024 * 1024) throw new AppError('CSV 文件不能超过 10 MiB');
    if (this.datasets.size >= 12) throw new AppError('最多保留 12 份数据，请先删除不再需要的数据', 413);
    const parsed = parseCsv(csv);
    const cells = parsed.rows.length * parsed.headers.length;
    const used = [...this.datasets.values()].reduce((sum, d) => sum + d.cells, 0);
    if (cells + used > 1_000_000) throw new AppError('当前会话最多保留 100 万个单元格，请先删除旧数据', 413);
    const bytes = Buffer.byteLength(csv);
    if (bytes + [...this.datasets.values()].reduce((sum, d) => sum + d.bytes, 0) > 20 * 1024 * 1024) throw new AppError('当前会话的文件内容总量不能超过 20 MiB', 413);
    const hashSource = typeof sourceText === 'string' ? sourceText : Buffer.isBuffer(sourceText) ? sourceText : csv;
    const dataset = {
      id: randomUUID(), name, synthetic, cells, bytes,
      sha256: createHash('sha256').update(hashSource).digest('hex'),
      sourceFormat, provenance, records,
      createdAt: new Date().toISOString(),
      headers: parsed.headers,
      rows: parsed.rows,
      columns: parsed.columns,
      numericColumns: parsed.numeric_columns,
    };
    this.datasets.set(dataset.id, dataset);
    return this.describe(dataset);
  }
  get(id) {
    const dataset = this.datasets.get(id);
    if (!dataset) throw new AppError('数据不存在或会话已过期，请重新上传', 404);
    return dataset;
  }
  remove(id) { this.get(id); this.datasets.delete(id); }
  clear() { this.datasets.clear(); }
  list() { return [...this.datasets.values()].map(d => this.describe(d)); }
  describe(d) {
    return {
      id: d.id, name: d.name, synthetic: d.synthetic, sha256: d.sha256,
      createdAt: d.createdAt, rowCount: d.rows.length, sourceFormat: d.sourceFormat, provenance: d.provenance,
      columns: d.columns.map((c, i) => {
        let summary = null;
        if (c.numeric) {
          try { summary = summarize(d.numericColumns[i].filter(n => n !== null)); } catch {}
        }
        return { ...c, summary };
      }),
      preview: d.rows.slice(0, 6),
    };
  }
}
