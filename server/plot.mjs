import { AppError, aggregate, summarize, correlation } from './core.mjs';
const colors = ['#528e70', '#b18a4d', '#6b89b1', '#ad6a81', '#8c81ad', '#6ba3a1', '#a1935d', '#747f9d'];
const sample = points => points.length <= 1500 ? points : Array.from({ length: 1500 }, (_, i) => points[Math.floor(i * (points.length - 1) / 1499)]);
export function recommendPlot(p) {
  const numeric = p.columns.filter(c => c.numeric > 0 && c.name !== '_synthetic');
  const date = p.columns.find(c => c.type === 'date');
  const category = p.columns.filter(c => ['text', 'boolean'].includes(c.type) && c.name !== '_synthetic' && c.distinct > 0 && c.distinct <= 1000).sort((a, b) => a.distinct - b.distinct)[0];
  const x = date?.name ?? category?.name ?? numeric[0]?.name ?? p.columns[0]?.name;
  return { mode: 'plot', x, yColumns: numeric.filter(c => c.name !== x).slice(0, 2).map(c => c.name), kind: 'auto', reducer: 'mean' };
}
export function makePlot(d, p, input) {
  const xIndex = d.headers.indexOf(input.x);
  if (xIndex < 0) throw new AppError('请选择有效的横轴字段');
  const ys = input.yColumns ?? [];
  if (!Array.isArray(ys) || ys.length > 8 || new Set(ys).size !== ys.length || ys.some(y => typeof y !== 'string' || !d.headers.includes(y))) throw new AppError('纵轴应为最多 8 个不重复的字段');
  for (const y of ys) if (!p.columns[d.headers.indexOf(y)].numeric) throw new AppError(`纵轴“${y}”没有有效数值`);
  const requested = input.kind ?? 'auto';
  if (!['auto', 'line', 'scatter', 'bar'].includes(requested)) throw new AppError('支持自动推荐、折线、散点和柱状图');
  const type = p.columns[xIndex].type;
  const kind = requested === 'auto' ? !ys.length || !['number', 'date'].includes(type) ? 'bar' : type === 'date' ? 'line' : 'scatter' : requested;
  if (kind !== 'bar' && !ys.length) throw new AppError('折线和散点图至少需要一个数值纵轴');
  if (kind === 'scatter' && !['number', 'date'].includes(type)) throw new AppError('散点图横轴须为数值或日期；类别可使用柱状图或折线');
  const reducer = !ys.length ? 'count' : input.reducer ?? 'mean';
  if (!['sum', 'mean', 'min', 'max', 'count'].includes(reducer) || (ys.length && reducer === 'count')) throw new AppError('选择纵轴时使用总和、平均值、最小值或最大值；计数请清空纵轴');
  const xMode = kind === 'bar' ? 'category' : type === 'number' ? 'number' : type === 'date' ? 'date' : 'category';
  if (xMode === 'number' && p.columns[xIndex].warning) throw new AppError('横轴数值范围过大，无法可靠绘图；请调整数值尺度');
  const warnings = [], series = [], table = [], statistics = [];
  const names = ys.length ? ys : ['行数'];
  const validX = d.rows.map((r, i) => r[xIndex].trim() && (xMode !== 'number' || d.numericColumns[xIndex][i] !== null) ? i : -1).filter(i => i >= 0);
  if (!validX.length) throw new AppError('横轴没有有效值');
  let sharedGroups = null;
  for (let s = 0; s < names.length; s++) {
    const name = names[s], yIndex = d.headers.indexOf(name);
    let points, total, stat, excludedRows;
    if (kind === 'bar') {
      const all = aggregate(validX.map(i => d.rows[i][xIndex]), validX.map(i => ys.length ? d.numericColumns[yIndex][i] : null), reducer);
      if (!sharedGroups) sharedGroups = all.slice(0, 50).map(r => r.group);
      const mapping = new Map(all.map(r => [r.group, r]));
      points = sharedGroups.map(g => ({ x: g, y: mapping.get(g)?.value ?? null })); total = all.length;
      const validValues = ys.length ? validX.map(i => d.numericColumns[yIndex][i]).filter(v => v !== null) : [];
      excludedRows = d.rows.length - (ys.length ? validValues.length : validX.length);
      stat = validValues.length ? summarize(validValues) : null;
      for (const row of all) table.push({ series: name, ...row });
    } else {
      const full = [];
      for (const i of validX) {
        const y = d.numericColumns[yIndex][i]; if (y === null) continue;
        const rawX = d.rows[i][xIndex], x = xMode === 'number' ? d.numericColumns[xIndex][i] : xMode === 'date' ? Date.parse(rawX) : rawX;
        if (xMode === 'date' && !Number.isFinite(x)) continue;
        full.push({ x, xLabel: rawX, y, row: i + 1, order: i });
      }
      if (!full.length) throw new AppError(`“${name}”与横轴没有有效配对`);
      total = full.length; points = sample(full); excludedRows = d.rows.length - total;
      stat = { ...summarize(full.map(p => p.y)), ...(kind === 'scatter' && full.length >= 2 ? { pearson: correlation(full.map(p => p.x), full.map(p => p.y)).pearson } : {}) };
      for (const point of points) table.push({ series: name, ...point });
    }
    series.push({ name, color: colors[s], points, totalPoints: total, excludedRows }); statistics.push({ name, excludedRows, summary: stat });
  }
  if (kind === 'bar') warnings.push('同一横轴值分组；默认使用平均值，可切换总和、最小或最大。图按首次出现顺序显示前50组，表中保留全部组。');
  if (kind === 'line') warnings.push(xMode === 'category' ? '类别横轴按原始行顺序等间距连接，排除缺失对。' : '横轴使用实际数值或 UTC 日期间隔，按原始行顺序连接；不自动排序，排除缺失对。');
  warnings.push('每条序列分别排除缺失配对；统计使用全部有效值，图中每条序列最多1500点。');
  if (names.length > 1) warnings.push('多条序列共用纵轴，请确认数值尺度与单位适合直接比较。');
  const plotQuery = { datasetId: d.id, mode: 'plot', x: input.x, yColumns: ys, kind: requested, reducer };
  const operation = ({ mean: '平均值', sum: '总和', min: '最小值', max: '最大值', count: '行数' })[reducer];
  const yLabel = ys.length > 1 ? '数值（共用纵轴）' : names[0];
  return { query: plotQuery, chart: { kind, xMode, xLabel: input.x, yLabel: kind === 'bar' ? `${yLabel} · ${operation}` : yLabel, points: series[0].points, series, totalPoints: series.reduce((s, a) => s + a.totalPoints, 0) }, table, statistics: { series: statistics }, excludedRows: d.rows.length - validX.length, warnings };
}
