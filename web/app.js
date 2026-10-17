import { drawChart, exportSvg } from './chart.js';

const $ = id => document.getElementById(id);
const state = { datasets: [], configs: new Map(), primary: '', secondary: '', comparing: false, results: [], history: [], status: null, busy: false, controller: null, operation: 0 };
const fields = { timeColumn: 'time-column', valueColumn: 'value-column', timeUnit: 'time-unit', valueUnit: 'value-unit', initial: 'initial', target: 'target', stepTime: 'step-time', bandPercent: 'band-percent', tailPercent: 'tail-percent', rangeStart: 'range-start', rangeEnd: 'range-end' };
const numberFields = new Set(['initial', 'target', 'stepTime', 'bandPercent', 'tailPercent', 'rangeStart', 'rangeEnd']);
const metricDefs = [
  ['超调量', 'overshoot_percent', '%', '峰值相对阶跃幅值'],
  ['上升时间', 'rise_time', 's', '首次穿越 10% → 90%'],
  ['调节时间', 'settling_time', 's', '观察窗内进入误差带'],
  ['末段误差', 'steady_error', '', '目标值减末段平均值'],
];
function node(tag, className, content) { const n = document.createElement(tag); if (className) n.className = className; if (content !== undefined) n.textContent = content; return n; }
function format(value, digits = 3) { if (value == null) return '未观察到'; if (Math.abs(value) < 0.00001 && value !== 0) return value.toExponential(2); return Number(value.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits }); }
function notify(message, error = false) { $('notice').hidden = false; $('notice').className = `notice${error ? ' error' : ''}`; $('notice').textContent = message; }
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
async function api(path, data, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? (data === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1' },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: options.signal,
  });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || `请求失败 ${response.status}`); }
  return options.raw ? response.text() : response.json();
}
function defaultConfig(d) {
  return { datasetId: d.id, timeColumn: d.suggestedTime, valueColumn: d.suggestedValue,
    timeUnit: /(?:_|\[|\()ms(?:\]|\))?$/i.test(d.suggestedTime) ? 'ms' : /(?:_|\[|\()us(?:\]|\))?$/i.test(d.suggestedTime) ? 'us' : 's',
    valueUnit: /rpm/i.test(d.suggestedValue) ? 'rpm' : '',
    initial: d.synthetic ? 0 : '', target: d.synthetic ? 1000 : '', stepTime: d.synthetic ? .5 : 0,
    bandPercent: 2, tailPercent: 10, rangeStart: null, rangeEnd: null };
}
function readForm() {
  if (!state.primary) return;
  const c = state.configs.get(state.primary);
  for (const [key, id] of Object.entries(fields)) {
    const value = $(id).value;
    c[key] = numberFields.has(key) ? (value === '' ? (key.startsWith('range') ? null : '') : Number(value)) : value;
  }
}
function writeForm() {
  const d = state.datasets.find(d => d.id === state.primary);
  $('config-fields').disabled = !d || state.busy;
  if (!d) return;
  const config = state.configs.get(d.id);
  for (const id of ['time-column', 'value-column']) {
    $(id).replaceChildren(...d.columns.map(c => { const option = node('option', '', `${c.name}${c.invalid || c.missing ? ' · 含无效/缺失' : ''}`); option.value = c.name; return option; }));
  }
  for (const [key, id] of Object.entries(fields)) $(id).value = config[key] ?? '';
}
function selections() {
  readForm();
  const ids = state.comparing ? [state.primary, state.secondary] : [state.primary];
  if (ids.some(id => !id)) throw new Error('请先导入并选择实验');
  return ids.map(id => {
    const c = state.configs.get(id);
    if (!c || ['initial', 'target', 'stepTime', 'bandPercent', 'tailPercent'].some(k => typeof c[k] !== 'number' || !Number.isFinite(c[k]))) throw new Error(`请先为 ${state.datasets.find(d => d.id === id)?.name || '实验'} 确认初始值、目标值与分析参数`);
    return { ...c };
  });
}
function clearResults(message) {
  if (state.history.length) addMessage('assistant', '分析条件已变更。上方对话属于先前条件，后续问题将使用新的选择与参数。');
  state.results = []; state.history = [];
  $('evidence-card').hidden = true; $('svg-button').disabled = true;
  renderMetrics([]);
  $('chart').replaceChildren(node('div', 'chart-empty', message || '参数已更新，请重新计算并绘图。'));
  $('chart-description').textContent = '当前设置尚未生成分析结果。';
  $('sample-count').textContent = '等待重新计算';
}
function datasetOptions(select, datasets, value) {
  select.replaceChildren(...datasets.map(d => { const option = node('option', '', d.name); option.value = d.id; return option; }));
  if (!datasets.length) { const option = node('option', '', '请先导入数据'); option.value = ''; select.append(option); }
  select.value = value; select.disabled = !datasets.length || state.busy;
}
function renderDatasets() {
  $('dataset-count').textContent = state.datasets.length;
  const list = $('dataset-list'); list.replaceChildren();
  for (const d of state.datasets) {
    const item = node('div', `dataset-item${d.id === state.primary ? ' selected' : ''}`);
    const pick = node('button', 'dataset-pick'); pick.disabled = state.busy; pick.title = d.name;
    pick.append(node('span', 'dataset-icon', '▤'));
    const info = node('span'); info.append(node('span', 'dataset-name', d.name), node('span', 'dataset-info', `${d.rowCount.toLocaleString()} 行 · ${d.synthetic ? '合成示例' : '已导入'}`)); pick.append(info);
    pick.addEventListener('click', () => selectPrimary(d.id));
    const remove = node('button', 'dataset-delete', '×'); remove.disabled = state.busy; remove.setAttribute('aria-label', `删除 ${d.name}`);
    remove.dataset.id = d.id;
    remove.addEventListener('click', async () => {
      try {
        await api(`/api/datasets/${d.id}`, undefined, { method: 'DELETE' });
        state.datasets = state.datasets.filter(x => x.id !== d.id); state.configs.delete(d.id);
        if (state.primary === d.id) state.primary = state.datasets[0]?.id || '';
        if (state.secondary === d.id || state.secondary === state.primary) state.secondary = state.datasets.find(x => x.id !== state.primary)?.id || '';
        state.comparing = state.comparing && !!state.secondary;
        clearResults('数据已移除，请选择实验后重新分析。'); renderDatasets(); writeForm(); toast('已从当前会话移除数据');
      } catch (e) { notify(e.message, true); }
    });
    item.append(pick, remove); list.append(item);
  }
  if (!state.datasets.length) list.append(node('div', 'sidebar-empty', '把实验放在这里。\n每份数据，都有自己的依据。'));
  datasetOptions($('primary-dataset'), state.datasets, state.primary);
  const others = state.datasets.filter(d => d.id !== state.primary);
  if (!others.some(d => d.id === state.secondary)) state.secondary = others[0]?.id || '';
  datasetOptions($('secondary-dataset'), others, state.secondary);
  $('secondary-dataset').hidden = !state.comparing;
  $('compare-toggle').checked = state.comparing;
  $('compare-toggle').disabled = state.datasets.length < 2 || state.busy;
  $('mobile-remove').disabled = !state.primary || state.busy;
  $('source-type').textContent = state.datasets.find(d => d.id === state.primary)?.synthetic ? '合成示例' : state.primary ? '用户数据' : '等待数据';
  $('question').disabled = !state.primary || state.busy;
  $('send-button').disabled = !state.primary || state.busy;
  for (const id of ['upload-button', 'demo-button', 'sidebar-upload', 'add-data']) $(id).disabled = state.busy;
}
function selectPrimary(id) {
  if (state.busy || id === state.primary) return;
  readForm(); state.primary = id;
  if (state.secondary === id) state.secondary = state.datasets.find(d => d.id !== id)?.id || '';
  clearResults(); renderDatasets(); writeForm();
}
function renderMetrics(results) {
  $('metrics').replaceChildren(...metricDefs.map(([label, key, unit, explanation]) => {
    const card = node('div', 'metric'); card.append(node('span', '', label));
    const first = results[0]?.metrics[key];
    const value = node('strong', '', results.length ? first == null ? '—' : format(first, key === 'overshoot_percent' ? 2 : 3) : '—');
    value.append(node('small', '', key === 'steady_error' ? results[0]?.selection.valueUnit || '' : unit)); card.append(value);
    card.append(node('p', results.length > 1 ? 'comparison-value' : '', results.length > 1 ? `对比：${format(results[1].metrics[key])} ${key === 'steady_error' ? results[1].selection.valueUnit : unit}` : results.length && first == null ? '当前观察窗内不可用' : explanation));
    return card;
  }));
}
function renderEvidence(results, warnings) {
  const container = $('evidence'); container.replaceChildren();
  const wrapper = node('div', 'evidence-table-wrap'); const table = node('table', 'evidence-table');
  const head = node('thead'); const tr = node('tr'); tr.append(node('th', '', '指标 / 定义')); for (const r of results) tr.append(node('th', '', r.dataset.name)); head.append(tr); table.append(head);
  const body = node('tbody');
  const rows = [...metricDefs.map(([name, key, unit]) => [name, r => `${format(r.metrics[key])}${r.metrics[key] == null ? '' : ` ${key === 'steady_error' ? r.selection.valueUnit : unit}`}`]),
    ['末段均值', r => `${format(r.metrics.tail_mean)} ${r.selection.valueUnit}`], ['绝对误差积分 IAE', r => `${format(r.metrics.iae)} ${r.selection.valueUnit || '响应单位'}·s`],
    ['原始分析样本', r => r.summary.count.toLocaleString()], ['调节误差带', r => `±${r.selection.bandPercent}%（幅值）`],
    ['初始值 → 目标值', r => `${format(r.selection.initial)} → ${format(r.selection.target)} ${r.selection.valueUnit}`], ['阶跃时刻', r => `${format(r.selection.stepTime)} s`],
    ['末段窗口', r => `末 ${r.selection.tailPercent}% 时长 · ${r.metrics.tail_samples} 样本`]];
  for (const [label, getter] of rows) { const row = node('tr'); row.append(node('td', '', label)); for (const r of results) row.append(node('td', '', getter(r))); body.append(row); }
  table.append(body); wrapper.append(table); container.append(wrapper);
  const provenance = node('div', 'provenance');
  for (const r of results) {
    provenance.append(node('p', '', `${r.dataset.name} · ${r.dataset.synthetic ? '合成数据，非实测' : '用户上传'} · ${r.selection.timeColumn} / ${r.selection.valueColumn} · 时间 ${r.selection.timeUnit} → s`));
    const p = node('p', '', 'SHA-256 '); p.append(node('code', '', r.dataset.sha256)); provenance.append(p);
    for (const warning of r.metrics.warnings) provenance.append(node('p', 'warning', `${r.dataset.name}：${translateWarning(warning)}`));
  }
  for (const warning of warnings) provenance.append(node('p', 'warning', warning));
  provenance.append(node('p', '', '调节时间仅描述观察窗；末段误差为窗口估计。指标使用原始样本，图表可能降采样。'));
  container.append(provenance);
  const d = state.datasets.find(d => d.id === results[0].dataset.id);
  if (d) {
    const details = node('details', 'preview-details'); details.append(node('summary', '', `查看输入预览与列质量 · ${d.rowCount.toLocaleString()} 行`));
    const scroll = node('div', 'evidence-table-wrap'), preview = node('table'), header = node('tr');
    for (const c of d.columns) header.append(node('th', '', `${c.name} · 缺失 ${c.missing} / 无效 ${c.invalid}`)); preview.append(header);
    for (const row of d.preview) { const tr = node('tr'); for (const cell of row) tr.append(node('td', '', cell)); preview.append(tr); }
    scroll.append(preview); details.append(scroll); container.append(details);
  }
  $('evidence-card').hidden = false;
}
function translateWarning(text) {
  if (text.startsWith('10–90%')) return '10–90% 上升过程未完整观察到，无法给出上升时间。';
  if (text.startsWith('Settling')) return '未观察到至少两个末尾带内样本，无法确认调节时间。';
  if (text.startsWith('Tail mean')) return '末段少于三个样本，均值估计较弱。'; return text;
}
function showResult(result) {
  const results = result.results ?? [result];
  if (!results[0]?.metrics) return;
  state.results = results; renderMetrics(results); drawChart($('chart'), results);
  $('chart-description').textContent = `${results[0].selection.valueColumn} · 相对阶跃对齐 · 阴影为调节误差带`;
  $('sample-count').textContent = `${results.map(r => r.summary.count.toLocaleString()).join(' / ')} 个原始样本${results.some(r => r.chart.sampled) ? ' · 曲线已降采样' : ''}`;
  const legend = $('chart-legend'); legend.replaceChildren();
  results.forEach((r, i) => { const span = node('span'); span.append(node('i', `legend-line${i ? ' second' : ''}`), document.createTextNode(r.dataset.name)); legend.append(span); });
  const target = node('span'); target.append(node('i', 'legend-line target'), document.createTextNode('目标值')); legend.append(target);
  $('svg-button').disabled = false; renderEvidence(results, result.warnings ?? []);
}
function setBusy(busy) {
  state.busy = busy; renderDatasets(); $('config-fields').disabled = !state.primary || busy;
  $('stop-button').hidden = !busy || !state.controller;
  for (const id of ['svg-button', 'report-button', 'json-button', 'csv-button']) $(id).disabled = busy || !state.results.length;
}
async function calculate() {
  if (state.busy) return;
  try {
    if (!$('analysis-form').reportValidity()) return;
    const chosen = selections(); setBusy(true);
    const response = chosen.length === 2 ? await api('/api/compare', { selections: chosen }) : await api('/api/analyze', chosen[0]);
    showResult(response.result); $('notice').hidden = true;
  } catch (e) { clearResults('本次分析未完成，请检查参数或输入数据。'); notify(e.message, true); }
  finally { setBusy(false); }
}
async function demo() {
  if (state.busy) return;
  try {
    readForm(); state.history = []; setBusy(true); const data = await api('/api/demo', {});
    state.datasets.push(...data.datasets); for (const d of data.datasets) state.configs.set(d.id, defaultConfig(d));
    state.primary = data.datasets[0].id; state.secondary = data.datasets[1].id; state.comparing = true;
    renderDatasets(); writeForm();
    const result = await api('/api/compare', { selections: data.datasets.map(d => state.configs.get(d.id)) });
    showResult(result.result);
    notify('已载入两组二阶系统合成响应。示例参数：0 → 1000 rpm，阶跃发生在 0.5 s；这些数据不代表实测。');
  } catch (e) { notify(e.message, true); }
  finally { setBusy(false); }
}
async function upload(files) {
  if (state.busy || !files.length) return;
  let added = 0;
  try {
    readForm(); setBusy(true);
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('请导入 .csv 文件');
      if (file.size > 10 * 1024 * 1024) throw new Error('单个 CSV 不能超过 10 MiB');
      const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
      const { dataset } = await api('/api/datasets', { name: file.name, csv: decoded });
      state.datasets.push(dataset); state.configs.set(dataset.id, defaultConfig(dataset));
      state.primary = dataset.id; state.comparing = false; added++;
    }
    notify(`已导入 ${added} 份数据。请确认列、时间单位、阶跃初始值与目标值，然后计算或提问。`);
  } catch (e) { notify(`${added ? `已导入 ${added} 份；` : ''}${e instanceof TypeError ? '文件不是有效 UTF-8 文本，请转换编码后再导入' : e.message}`, true); }
  finally {
    if (added) clearResults('数据已准备好，请确认分析参数。');
    setBusy(false); renderDatasets(); writeForm(); $('file-input').value = '';
  }
}
function addMessage(role, content, error = false) {
  const message = node('div', `message ${role === 'user' ? 'user' : 'assistant-message'}${error ? ' error' : ''}`);
  if (role !== 'user') message.append(node('span', 'message-label', state.status?.model.mode === 'model' ? '实验助手 · 模型解释' : '实验助手 · 内置分析'));
  message.append(document.createTextNode(content)); $('chat-messages').append(message); message.scrollIntoView({ block: 'nearest' });
}
function addTrace(trace) {
  if (!trace.length) return;
  const details = node('details', 'tool-trace'); details.append(node('summary', '', `调用 ${trace.length} 个分析工具 · ${trace.filter(t => t.ok).length} 个成功`));
  for (const entry of trace) { const item = node('div', 'trace-item'); item.append(node('div', '', `${entry.ok ? '✓' : '×'} ${entry.tool} · ${entry.elapsedMs} ms`), node('pre', '', JSON.stringify({ args: entry.args, result: entry.result }, null, 2))); details.append(item); }
  $('chat-messages').append(details);
}
async function ask(prompt) {
  if (state.busy) return;
  const message = (prompt ?? $('question').value).trim(); if (!message) return;
  let pending;
  try {
    const chosen = selections();
    if (state.status?.model.mode === 'unavailable') throw new Error(state.status.model.error);
    if (state.comparing === false && /两组|两份|比较|对比/.test(message) && state.datasets.length > 1) throw new Error('请先勾选“对比实验”，选择另一份数据并确认两份实验的参数。');
    addMessage('user', message); $('question').value = '';
    const operation = ++state.operation; state.controller = new AbortController(); setBusy(true);
    pending = node('p', 'pending-message', state.status?.model.mode === 'model' ? '正在调用模型与分析工具…' : '正在运行内置分析工具…'); $('chat-messages').append(pending);
    const result = await api('/api/chat', { selections: chosen, message, history: state.history.slice(-10) }, { signal: state.controller.signal });
    if (operation !== state.operation) return;
    pending.remove(); addTrace(result.trace);
    const computed = result.artifacts.filter(a => a.metrics || a.results);
    const comparison = computed.findLast(a => a.results);
    if (comparison) showResult(comparison);
    else if (computed.length) {
      const latest = new Map(computed.map(a => [a.dataset.id, a]));
      const results = chosen.map(c => latest.get(c.datasetId)).filter(Boolean);
      showResult({ results, warnings: results.length === 2 && (results[0].selection.target !== results[1].selection.target || results[0].selection.initial !== results[1].selection.initial) ? ['初始值或目标值不同，比较时请注意工况差异。'] : [] });
    }
    addMessage('assistant', result.answer + (result.caveat ? `\n\n${result.caveat}` : ''));
    state.history.push({ role: 'user', content: message }, { role: 'assistant', content: result.answer.slice(0, 6000) });
    state.history = state.history.slice(-10);
  } catch (e) {
    pending?.remove();
    if (e.name === 'AbortError') addMessage('assistant', '已停止本次请求。已完成的结果保留，未完成的分析不会被标记为成功。');
    else { addMessage('assistant', e.message, true); notify(e.message, true); }
  } finally { state.controller = null; setBusy(false); }
}
function download(content, filename, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`已导出 ${filename}`);
}
async function exportReport(kind) {
  try { const report = await api('/api/report', { selections: state.results.map(r => r.selection) }); download(kind === 'json' ? JSON.stringify(report.json, null, 2) : report.markdown, `moonmotor-report.${kind}`, kind === 'json' ? 'application/json' : 'text/markdown;charset=utf-8'); }
  catch (e) { notify(e.message, true); }
}
function renderStatus() {
  const model = state.status?.model;
  if (model?.mode === 'model') {
    $('model-label').textContent = `模型 · ${model.model}`; $('model-dot').classList.add('connected');
    $('composer-mode').textContent = '模型分析 · 有工具调用限制';
    $('data-policy').textContent = `提问会将所选实验的元数据、摘要和工具结果发送至 ${model.origin}，不发送原始 CSV。`;
  } else {
    $('model-label').textContent = model?.mode === 'unavailable' ? '模型配置异常' : '内置分析模式 · 未连接模型';
    $('composer-mode').textContent = '内置分析 · 无外部发送';
    $('data-policy').textContent = '原始数据保留在本机。配置模型后可启用自然语言工具调用。';
  }
}

$('analysis-form').addEventListener('submit', event => { event.preventDefault(); calculate(); });
$('chat-form').addEventListener('submit', event => { event.preventDefault(); ask(); });
$('question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ask(); } });
for (const id of Object.values(fields)) $(id).addEventListener('input', () => {
  if (!state.busy) {
    if (id === 'value-column') {
      $('initial').value = ''; $('target').value = ''; $('value-unit').value = '';
      notify('响应列已更改，请重新确认响应单位、阶跃初始值和目标值。');
    }
    readForm(); clearResults();
  }
});
$('primary-dataset').addEventListener('change', event => selectPrimary(event.target.value));
$('secondary-dataset').addEventListener('change', event => { state.secondary = event.target.value; clearResults(); });
$('compare-toggle').addEventListener('change', event => { state.comparing = event.target.checked; clearResults(); renderDatasets(); });
for (const id of ['upload-button', 'sidebar-upload', 'add-data']) $(id).addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => upload([...event.target.files]));
for (const id of ['demo-button', 'empty-demo']) $(id).addEventListener('click', demo);
for (const button of document.querySelectorAll('[data-prompt]')) button.addEventListener('click', () => ask(button.dataset.prompt));
$('stop-button').addEventListener('click', () => state.controller?.abort());
$('report-button').addEventListener('click', () => exportReport('md'));
$('json-button').addEventListener('click', () => exportReport('json'));
$('csv-button').addEventListener('click', async () => { try { download(await api('/api/export-csv', state.results[0].selection, { raw: true }), 'moonmotor-selection.csv', 'text/csv;charset=utf-8'); } catch (e) { notify(e.message, true); } });
$('svg-button').addEventListener('click', () => { const svg = exportSvg($('chart')); if (svg) download(svg, 'moonmotor-response.svg', 'image/svg+xml;charset=utf-8'); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal()); $('close-help').addEventListener('click', () => $('help-dialog').close());
$('mobile-help').addEventListener('click', () => $('help-dialog').showModal());
$('mobile-remove').addEventListener('click', () => [...document.querySelectorAll('.dataset-delete')].find(button => button.dataset.id === state.primary)?.click());
let dragCount = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dragCount++; document.body.classList.add('drag-active'); } });
document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', () => { dragCount = Math.max(0, dragCount - 1); if (!dragCount) document.body.classList.remove('drag-active'); });
document.addEventListener('drop', event => { if (event.dataTransfer?.files.length) { event.preventDefault(); dragCount = 0; document.body.classList.remove('drag-active'); upload([...event.dataTransfer.files]); } });
new ResizeObserver(() => { if (state.results.length) drawChart($('chart'), state.results); }).observe($('chart'));

try {
  state.status = await api('/api/status'); renderStatus();
  const data = await api('/api/datasets'); state.datasets = data.datasets;
  for (const d of state.datasets) state.configs.set(d.id, defaultConfig(d));
  state.primary = state.datasets[0]?.id || ''; renderDatasets(); writeForm();
} catch (e) { notify(`服务连接失败：${e.message}`, true); $('model-label').textContent = '本机服务未连接'; }
