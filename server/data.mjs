import { AppError, text, parseCsv, generateRows, summarize, aggregate, distribution, correlation, canonicalPlan } from './core.mjs';
import { makePlot, recommendPlot } from './plot.mjs';
import { parseXlsx } from './xlsx.mjs';
import { qualityNotesFromColumns } from './quality.mjs';

/** Reject buffers that are not valid UTF-8 (common when Excel saves GBK CSV). */
export function decodeUtf8(buffer, label = '文件') {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length > 10 * 1024 * 1024) throw new AppError('单份数据最大 10 MiB');
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buf);
  } catch {
    throw new AppError(`${label}不是有效 UTF-8。请另存为 UTF-8 CSV，或直接上传 .xlsx`);
  }
}

const KINDS = ['sequence', 'integer', 'number', 'category', 'boolean', 'text', 'date', 'linear'];
const DAY = 86400000;
const defaults = { min: 0, max: 100, start: 1, step: 1, decimals: 2, prefix: '', choices: [], probability: 0.5, missing: 0, start_day: 20454, source: '', slope: 1, intercept: 0, noise: 0 };
function integer(v, lo, hi, name) {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new AppError(`${name} 必须是 ${lo}–${hi} 的整数`);
  return v;
}
export const templates = [
  { id: 'sales', name: '销售台账', description: '日期、地区、渠道、数量与销售金额', rows: 300, seed: 42, columns: [
    { name: '记录编号', kind: 'text', prefix: 'SALE-' }, { name: '日期', kind: 'date', startDate: '2026-01-01' },
    { name: '地区', kind: 'category', choices: ['华东', '华南', '华北', '西部'] },
    { name: '渠道', kind: 'category', choices: ['线上', '门店', '合作伙伴'] },
    { name: '数量', kind: 'integer', min: 1, max: 30 },
    { name: '销售金额', kind: 'linear', source: '数量', slope: 99, noise: 15, decimals: 2 } ] },
  { id: 'inventory', name: '库存台账', description: '物料、仓库、库存量、单价', rows: 200, seed: 73, columns: [
    { name: '物料编号', kind: 'text', prefix: 'SKU-' }, { name: '仓库', kind: 'category', choices: ['一号仓', '二号仓', '三号仓'] },
    { name: '类别', kind: 'category', choices: ['原料', '配件', '成品'] }, { name: '库存量', kind: 'integer', min: 0, max: 500 },
    { name: '单价', kind: 'number', min: 5, max: 200 }, { name: '已盘点', kind: 'boolean', probability: 0.8 } ] },
  { id: 'survey', name: '问卷调查', description: '群体、评分、是否推荐与缺失值', rows: 250, seed: 17, columns: [
    { name: '受访者', kind: 'text', prefix: 'P-' }, { name: '年龄组', kind: 'category', choices: ['18–25', '26–35', '36–50', '50以上'] },
    { name: '满意度', kind: 'integer', min: 1, max: 5, missing: 0.08 },
    { name: '愿意推荐', kind: 'boolean', probability: 0.7 }, { name: '每周使用次数', kind: 'integer', min: 0, max: 20 } ] },
  { id: 'experiment', name: '传感器 / 实验', description: '样本序号、批次、输入与带噪声输出', rows: 400, seed: 123, columns: [
    { name: '样本序号', kind: 'sequence', start: 0, step: 0.1 },
    { name: '批次', kind: 'category', choices: ['A', 'B', 'C'] },
    { name: '输入', kind: 'number', min: 0, max: 10 },
    { name: '输出', kind: 'linear', source: '输入', slope: 2.5, intercept: 1, noise: 0.5, decimals: 3 } ] },
];
templates.push({ id: 'custom', name: '其他 / 自定义', description: '从空白领域开始，自由定义字段与关系', rows: 100, seed: 42, columns: [{ name: '横轴', kind: 'sequence', start: 0, step: 1 }, { name: '数值', kind: 'number', min: 0, max: 100 }] });
export function normalizePlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('生成方案必须是对象');
  const rows = integer(input.rows ?? 300, 1, 10000, '行数');
  const seed = integer(input.seed ?? 42, 1, 2147483646, '随机种子');
  if (!Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 32 || rows * (input.columns.length + 1) > 300000) throw new AppError('需要 1–32 个字段，总单元格不能超过 30 万');
  const names = new Map();
  const columns = input.columns.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('字段必须是对象');
    const c = { ...defaults };
    c.name = text(raw.name, '字段名', 100).trim(); c.kind = raw.kind;
    if (!KINDS.includes(c.kind) || names.has(c.name) || c.name === '_synthetic') throw new AppError('字段类型无效、重名或使用了保留字段 _synthetic');
    for (const key of Object.keys(defaults)) if (Object.hasOwn(raw, key)) c[key] = raw[key];
    for (const key of ['min', 'max', 'start', 'step', 'probability', 'missing', 'slope', 'intercept', 'noise']) {
      if (typeof c[key] !== 'number' || !Number.isFinite(c[key]) || Math.abs(c[key]) > 1e12) throw new AppError(`${c.name}.${key} 必须为绝对值不超过 10¹² 的有限数`);
    }
    integer(c.decimals, 0, 8, '小数位数');
    if (typeof c.prefix !== 'string' || c.prefix.length > 100 || !Array.isArray(c.choices) || c.choices.length > 100 || c.choices.some(x => typeof x !== 'string' || !x.trim() || x.length > 200)) throw new AppError('前缀或类别选项无效');
    if (c.missing < 0 || c.missing > 0.8 || c.probability < 0 || c.probability > 1 || c.noise < 0) throw new AppError('缺失概率 0–0.8，布尔概率 0–1，噪声幅度非负');
    if (['number', 'integer'].includes(c.kind) && (c.min > c.max || (c.kind === 'integer' && (!Number.isInteger(c.min) || !Number.isInteger(c.max))))) throw new AppError('数值上下界无效');
    if (c.kind === 'category' && !c.choices.length) throw new AppError('类别字段需要选项');
    if (['sequence', 'text'].includes(c.kind) && (c.step === 0 || Math.abs(c.start + (rows - 1) * c.step) > 1e12)) throw new AppError('序列步长不能为零或导致结果超界');
    if (c.kind === 'date') {
      if (raw.startDate !== undefined) {
        if (typeof raw.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) || !Number.isFinite(Date.parse(raw.startDate)) || new Date(raw.startDate).toISOString().slice(0, 10) !== raw.startDate) throw new AppError('起始日期须为有效的 YYYY-MM-DD');
        c.start_day = Date.parse(raw.startDate) / DAY;
      }
      integer(c.start_day, -25567, 84005, '起始日期'); integer(c.step, -366, 366, '日期步长');
      const end = c.start_day + (rows - 1) * c.step;
      if (end < -25567 || end > 84005) throw new AppError('生成日期范围须在 1900–2199 年');
    } else { c.start_day = defaults.start_day; }
    if (typeof c.source !== 'string' || c.source.length > 100) throw new AppError('关联来源字段无效');
    if (c.kind === 'linear' && !names.get(c.source)?.numeric) throw new AppError('线性关联需引用前面的数值字段');
    names.set(c.name, { numeric: ['number', 'integer', 'linear'].includes(c.kind) || (c.kind === 'sequence' && !c.prefix) });
    return c;
  });
  return { name: typeof input.name === 'string' ? text(input.name, '数据集名称', 100) : '自定义数据集', rows, seed, columns };
}
/** Strip plan to kind-relevant fields for MoonBit fingerprint (order-stable via contract). */
export function planForFingerprint(plan) {
  return {
    rows: plan.rows,
    seed: plan.seed,
    columns: plan.columns.map(c => {
      const col = { name: c.name, kind: c.kind };
      const add = (key, when = true) => {
        if (when && c[key] !== undefined && c[key] !== null && c[key] !== '') col[key] = c[key];
      };
      if (['number', 'integer'].includes(c.kind)) { add('min'); add('max'); }
      if (['sequence', 'text'].includes(c.kind)) { add('start'); add('step'); add('prefix'); }
      if (c.kind === 'category' && Array.isArray(c.choices) && c.choices.length) col.choices = c.choices;
      if (c.kind === 'boolean') add('probability');
      if (c.kind === 'date') { add('start_day'); add('step'); }
      if (c.kind === 'linear') { add('source'); add('slope'); add('intercept'); add('noise'); }
      add('decimals', ['number', 'linear'].includes(c.kind));
      add('missing', typeof c.missing === 'number' && c.missing > 0);
      return col;
    }),
  };
}
export function generateDataset(store, input) {
  const plan = normalizePlan(input);
  const generated = generateRows(plan);
  const records = generated.rows.map(row => Object.fromEntries(generated.headers.map((h, i) => [h, plan.columns[i]?.kind === 'date' && row[i] !== null ? new Date(row[i] * DAY).toISOString().slice(0, 10) : row[i]])));
  const csv = toCsv(generated.headers, records.map(r => generated.headers.map(h => r[h])));
  const planCanonical = canonicalPlan(planForFingerprint(plan));
  return store.add({
    name: `${plan.name}-synthetic.csv`, csv, synthetic: true, sourceFormat: 'generated', records,
    provenance: {
      contract: 'moondata.generate/1', engine: 'MoonBit', algorithm: 'Park–Miller 16807 / Schrage',
      plan, planCanonical, synthetic: true,
    },
  });
}
export function toCsv(headers, rows, safe = false) {
  const cell = value => {
    let s = value == null ? '' : String(value);
    if (safe && /^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function importDataset(store, { name, content, contentBase64, format = 'csv' }) {
  text(name, '文件名', 200);
  if (format === 'xlsx') {
    if (typeof contentBase64 !== 'string' || !contentBase64) throw new AppError('XLSX 需要以 Base64 上传');
    let buffer;
    try { buffer = Buffer.from(contentBase64, 'base64'); } catch { throw new AppError('XLSX Base64 无效'); }
    if (!buffer.length || buffer.byteLength > 10 * 1024 * 1024) throw new AppError('单份数据最大 10 MiB');
    const { sheetName, headers, rows } = parseXlsx(buffer);
    const records = rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
    const csv = toCsv(headers, rows);
    return store.add({
      name, csv, sourceText: buffer, sourceFormat: 'xlsx', records, synthetic: false,
      provenance: { imported: true, note: `从 Excel 工作表“${sheetName}”导入；仅第一个工作表，合并单元格与公式结果以文件存盘值为准`, sheetName },
    });
  }
  let textContent = content;
  if (typeof contentBase64 === 'string' && contentBase64 && (textContent === undefined || textContent === null)) {
    textContent = decodeUtf8(Buffer.from(contentBase64, 'base64'), 'CSV / JSON');
  }
  if (typeof textContent !== 'string' || Buffer.byteLength(textContent) > 10 * 1024 * 1024) throw new AppError('单份数据最大 10 MiB');
  if (format === 'csv') {
    if (textContent.includes('\uFFFD')) throw new AppError('CSV 含无法识别的字符。请另存为 UTF-8，或直接上传 .xlsx');
    const parsed = parseCsv(textContent), marker = parsed.headers.indexOf('_synthetic');
    const synthetic = marker >= 0 && parsed.rows.length > 0 && parsed.rows.every(r => r[marker] === 'true');
    return store.add({ name, csv: textContent, synthetic, provenance: synthetic ? { imported: true, note: '来源文件声明为合成数据，生成过程未经验证' } : null });
  }
  if (!['json', 'jsonl'].includes(format)) throw new AppError('支持 CSV、JSON、JSONL、XLSX');
  let records, importedProvenance = null;
  try {
    const clean = textContent.replace(/^\uFEFF/, '');
    const parsed = format === 'jsonl' ? clean.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s)) : JSON.parse(clean);
    records = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(parsed) && parsed?.provenance) importedProvenance = { imported: true, note: '来源文件声称的生成信息，未经验证', claimed: parsed.provenance };
  } catch { throw new AppError('JSON / JSONL 解析失败'); }
  if (!Array.isArray(records) || !records.length || records.length > 100000) throw new AppError('需要 1–100000 行对象数组');
  const headers = [], seen = new Set();
  for (const r of records) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new AppError('每行必须是扁平对象');
    for (const [k, v] of Object.entries(r)) {
      if (!k.trim() || k.length > 200 || (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) || (typeof v === 'number' && !Number.isFinite(v))) throw new AppError('字段仅支持文本、有限数值、布尔值或 null，不支持嵌套');
      if (!seen.has(k)) { headers.push(k); seen.add(k); }
      if (headers.length > 128) throw new AppError('字段不能超过 128 个');
    }
  }
  const rows = records.map(r => headers.map(h => Object.hasOwn(r, h) ? r[h] : null));
  const synthetic = records.every(r => r._synthetic === true || r._synthetic === 'true');
  if (synthetic && !importedProvenance) importedProvenance = { imported: true, note: '来源文件声明为合成数据，生成过程未经验证' };
  return store.add({ name, csv: toCsv(headers, rows), sourceText: textContent, sourceFormat: format, records, synthetic, provenance: importedProvenance });
}
export function profile(store, id) {
  const d = store.get(id);
  const columns = d.columns.map((c, i) => {
    const values = d.rows.map(r => r[i]).filter(v => v.trim());
    const counts = new Map(); for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    const mixed = c.numeric > 0 && c.invalid > 0;
    const type = c.numeric && c.invalid === 0 ? 'number' : values.length && values.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v) ? 'date' : values.length && values.every(v => /^(true|false)$/i.test(v)) ? 'boolean' : mixed ? 'mixed' : 'text';
    let summary = null, warning = null;
    if (c.numeric) { try { summary = summarize(d.numericColumns[i].filter(v => v !== null)); } catch { warning = '数值范围过大，统计无法可靠计算'; } }
    const hints = qualityNotesFromColumns([c], d.rows.length);
    return { ...c, type, mixed, hints, distinct: counts.size, top: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count })), summary, warning };
  });
  const qualityNotes = Array.isArray(d.qualityNotes) && d.qualityNotes.length
    ? d.qualityNotes
    : qualityNotesFromColumns(d.columns, d.rows.length);
  const result = {
    id: d.id, name: d.name, sha256: d.sha256, synthetic: d.synthetic, sourceFormat: d.sourceFormat, provenance: d.provenance,
    rowCount: d.rows.length, columns, qualityNotes,
    missingCells: columns.reduce((s, c) => s + c.missing, 0),
    invalidCells: columns.reduce((s, c) => s + (c.name === '_synthetic' ? 0 : c.invalid), 0),
    preview: d.rows.slice(0, 12),
  };
  result.recommendation = recommendPlot(result);
  return result;
}
function column(d, name) { const i = d.headers.indexOf(name); if (i < 0) throw new AppError(`字段不存在：${String(name).slice(0, 100)}`); return i; }
function plotted(points, limit = 1500) {
  if (points.length <= limit) return points;
  return Array.from({ length: limit }, (_, i) => points[Math.floor(i * (points.length - 1) / (limit - 1))]);
}
export function explore(store, input) {
  if (!input || typeof input !== 'object') throw new AppError('无效分析请求');
  const d = store.get(input.datasetId), mode = input.mode ?? 'overview';
  const p = profile(store, d.id), warnings = ['描述统计与相关关系不证明因果。空白视为缺失；数值分析排除非数值单元格。'];
  const result = { contract: 'moondata.explore/1', engine: 'MoonBit', dataset: { id: d.id, name: d.name, sha256: d.sha256, synthetic: d.synthetic, rowCount: d.rows.length }, query: { datasetId: d.id, mode }, profile: p, excludedRows: 0, warnings, chart: null, table: [] };
  if (d.synthetic) warnings.push('此数据集为合成数据，不代表真实业务或测量结果。');
  for (const note of p.qualityNotes ?? []) warnings.push(note);
  if (mode === 'plot') { const plot = makePlot(d, p, input); return { ...result, ...plot, warnings: [...warnings, ...plot.warnings] }; }
  if (mode === 'overview') {
    result.table = p.columns.map(c => ({
      field: c.name, type: c.type, missing: c.missing, invalid: c.invalid, numeric: c.numeric,
      distinct: c.distinct, mean: c.summary?.mean ?? null, hint: c.hints?.[0] ?? '',
    }));
    return result;
  }
  if (mode === 'group') {
    const g = column(d, input.group), reducer = input.reducer ?? 'count';
    if (!['count', 'sum', 'mean', 'min', 'max'].includes(reducer)) throw new AppError('不支持的聚合方式');
    const v = reducer === 'count' ? -1 : column(d, input.value);
    result.query = { ...result.query, group: input.group, reducer, ...(v >= 0 ? { value: input.value } : {}) };
    result.table = aggregate(d.rows.map(r => r[g].trim() ? r[g] : ''), v < 0 ? d.rows.map(() => null) : d.numericColumns[v], reducer);
    result.excludedRows = v < 0 ? 0 : d.numericColumns[v].filter(x => x === null).length;
    const sorted = [...result.table].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    result.chart = { kind: 'bar', xLabel: input.group, yLabel: reducer === 'count' ? '行数' : `${input.value} · ${reducer}`, points: sorted.slice(0, 50).map(r => ({ x: r.group === '' ? '（缺失）' : r.group, y: r.value })) };
    warnings.push('计数包括组内全部行；其他聚合只使用有效数值。缺失分组值归入单独空白组。');
    if (sorted.length > 50) warnings.push('图仅显示聚合值最大的 50 组；报告表保留全部组。');
  } else if (mode === 'distribution') {
    const v = column(d, input.value), bins = integer(input.bins ?? 10, 1, 50, '分箱数');
    const values = d.numericColumns[v].filter(v => v !== null);
    if (!values.length) throw new AppError('所选字段没有可计算的数值');
    result.query = { ...result.query, value: input.value, bins }; result.statistics = distribution(values, bins);
    result.table = result.statistics.buckets;
    result.chart = { kind: 'bar', xLabel: input.value, yLabel: '频数', points: result.table.map(b => ({ x: `${fmt(b.lower)}–${fmt(b.upper)}`, y: b.count })) };
    result.excludedRows = d.rows.length - values.length; warnings.push('等宽分箱，左闭右开，最后一箱包含最大值；四分位数采用 (N−1)p 线性插值。');
  } else if (['scatter', 'line'].includes(mode)) {
    const x = column(d, input.x), y = column(d, input.y), points = [];
    for (let i = 0; i < d.rows.length; i++) {
      const xv = mode === 'scatter' ? d.numericColumns[x][i] : d.rows[i][x];
      const yv = d.numericColumns[y][i];
      if (xv === null || xv === '' || (typeof xv === 'string' && !xv.trim()) || yv === null) continue;
      points.push({ x: xv, y: yv, row: i + 1 });
    }
    if (points.length < (mode === 'scatter' ? 2 : 1)) throw new AppError('有效配对数不足');
    result.query = { ...result.query, x: input.x, y: input.y };
    if (mode === 'scatter') result.statistics = correlation(points.map(p => p.x), points.map(p => p.y));
    result.excludedRows = d.rows.length - points.length;
    result.chart = { kind: mode, xLabel: input.x, yLabel: input.y, totalPoints: points.length, points: plotted(points) };
    result.table = result.chart.points;
    if (mode === 'line') warnings.push('兼容模式：折线按原始行顺序连接，横轴等间距，不是真实时间/数值间隔。日期或数值趋势请使用自由画图（mode=plot）。');
    if (points.length > 1500) warnings.push(`图和报告点表最多等距抽取 1500 点（已截断 ${points.length - 1500}）；统计使用全部有效配对，完整数据请另行下载。`);
    if (mode === 'scatter' && result.statistics.pearson === null) warnings.push('常数列的 Pearson 相关系数不可用。');
  } else throw new AppError('未知分析模式');
  return result;
}
export function fmt(v) { return v === null || v === undefined ? '不可用' : typeof v === 'number' ? Number(v.toPrecision(7)).toString() : String(v); }
export function dataReport(store, query) {
  const result = explore(store, query);
  const clean = v => fmt(v).replace(/[\\`*_[\]{}()!#]/g, '\\$&').replaceAll('|', '\\|').replace(/[\r\n]/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const headers = Object.keys(result.table[0] ?? {});
  const md = [`# MoonData Lab 数据报告`, '', `来源：${clean(result.dataset.name)}`, ``, `SHA-256：${result.dataset.sha256}`, '', `数据性质：${result.dataset.synthetic ? '合成数据，不代表实测' : '用户导入；真实性未验证'}`, '', `计算核心：MoonBit；契约：${result.contract}`, '', `查询：${clean(JSON.stringify(result.query))}`, '', `总行数：${result.dataset.rowCount}；排除行数：${result.excludedRows}`, '', ...(result.statistics ? [`统计结果：${clean(JSON.stringify(result.statistics))}`, ''] : []), ...result.warnings.map(w => `- ${w}`), '', `| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...result.table.map(r => `| ${headers.map(h => clean(r[h])).join(' | ')} |`)].join('\n');
  return { result, markdown: md, json: JSON.stringify(result, null, 2) };
}
export function downloadDataset(store, id, format) {
  const d = store.get(id);
  // CSV source values remain strings: never infer types for IDs or leading zeros.
  const records = d.records ?? d.rows.map(row => Object.fromEntries(d.headers.map((h, i) => [h, row[i]])));
  if (format === 'csv') return { content: toCsv(d.headers, d.rows), type: 'text/csv; charset=utf-8' };
  if (format === 'json') return { content: JSON.stringify({ synthetic: d.synthetic, sourceSha256: d.sha256, provenance: d.provenance, records }, null, 2), type: 'application/json; charset=utf-8' };
  if (format === 'jsonl') return { content: records.map(r => JSON.stringify(r)).join('\n') + '\n', type: 'application/x-ndjson; charset=utf-8' };
  throw new AppError('不支持的导出格式');
}
