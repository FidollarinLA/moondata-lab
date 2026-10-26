import { drawChart } from './chart.js';
const $ = id => document.getElementById(id);
const state = { datasets: [], id: '', plan: null, templates: [], result: null, controller: null, revision: 0, planRevision: 0, history: [], querySource: 'analysis', recommendation: null };
const kinds = { text: '文本编号', sequence: '数值序列', integer: '随机整数', number: '随机小数', category: '类别', boolean: '是 / 否', date: '日期', linear: '线性关联' };
function el(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
const fmt = v => v === null || v === undefined ? '不可用' : typeof v === 'number' ? Number(v.toPrecision(7)).toLocaleString('zh-CN', { maximumFractionDigits: 7 }) : String(v);
function notice(message, error = false) { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; $('notice').hidden = false; }
async function api(path, data, signal) {
  const response = await fetch(`/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'X-Lab-Client': '1' }, body: data === undefined ? undefined : JSON.stringify(data), signal });
  if (!response.ok) { let msg; try { msg = (await response.json()).error; } catch {} throw new Error(msg || `请求失败：${response.status}`); }
  return response;
}
async function json(path, data, signal) { return (await api(path, data, signal)).json(); }
function switchTab(tab) {
  for (const t of ['generate', 'analyze']) { $(`${t}-panel`).hidden = t !== tab; $(`tab-${t}`).classList.toggle('active', t === tab); $(`tab-${t}`).setAttribute('aria-pressed', String(t === tab)); }
}
function invalidate() {
  state.revision++; state.result = null;
  for (const id of ['report-button', 'json-report-button', 'svg-button']) $(id).disabled = true;
  $('stale-label').hidden = false; $('chart-wrap').hidden = true; $('result-table').replaceChildren(); $('warnings').replaceChildren();
  $('chart-legend').replaceChildren();
}
function options(select, values, value) { select.replaceChildren(...values.map(v => { const o = el('option', typeof v === 'string' ? v : v.label); o.value = typeof v === 'string' ? v : v.value; return o; })); if (values.some(v => (typeof v === 'string' ? v : v.value) === value)) select.value = value; }
function setPlan(plan) {
  state.plan = structuredClone(plan); $('plan-name').value = plan.name ?? '自定义数据集'; $('rows').value = plan.rows ?? 300; $('seed').value = plan.seed ?? 42;
  for (const b of document.querySelectorAll('.template')) b.classList.toggle('active', b.dataset.template === plan.id);
  renderFields();
}
function renderFields() {
  state.planRevision++;
  $('field-editor').replaceChildren();
  state.plan.columns.forEach((c, i) => {
    const card = el('div', undefined, 'field'), top = el('div', undefined, 'field-top');
    const name = el('input'); name.value = c.name; name.maxLength = 100; name.setAttribute('aria-label', `字段 ${i + 1} 名称`); name.addEventListener('input', () => { c.name = name.value; });
    const kind = el('select'); kind.setAttribute('aria-label', `字段 ${i + 1} 类型`); options(kind, Object.entries(kinds).map(([value, label]) => ({ value, label })), c.kind);
    kind.addEventListener('change', () => { c.kind = kind.value; renderFields(); });
    const remove = el('button', '×', 'field-remove'); remove.setAttribute('aria-label', `删除字段 ${i + 1}`); remove.addEventListener('click', () => { state.plan.columns.splice(i, 1); renderFields(); });
    top.append(name, kind, remove); card.append(top);
    const params = el('div', undefined, 'field-params');
    function param(key, labelText, fallback, type = 'number') {
      const label = el('label', labelText), input = el('input'); input.type = type; input.setAttribute('aria-label', `字段 ${i + 1} ${labelText}`);
      input.value = key === 'choices' ? (c.choices ?? ['类别A', '类别B']).join('，') : key === 'startDate' ? c.startDate ?? (Number.isInteger(c.start_day) ? new Date(c.start_day * 86400000).toISOString().slice(0, 10) : fallback) : c[key] ?? fallback;
      if (c[key] === undefined) c[key] = type === 'number' ? Number(input.value) : key === 'choices' ? input.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) : input.value;
      if (type === 'number') input.step = 'any';
      input.addEventListener('input', () => { c[key] = type === 'number' ? Number(input.value) : key === 'choices' ? input.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) : input.value; });
      label.append(input); params.append(label);
    }
    if (['number', 'integer'].includes(c.kind)) { param('min', '最小值', 0); param('max', '最大值', 100); }
    if (['sequence', 'text'].includes(c.kind)) { param('start', '起始值', 1); param('step', '步长', 1); param('prefix', '前缀', '', 'text'); }
    if (c.kind === 'category') param('choices', '选项（逗号分隔）', '', 'text');
    if (c.kind === 'boolean') param('probability', '为是的概率', .5);
    if (c.kind === 'date') { param('startDate', '起始日期', '2026-01-01', 'date'); param('step', '间隔天数', 1); }
    if (c.kind === 'linear') { param('source', '前面数值字段的名称', '', 'text'); param('slope', '系数', 1); param('intercept', '常数项', 0); param('noise', '均匀噪声 ±', 0); }
    if (['number', 'linear'].includes(c.kind)) param('decimals', '小数位数', 2);
    param('missing', '缺失概率（0–0.8）', 0);
    card.append(params); $('field-editor').append(card);
  });
  $('add-field').disabled = state.plan.columns.length >= 32;
}
function query() {
  return { datasetId: state.id, mode: $('mode').value, group: $('group').value, value: $('value').value, reducer: $('reducer').value, bins: Number($('bins').value), x: $('x').value, y: $('y').value };
}
function plotQuery() { return { datasetId: state.id, mode: 'plot', x: $('plot-x').value, yColumns: [...document.querySelectorAll('#plot-ys input:checked')].map(c => c.value), kind: $('plot-kind').value, reducer: $('plot-reducer').value }; }
function currentQuery() { return state.querySource === 'plot' ? plotQuery() : query(); }
function applyPlotQuery(q) {
  $('plot-x').value = q.x; $('plot-kind').value = q.kind ?? 'auto'; $('plot-reducer').value = q.reducer === 'count' ? 'mean' : q.reducer ?? 'mean';
  for (const checkbox of document.querySelectorAll('#plot-ys input')) checkbox.checked = q.yColumns?.includes(checkbox.value) ?? false;
  state.querySource = 'plot';
}
async function plot() { if (!state.id) return; state.querySource = 'plot'; const revision = state.revision; const { result } = await json('explore', plotQuery()); if (revision === state.revision) showResult(result); }
function queryFields() {
  const m = $('mode').value;
  for (const field of ['group', 'value', 'reducer', 'bins', 'x', 'y']) {
    const visible = field === 'group' || field === 'reducer' ? m === 'group' : field === 'value' ? m === 'distribution' || (m === 'group' && $('reducer').value !== 'count') : field === 'bins' ? m === 'distribution' : ['scatter', 'line'].includes(m);
    $(`${field}-field`).hidden = !visible;
  }
}
function table(target, headers, rows) {
  const t = el('table'), head = el('thead'), tr = el('tr'); for (const h of headers) tr.append(el('th', h)); head.append(tr); t.append(head);
  const body = el('tbody'); for (const r of rows) { const row = el('tr'); for (const v of r) { const cell = el('td', fmt(v)); cell.title = fmt(v); row.append(cell); } body.append(row); } t.append(body); target.replaceChildren(t);
}
function showResult(result) {
  state.result = result; $('stale-label').hidden = true;
  state.querySource = result.query.mode === 'plot' ? 'plot' : 'analysis';
  for (const id of ['report-button', 'json-report-button']) $(id).disabled = false;
  $('svg-button').disabled = !result.chart; $('chart-wrap').hidden = !result.chart;
  drawChart($('chart'), result.chart);
  $('chart-legend').replaceChildren(...(result.chart?.series ?? []).map((s, i) => { const item = el('span', undefined, `legend-item series-${i}`); item.append(el('i'), document.createTextNode(s.name)); return item; }));
  $('statistics').textContent = result.statistics?.pearson !== undefined ? `Pearson r：${fmt(result.statistics.pearson)}　有效配对：${fmt(result.statistics.count)}` : result.statistics?.median !== undefined ? `中位数 ${fmt(result.statistics.median)}　Q1 ${fmt(result.statistics.q1)}　Q3 ${fmt(result.statistics.q3)}` : '';
  $('chart-caption').textContent = result.chart ? `${result.chart.totalPoints ? `显示 ${result.chart.points.length} / ${result.chart.totalPoints} 个有效点。` : ''}排除 ${result.excludedRows} 行。悬停查看点或柱的数值；报告保留计算依据。` : '';
  if (result.query.mode === 'plot') {
    $('statistics').textContent = result.statistics.series.map(s => `${s.name}：${s.skipped ? '无有效配对（已跳过）' : s.summary ? `N=${s.summary.count}，均值 ${fmt(s.summary.mean)}，总体σ ${fmt(s.summary.stddev)}${s.summary.sample_stddev != null ? `，样本σ ${fmt(s.summary.sample_stddev)}` : ''}${s.summary.pearson !== undefined ? `，r=${fmt(s.summary.pearson)}` : ''}` : '行数汇总'}，排除 ${s.excludedRows} 行`).join('　 /　');
    const shown = result.chart.series.reduce((n, s) => n + s.points.length, 0);
    const trunc = result.chart.truncatedGroups ? `柱图截断 ${result.chart.truncatedGroups} 组。` : '';
    $('chart-caption').textContent = `显示 ${shown} 个点 / 柱。${trunc}横轴无效 ${result.excludedRows} 行；每条序列的缺失分别处理。结果表预览前200行，报告保留完整结果表。`;
  }
  const headers = Object.keys(result.table[0] ?? {}).filter(h => result.query.mode !== 'plot' || (h !== 'order' && !(h === 'x' && result.table[0]?.xLabel !== undefined)));
  const labels = { series: '序列', x: '横轴', xLabel: '横轴原值', y: '纵轴数值', row: '原始行号', group: '分组', rows: '行数', valid: '有效数', value: '聚合值', field: '字段', type: '类型', missing: '缺失', invalid: '不可解析', numeric: '数值个数', distinct: '不同值', mean: '平均值', lower: '区间下界', upper: '区间上界', count: '频数', hint: '质量提示' };
  table($('result-table'), headers.map(h => labels[h] ?? h), result.table.slice(0, 200).map(r => headers.map(h => h === 'type' ? ({ number: '数值', text: '文本', date: '日期', boolean: '是/否' })[r[h]] ?? r[h] : r[h])));
  $('warnings').replaceChildren(...result.warnings.map(w => el('p', w)));
}
async function selectDataset(id) {
  invalidate(); state.id = id; state.history = []; renderDatasets();
  $('empty-state').hidden = !!id; $('analysis-content').hidden = !id; $('delete-button').disabled = !id;
  if (!id) { $('source-label').textContent = '未选择'; return; }
  const revision = state.revision;
  const { profile: p } = await json('profile', { datasetId: id }); if (revision !== state.revision) return;
  $('source-label').textContent = p.synthetic ? '合成数据' : '用户导入';
  $('metrics').replaceChildren(...[
    ['数据行', p.rowCount, '全部记录'],
    ['字段', p.columns.length, '含标识字段'],
    ['数值字段', p.columns.filter(c => c.type === 'number').length, '非空均可解析'],
    ['混合字段', p.columns.filter(c => c.mixed).length, '含数值与非数值'],
    ['缺失单元格', p.missingCells, '空白视为缺失'],
    ['不可解析', p.invalidCells ?? 0, '非空且非有限数值'],
  ].map(([label, value, note]) => { const d = el('div', undefined, 'metric'); d.append(el('span', label), el('strong', fmt(value)), el('small', note)); return d; }));
  const quality = $('quality-notes') || (() => { const n = el('div'); n.id = 'quality-notes'; n.className = 'quality-notes'; $('metrics').after(n); return n; })();
  quality.replaceChildren(...(p.qualityNotes?.length ? p.qualityNotes.map(w => el('p', w)) : [el('p', '未发现混合列或高缺失字段提示。')]));
  quality.hidden = false;
  const all = p.columns.map(c => c.name), numeric = p.columns.filter(c => c.numeric > 0).map(c => c.name);
  options($('group'), all, p.columns.find(c => ['text', 'boolean'].includes(c.type) && c.distinct <= 30)?.name ?? all[0]);
  options($('value'), numeric, numeric.at(-1)); options($('x'), all, numeric[0] ?? all[0]); options($('y'), numeric, numeric.at(-1));
  options($('plot-x'), all); state.recommendation = p.recommendation;
  $('plot-ys').replaceChildren(...numeric.map(name => { const label = el('label', undefined, 'y-choice'), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.value = name; label.append(checkbox, document.createTextNode(name)); return label; }));
  $('plot-y-hint').textContent = numeric.length ? '选择多个数值字段可叠加比较；留空时画横轴类别行数。' : '未发现数值列：可按横轴类别画行数柱状图。';
  applyPlotQuery(p.recommendation);
  const fp = $('fingerprint');
  const verifiedCanon = p.provenance?.planCanonical;
  const claimedCanon = p.provenance?.claimed?.planCanonical;
  const canon = verifiedCanon || claimedCanon;
  const base = `来源：${p.name} · ${p.sourceFormat} · SHA-256 ${p.sha256}`;
  if (canon) {
    const short = canon.length > 80 ? `${canon.slice(0, 80)}…` : canon;
    const tag = verifiedCanon ? 'planCanonical' : '声称 planCanonical（未验证）';
    fp.textContent = `${base} · ${tag} ${short}`;
    fp.title = canon;
  } else {
    fp.textContent = `${base} · ${p.synthetic ? '合成声明未经验证指纹' : '导入数据（无 planCanonical）'}`;
    fp.title = '';
  }
  table($('preview'), all, p.preview); $('mode').value = 'overview'; queryFields(); await analyze();
}
function renderDatasets() {
  $('dataset-count').textContent = `${state.datasets.length} / 12`;
  options($('dataset-select'), state.datasets.length ? state.datasets.map(d => ({ value: d.id, label: `${d.name} · ${d.rowCount} 行` })) : [{ value: '', label: '请生成或导入数据' }], state.id);
  $('dataset-list').replaceChildren(...state.datasets.map(d => { const button = el('button', d.name, `dataset-item${d.id === state.id ? ' selected' : ''}`); button.append(el('small', `${d.rowCount} 行 · ${d.synthetic ? '合成' : '导入'}`)); button.addEventListener('click', () => attempt(async () => { switchTab('analyze'); await selectDataset(d.id); })); return button; }));
  if (!state.datasets.length) $('dataset-list').append(el('p', '还没有数据。生成一份，或上传已有文件。'));
}
async function analyze() {
  if (!state.id) return;
  const revision = state.revision;
  const { result } = await json('explore', query());
  if (revision === state.revision) showResult(result);
}
async function attempt(fn) { try { await fn(); } catch (e) { notice(e.name === 'AbortError' ? '已停止本次请求。' : e.message, true); } }
function save(content, name, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], { type })); const a = el('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function chatMessage(message, cls) { const n = el('div', message, `message ${cls}`); $('messages').append(n); n.scrollIntoView({ block: 'nearest' }); }
async function chat(message) {
  if (state.controller || !message.trim()) return;
  const controller = new AbortController(); state.controller = controller;
  const revision = state.revision; const planRevision = state.planRevision; const activeId = state.id;
  $('send-button').disabled = true; $('stop-button').hidden = false; $('chat-status').textContent = '助手正在处理…'; chatMessage(message, 'user');
  try {
    const response = await json('workbench-chat', { datasetId: state.id || undefined, query: currentQuery(), message, history: state.history.slice(-10) }, controller.signal);
    for (const trace of response.trace) {
      const gate = trace.contract?.allowlisted ? ' · 白名单已校验' : '';
      const d = el('details', undefined, 'trace');
      d.append(el('summary', `${trace.ok ? '✓' : '×'} ${trace.tool}${gate}`), el('pre', JSON.stringify({ contract: trace.contract, result: trace.result }, null, 2)));
      $('messages').append(d);
    }
    if (response.evidence?.toolAllowlistValidator) {
      chatMessage(`证据：工具白名单校验器 ${response.evidence.toolAllowlistValidator}；已校验 ${ (response.evidence.toolsValidated || []).join('、') || '（无）' }。`, 'assistant-message');
    }
    chatMessage(response.answer + (response.caveat ? `\n${response.caveat}` : ''), 'assistant-message');
    if (revision === state.revision && planRevision === state.planRevision && activeId === state.id) {
      for (const artifact of response.artifacts) {
        if (artifact.kind === 'generation-plan') { setPlan(artifact.plan); switchTab('generate'); notice('助手已提出方案。检查字段与参数后，点击“生成数据集”。'); }
        else if (artifact.contract === 'moondata.explore/1') { if (artifact.query.mode === 'plot') applyPlotQuery(artifact.query); else { for (const [k, v] of Object.entries(artifact.query)) if ($(k)) $(k).value = v; queryFields(); } showResult(artifact); switchTab('analyze'); }
      }
      state.history.push({ role: 'user', content: message }, { role: 'assistant', content: response.answer.slice(0, 6000) });
    } else notice('数据或方案已改变，本次助手结果保留在对话中，未覆盖当前视图。');
  } finally { if (state.controller === controller) state.controller = null; $('send-button').disabled = false; $('stop-button').hidden = true; $('chat-status').textContent = '工具有边界，计算可追溯'; }
}
for (const tab of ['generate', 'analyze']) $(`tab-${tab}`).addEventListener('click', () => switchTab(tab));
$('start-upload').addEventListener('click', () => { switchTab('analyze'); $('upload').click(); });
$('start-generate').addEventListener('click', () => { switchTab('generate'); $('plan-name').focus(); });
new ResizeObserver(() => { if (state.result?.chart && !$('chart-wrap').hidden) drawChart($('chart'), state.result.chart); }).observe($('chart'));
$('back-generate').addEventListener('click', () => switchTab('generate'));
$('generate-panel').addEventListener('input', () => { state.planRevision++; });
$('add-field').addEventListener('click', () => { state.plan.columns.push({ name: `字段${state.plan.columns.length + 1}`, kind: 'number' }); renderFields(); });
$('generate-button').addEventListener('click', () => attempt(async () => {
  $('generate-button').disabled = true;
  try { const { dataset } = await json('generate', { ...state.plan, name: $('plan-name').value, rows: Number($('rows').value), seed: Number($('seed').value) }); state.datasets.push(dataset); switchTab('analyze'); await selectDataset(dataset.id); notice(`已生成 ${dataset.rowCount} 行合成数据，可继续分析或下载。`); }
  finally { $('generate-button').disabled = false; }
}));
function bytesToBase64(bytes) {
  let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
async function importFile(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MiB');
  if (!/\.(csv|json|jsonl|ndjson|xlsx)$/i.test(file.name)) throw new Error('当前支持 CSV / JSON / JSONL / XLSX。PDF、图片等需要先提取为表格。');
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) {
    const { dataset } = await json('import', { name: file.name, format: 'xlsx', contentBase64: bytesToBase64(buffer) });
    return dataset;
  }
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('文件不是有效 UTF-8。请另存为 UTF-8 CSV，或直接上传 .xlsx'); }
  const format = /\.(jsonl|ndjson)$/i.test(file.name) ? 'jsonl' : /\.json$/i.test(file.name) ? 'json' : 'csv';
  const { dataset } = await json('import', { name: file.name, content, format });
  return dataset;
}
$('upload').addEventListener('change', () => attempt(async () => {
  const file = $('upload').files[0]; if (!file) return;
  try {
    const dataset = await importFile(file);
    state.datasets.push(dataset); switchTab('analyze'); await selectDataset(dataset.id); notice(`已导入 ${file.name}`);
  } finally { $('upload').value = ''; }
}));
async function exportWorkspacePack() {
  if (!state.datasets.length) throw new Error('当前没有可导出的数据集');
  const { workspace } = await json('workspace/export', { datasetId: state.id || undefined, query: state.result?.query ?? currentQuery() });
  save(JSON.stringify(workspace, null, 2), `moondata-workspace-${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8');
  notice('已导出工作区包。重启服务后可用“导入工作区”恢复。');
}
$('workspace-export').addEventListener('click', () => attempt(exportWorkspacePack));
$('workspace-export-main').addEventListener('click', () => attempt(exportWorkspacePack));
$('workspace-upload').addEventListener('change', () => attempt(async () => {
  const file = $('workspace-upload').files[0]; if (!file) return;
  try {
    let workspace;
    try { workspace = JSON.parse(await file.text()); } catch { throw new Error('工作区文件不是有效 JSON'); }
    const result = await json('workspace/import', { workspace, replace: true });
    state.datasets = result.datasets; state.history = [];
    switchTab('analyze');
    const focus = result.view?.datasetId ?? state.datasets[0]?.id ?? '';
    await selectDataset(focus);
    if (result.view?.query?.mode === 'plot') { applyPlotQuery(result.view.query); await plot(); }
    else if (result.view?.query?.mode) {
      for (const [k, v] of Object.entries(result.view.query)) if ($(k) && ['overview', 'group', 'distribution'].includes(result.view.query.mode)) $(k).value = v;
      queryFields(); await analyze();
    }
    notice(`已导入工作区（${result.datasets.length} 份数据）。`);
  } finally { $('workspace-upload').value = ''; }
}));
$('dataset-select').addEventListener('change', () => attempt(() => selectDataset($('dataset-select').value)));
$('delete-button').addEventListener('click', () => attempt(async () => { const id = state.id; const r = await fetch(`/api/datasets/${id}`, { method: 'DELETE', headers: { 'X-Lab-Client': '1' } }); if (!r.ok) throw new Error((await r.json()).error); state.datasets = state.datasets.filter(d => d.id !== id); await selectDataset(state.datasets[0]?.id ?? ''); }));
$('analysis-form').addEventListener('input', () => { state.querySource = 'analysis'; invalidate(); queryFields(); });
$('analysis-form').addEventListener('submit', e => { e.preventDefault(); attempt(analyze); });
$('plot-form').addEventListener('input', e => { if (document.querySelectorAll('#plot-ys input:checked').length > 8) { e.target.checked = false; notice('最多同时选择8个纵轴字段。', true); } state.querySource = 'plot'; invalidate(); });
$('plot-form').addEventListener('submit', e => { e.preventDefault(); attempt(plot); });
$('recommend-button').addEventListener('click', () => attempt(async () => { invalidate(); applyPlotQuery(state.recommendation); await plot(); notice('已按字段类型推荐图表；这是确定性推荐，可继续修改或让模型规划。'); }));
$('describe-button').addEventListener('click', () => { state.querySource = 'plot'; $('message').value = '按当前选择画图'; $('message').focus(); notice('已把当前横纵轴选择带入对话，可直接发送，或改成“把当前选择换成折线图”。'); });
for (const button of document.querySelectorAll('[data-download]')) button.addEventListener('click', () => attempt(async () => { const format = button.dataset.download; const r = await api('download', { datasetId: state.id, format }); save(await r.text(), `moondata-${state.id.slice(0, 8)}.${format}`, r.headers.get('Content-Type')); }));
for (const [id, format] of [['report-button', 'markdown'], ['json-report-button', 'json']]) $(id).addEventListener('click', () => attempt(async () => { if (!state.result) return; const revision = state.revision; const report = await json('data-report', state.result.query); if (revision === state.revision && state.result) save(report[format], `moondata-report.${format === 'markdown' ? 'md' : 'json'}`); }));
$('svg-button').addEventListener('click', () => { if (!state.result?.chart) return; const svg = $('chart').cloneNode(true); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); save(new XMLSerializer().serializeToString(svg), 'moondata-chart.svg', 'image/svg+xml'); });
$('chat-form').addEventListener('submit', e => { e.preventDefault(); const message = $('message').value; $('message').value = ''; attempt(() => chat(message)); });
for (const b of document.querySelectorAll('[data-prompt]')) b.addEventListener('click', () => attempt(() => chat(b.dataset.prompt)));
$('stop-button').addEventListener('click', () => state.controller?.abort());
await attempt(async () => {
  const [status, templateResponse, data] = await Promise.all([json('status'), json('templates'), json('datasets')]);
  $('model-label').textContent = status.model.mode === 'local-model' ? `本地小模型 · ${status.model.model} · 图表规划` : status.model.mode === 'model' ? `模型已连接配置 · ${status.model.model}（请求时验证）` : status.model.mode === 'unavailable' ? `模型配置有误：${status.model.error}` : '内置模板与分析 · 未连接大模型';
  if (status.model.mode === 'local-model') $('message').placeholder = '例如：以日期为横轴，画收入和支出；或把我选的几列换成折线图…';
  $('data-policy').textContent = status.dataPolicy;
  state.templates = templateResponse.templates;
  $('templates').replaceChildren(...state.templates.map(t => { const b = el('button', t.name, 'template'); b.dataset.template = t.id; b.append(el('small', t.description)); b.addEventListener('click', () => setPlan(t)); return b; }));
  setPlan(state.templates[0]); state.datasets = data.datasets; renderDatasets(); if (state.datasets.length) await selectDataset(state.datasets[0].id);
});
