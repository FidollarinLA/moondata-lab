import { AppError, finite, step, summarize, text } from './core.mjs';

const timeFactors = { s: 1, ms: 0.001, us: 0.000001 };
function column(d, name) {
  const index = d.headers.indexOf(name);
  if (index < 0) throw new AppError(`找不到列：${name}`);
  return index;
}
export function normalizeSelection(store, input) {
  if (!input || typeof input !== 'object') throw new AppError('请先选择实验数据与信号');
  const d = store.get(input.datasetId);
  const timeColumn = text(input.timeColumn, '时间列');
  const valueColumn = text(input.valueColumn, '响应列');
  column(d, timeColumn); column(d, valueColumn);
  if (timeColumn === valueColumn) throw new AppError('时间列与响应列必须不同');
  const timeUnit = input.timeUnit ?? 's';
  if (!Object.hasOwn(timeFactors, timeUnit)) throw new AppError('时间单位只能是 s、ms 或 us');
  const valueUnit = typeof input.valueUnit === 'string' ? input.valueUnit.slice(0, 30) : '';
  const config = {
    target: finite(input.target, '目标值'), initial: finite(input.initial, '初始值'),
    step_time: finite(input.stepTime, '阶跃时刻', 0),
    band_percent: finite(input.bandPercent, '误差带', 2),
    tail_percent: finite(input.tailPercent, '末段窗口', 10),
  };
  const rangeStart = input.rangeStart == null ? null : finite(input.rangeStart, '区间起点');
  const rangeEnd = input.rangeEnd == null ? null : finite(input.rangeEnd, '区间终点');
  if (rangeStart !== null && rangeEnd !== null && rangeStart >= rangeEnd) throw new AppError('区间起点必须小于终点');
  return { datasetId: d.id, timeColumn, valueColumn, timeUnit, valueUnit,
    target: config.target, initial: config.initial, stepTime: config.step_time,
    bandPercent: config.band_percent, tailPercent: config.tail_percent, rangeStart, rangeEnd };
}
export function series(store, selection) {
  const d = store.get(selection.datasetId);
  const tc = column(d, selection.timeColumn), vc = column(d, selection.valueColumn);
  const factor = timeFactors[selection.timeUnit];
  const times = [], values = [];
  let excluded = 0;
  let previous = -Infinity;
  for (let i = 0; i < d.rows.length; i++) {
    const rawTime = d.numericColumns[tc][i];
    if (rawTime === null) throw new AppError(`第 ${i + 2} 行时间缺失或无效，无法可靠选择区间`);
    const t = rawTime * factor;
    if (!Number.isFinite(t) || t <= previous) throw new AppError(`第 ${i + 2} 行时间不严格递增；请修正重复或乱序时间`);
    previous = t;
    if ((selection.rangeStart !== null && t < selection.rangeStart) || (selection.rangeEnd !== null && t > selection.rangeEnd)) { excluded++; continue; }
    const value = d.numericColumns[vc][i];
    if (value === null) throw new AppError(`第 ${i + 2} 行响应值缺失或无效；分析不会把缺失值补为零`);
    times.push(t); values.push(value);
  }
  if (!times.length) throw new AppError('所选区间没有有效数据');
  return { d, times, values, excluded };
}
// Keep extrema in each display bucket; raw samples remain authoritative for metrics.
export function downsample(times, values, limit = 1800) {
  if (times.length <= limit) return times.map((t, i) => [t, values[i]]);
  const output = [[times[0], values[0]]];
  const width = Math.ceil((times.length - 2) / Math.floor((limit - 2) / 2));
  for (let start = 1; start < times.length - 1; start += width) {
    const end = Math.min(times.length - 1, start + width);
    let low = start, high = start;
    for (let i = start + 1; i < end; i++) {
      if (values[i] < values[low]) low = i;
      if (values[i] > values[high]) high = i;
    }
    for (const i of [...new Set([low, high])].sort((a, b) => a - b)) output.push([times[i], values[i]]);
  }
  output.push([times.at(-1), values.at(-1)]);
  return output;
}
export function analyze(store, input) {
  const selection = normalizeSelection(store, input);
  const { d, times, values, excluded } = series(store, selection);
  const summary = summarize(values);
  const metrics = step(times, values, {
    target: selection.target, initial: selection.initial, step_time: selection.stepTime,
    band_percent: selection.bandPercent, tail_percent: selection.tailPercent,
  });
  return {
    contract: 'moondata.step-response/1', engine: 'MoonBit',
    dataset: { id: d.id, name: d.name, sha256: d.sha256, synthetic: d.synthetic },
    selection, summary, metrics, excludedRows: excluded,
    chart: { points: downsample(times, values), rawSamples: times.length, sampled: times.length > 1800 },
    observation: { start: times[0], end: times.at(-1) },
  };
}
export function compare(store, selections) {
  if (!Array.isArray(selections) || selections.length !== 2) throw new AppError('请选择两份实验进行比较');
  const results = selections.map(s => analyze(store, s));
  const [a, b] = results;
  if (a.dataset.id === b.dataset.id) throw new AppError('请选择两份不同的实验');
  if (a.selection.valueUnit !== b.selection.valueUnit) throw new AppError('两份实验的响应单位必须一致');
  const warnings = [];
  if (a.selection.target !== b.selection.target || a.selection.initial !== b.selection.initial) warnings.push('两份实验的初始值或目标值不同，不能直接将指标差异归因于控制参数');
  if (!a.selection.valueUnit) warnings.push('响应单位尚未声明，请确认两份数据表示同一种物理量与单位');
  if (a.selection.bandPercent !== b.selection.bandPercent) warnings.push('两份实验的调节误差带不同，调节时间不能直接比较');
  if (a.selection.tailPercent !== b.selection.tailPercent) warnings.push('两份实验的末段窗口比例不同，末段均值和误差的观察条件不同');
  if (Math.abs(a.metrics.duration - b.metrics.duration) > 1e-9 * Math.max(1, a.metrics.duration, b.metrics.duration)) warnings.push('阶跃后的观察时长不同，IAE、末段误差和是否已调节会受窗口影响');
  return { contract: 'moondata.comparison/1', results,
    comparableStep: a.selection.target === b.selection.target && a.selection.initial === b.selection.initial,
    warnings,
  };
}

export function toolsFor(store, selections) {
  const selected = selections.map(s => normalizeSelection(store, s));
  const allowed = new Map(selected.map(s => [s.datasetId, s]));
  const definitions = [
    { name: 'inspect_experiments', description: '查看用户本次选择的实验元数据、列质量、摘要和已确认的分析参数。不会返回原始行。', parameters: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'analyze_experiment', description: '按用户界面已确认的时间列、响应列、单位和阶跃参数计算真实指标并生成曲线。不可自行更改参数。', parameters: { type: 'object', properties: { dataset_id: { type: 'string', enum: [...allowed.keys()] } }, required: ['dataset_id'], additionalProperties: false } },
    ...(selected.length === 2 ? [{ name: 'compare_experiments', description: '对用户选定的两份实验计算指标并比较，附带可比性限制。', parameters: { type: 'object', properties: {}, additionalProperties: false } }] : []),
  ].map(f => ({ type: 'function', function: f }));
  function execute(name, args) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new AppError('工具参数必须为 JSON 对象');
    const keys = Object.keys(args);
    if (name === 'inspect_experiments') {
      if (keys.length) throw new AppError('inspect_experiments 不接受参数');
      return { experiments: selected.map(s => ({ ...store.describe(store.get(s.datasetId)), preview: undefined, selection: s })) };
    }
    if (name === 'analyze_experiment') {
      if (keys.length !== 1 || keys[0] !== 'dataset_id' || !allowed.has(args.dataset_id)) throw new AppError('只能分析当前选中的实验');
      return analyze(store, allowed.get(args.dataset_id));
    }
    if (name === 'compare_experiments' && selected.length === 2) {
      if (keys.length) throw new AppError('compare_experiments 不接受参数');
      return compare(store, selected);
    }
    throw new AppError(`不支持的工具：${name}`);
  }
  return { definitions, execute, selected };
}

export function compactResult(result) {
  if (result.results) return { ...result, results: result.results.map(compactResult) };
  if (result.chart) { const { chart, ...rest } = result; return { ...rest, chart: { rawSamples: chart.rawSamples, rendered: true } }; }
  return result;
}
