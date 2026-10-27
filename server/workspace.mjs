import { AppError } from './core.mjs';
import { importDataset, downloadDataset, toCsv } from './data.mjs';

const CONTRACT = 'moondata.workspace/1';

export function exportWorkspace(store, { datasetId = null, query = null } = {}) {
  const list = store.list();
  if (!list.length) throw new AppError('当前没有可导出的数据集');
  const datasets = list.map(d => {
    const full = store.get(d.id);
    const file = downloadDataset(store, d.id, 'json');
    const payload = JSON.parse(file.content);
    return {
      id: d.id,
      name: d.name,
      sourceFormat: d.sourceFormat,
      synthetic: d.synthetic,
      sha256: d.sha256,
      records: payload.records,
      provenance: payload.provenance,
      csv: toCsv(full.headers, full.rows),
    };
  });
  const evidence = datasets.map(d => {
    const prov = d.provenance;
    const planCanonical = prov?.planCanonical ?? prov?.claimed?.planCanonical ?? null;
    const verified = typeof prov?.planCanonical === 'string' && !prov?.imported;
    return {
      name: d.name,
      sha256: d.sha256,
      synthetic: !!d.synthetic,
      planCanonical,
      verified,
    };
  });
  const view = datasetId && list.some(d => d.id === datasetId)
    ? { datasetId, query: query && typeof query === 'object' ? query : null }
    : null;
  return {
    contract: CONTRACT,
    version: '0.6.52',
    exportedAt: new Date().toISOString(),
    persistence: 'file-pack',
    note: '工作区包可在本机重新导入以恢复数据与可选视图；evidence.planCanonical 仅在本会话生成时为已验证，导入后降为声称。不证明数据真实性。',
    datasets,
    evidence,
    view,
  };
}

export function importWorkspace(store, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('工作区必须是对象');
  const pack = input.workspace && typeof input.workspace === 'object' ? input.workspace : input;
  if (pack.contract !== CONTRACT) throw new AppError('不是 MoonData 工作区包（moondata.workspace/1）');
  if (!Array.isArray(pack.datasets) || !pack.datasets.length) throw new AppError('工作区没有数据集');
  if (pack.datasets.length > 12) throw new AppError('工作区最多 12 份数据');
  const replace = input.replace !== false;
  if (replace) store.clear();
  const added = [];
  try {
    for (const item of pack.datasets) {
      if (!item || typeof item !== 'object') throw new AppError('工作区条目无效');
      const name = typeof item.name === 'string' ? item.name : 'restored.csv';
      if (Array.isArray(item.records)) {
        added.push(importDataset(store, {
          name: name.replace(/\.csv$/i, '') + '.json',
          format: 'json',
          content: JSON.stringify({ synthetic: !!item.synthetic, provenance: item.provenance ?? null, records: item.records }),
        }));
      } else if (typeof item.csv === 'string') {
        added.push(importDataset(store, { name, format: 'csv', content: item.csv }));
      } else throw new AppError(`工作区条目“${String(name).slice(0, 80)}”缺少 records 或 csv`);
    }
  } catch (e) {
    if (replace) store.clear();
    for (const d of added) try { store.remove(d.id); } catch {}
    throw e;
  }
  let view = null;
  if (pack.view?.datasetId) {
    const index = pack.datasets.findIndex(d => d.id === pack.view.datasetId);
    const mapped = index >= 0 ? added[index] : added[0];
    view = {
      datasetId: mapped.id,
      query: pack.view.query && typeof pack.view.query === 'object'
        ? { ...pack.view.query, datasetId: mapped.id }
        : null,
    };
  }
  return { datasets: added, view, replaced: replace };
}
