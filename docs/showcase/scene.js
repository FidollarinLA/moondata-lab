const $ = id => document.getElementById(id);
const csv = '日期,地区,金额（元）,_synthetic\n2026-01-01,东部,120,true\n2026-01-02,西部,80,true\n2026-01-03,东部,,true\n2026-01-04,东部,150,true\n2026-01-05,西部,100,true\n2026-01-06,北部,50,true\n';
const views = {
  workflow: { caption: '从导入到导出，保留选择与证据。', stages: [
    ['带来一张表', '上传，或确认合成方案', 'INPUT', '原始记录先保留下来。', '这里用六行合成台账演示。真实工作台接受上传，或根据你确认的字段方案生成数据。'],
    ['选你关心的列', '类型、缺失与坐标', 'SELECT', '先决定要比较什么。', '本次按地区汇总金额。第三行金额为空，只从金额计算中排除；它没有被悄悄改成零。'],
    ['算清楚再画图', '受限工具 → MoonBit', 'COMPUTE', '每一个数字，都有来处。', '点下计算，当前服务会导入这张演示表并调用 MoonBit 分组计算。切换总和与平均值，会使旧结果失效。'],
    ['把证据带走', '图表、参数与报告', 'EXPORT', '答案连着参数一起带走。', '这里可下载本次计算的 JSON 证据；完整工作台还可下载原始表、Markdown 报告与 SVG。'],
  ] },
  architecture: { caption: '浏览器 ↔ Node 编排 ↔ MoonBit；可选模型 ↔ Node 编排。', stages: [
    ['浏览器', '你看见和操作的地方', 'UI', '选择永远可以自己修改。', '浏览器负责上传、选轴、对话和 SVG 绘图，不用图表像素来替代数值统计。'],
    ['Node 编排', '校验、会话与工具边界', 'API', '只开放明确的分析工具。', '服务校验参数、隔离会话，再把查询交给计算核心。不执行模型生成的 shell 或任意代码。'],
    ['MoonBit 核心', '解析、生成、统计与聚合', 'CORE', '计算是可复核的底座。', '同一套核心在 JS 和 Wasm GC 后端验证。当前演示使用服务端的 MoonBit JS 编译产物。'],
    ['可选模型', '提出配置，接收工具摘要', 'MODEL', '模型帮忙理解，工具负责计算。', '本地小模型接收问题、字段元数据和当前选择；远程模式可能接收工具摘要。此页面完全没有调用模型。'],
  ] },
  data: { caption: '原始文本 → 结构化字段 → 有效样本计算 → 图表与可追溯报告。', stages: [
    ['文本与指纹', '原始字节的来源记录', 'SOURCE', '指纹记录的是来源，不是真实性。', '服务对上传 UTF-8 文本计算 SHA-256。合成标识也不等同于隐私保护或真实分布保证。'],
    ['字段与空值', '空白 ≠ 0', 'PARSE', '先解释缺失，再处理缺失。', '六行数据中有五个有效金额；日期和地区仍保留。不同纵轴的有效配对可能不同。'],
    ['明确的查询', '地区 × 金额 × 聚合', 'QUERY', '计算使用全部有效数值。', '总和与平均值是不同的问题。本次汇总为三组，所有有效金额参与统计，没有按图中可见点反推结果。'],
    ['展示与导出', '显示边界与重算证据', 'RESULT', '看见的图，不等于完整数据。', '工作台每条曲线最多显示1500点，柱图最多50组。报告根据查询重新计算；导出原始表可保留完整记录。'],
  ] },
};
let mode = 'workflow', step = 0, timer = null, datasetId, result;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const lines = csv.trim().split('\n').slice(1);
lines.forEach((line, i) => { const tr = document.createElement('tr'); [String(i + 1), ...line.split(',').slice(0, 3)].forEach((value, col) => { const td = document.createElement('td'); td.textContent = value || '缺失'; if (col === 3) td.className = value ? 'selected' : 'missing'; tr.append(td); }); $('rows').append(tr); });
function stop() { clearInterval(timer); timer = null; $('play').textContent = '播放流程 ▷'; $('play').setAttribute('aria-pressed', 'false'); document.body.classList.add('paused'); $('motion').textContent = '恢复动效'; $('motion').setAttribute('aria-pressed', 'true'); }
$('motion').addEventListener('click', () => { if (!document.body.classList.contains('paused')) stop(); else { document.body.classList.remove('paused'); $('motion').textContent = '暂停动效'; $('motion').setAttribute('aria-pressed', 'false'); } });
function render() {
  document.body.dataset.view = mode;
  const view = views[mode], active = view.stages[step]; $('mode-caption').textContent = view.caption;
  $('stages').replaceChildren(...view.stages.map((s, i) => {
    const b = document.createElement('button'); b.className = 'stage'; b.setAttribute('aria-pressed', String(i === step));
    const num = document.createElement('span'); num.className = 'number'; num.textContent = `${String(i + 1).padStart(2, '0')} / ${s[2]}`;
    const title = document.createElement('strong'); title.textContent = s[0]; const detail = document.createElement('small'); detail.textContent = s[1]; b.append(num, title, detail);
    b.addEventListener('click', () => { stop(); step = i; render(); }); return b;
  }));
  $('position').textContent = `${String(step + 1).padStart(2, '0')} / 04`; $('step-label').textContent = `0${step + 1} / ${active[2]}`;
  $('step-title').textContent = active[3]; $('step-copy').textContent = active[4];
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
}
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => { stop(); mode = button.dataset.mode; step = 0; render(); });
$('next').addEventListener('click', () => { stop(); step = (step + 1) % 4; render(); });
$('play').addEventListener('click', () => {
  if (timer) { stop(); return; } step = 0; render(); document.body.classList.remove('paused'); $('motion').textContent = '暂停动效'; $('motion').setAttribute('aria-pressed', 'false'); $('play').textContent = '暂停流程 Ⅱ'; $('play').setAttribute('aria-pressed', 'true');
  timer = setInterval(() => { if (step === 3) { stop(); return; } step++; render(); }, reduced.matches ? 6000 : 3200);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
reduced.addEventListener('change', stop);
function invalidate() { result = undefined; $('export').disabled = true; $('mini-chart').replaceChildren(); $('evidence').textContent = '等待实际计算。演示不会把预填数字冒充计算结果。'; }
$('reducer').addEventListener('change', invalidate);
async function api(path, body) { const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Client': '1' }, body: JSON.stringify(body) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || '本机计算失败'); return value; }
$('compute').addEventListener('click', async () => {
  stop(); $('compute').disabled = true; $('reducer').disabled = true; invalidate(); $('evidence').textContent = '正在调用本机 MoonBit 计算…';
  try {
    if (!datasetId) datasetId = (await api('/api/import', { name: '合成演示-旅程台账.csv', format: 'csv', content: csv })).dataset.id;
    const query = { datasetId, mode: 'plot', x: '地区', yColumns: ['金额（元）'], kind: 'bar', reducer: $('reducer').value };
    result = await api('/api/data-report', query);
    // data-report returns a markdown + json envelope; its json is the recomputed evidence.
    const evidence = JSON.parse(result.json), summary = evidence.statistics.series[0];
    $('evidence').textContent = `MoonBit 已计算 · 有效 ${summary.summary.count} 行 · 排除 ${summary.excludedRows} 行 · ${query.reducer === 'sum' ? '总和' : '平均值'}`;
    const max = Math.max(...evidence.table.map(r => r.value), 1);
    for (const row of evidence.table) { const line = document.createElement('div'); line.className = 'bar-row'; const label = document.createElement('span'); label.textContent = row.group; const track = document.createElement('div'); track.className = 'bar-track'; const bar = document.createElement('div'); bar.className = 'bar-fill'; bar.style.width = `${row.value / max * 100}%`; track.append(bar); const value = document.createElement('span'); value.textContent = Number(row.value.toFixed(2)).toString(); line.append(label, track, value); $('mini-chart').append(line); }
    $('export').disabled = false; step = 2; render();
  } catch (error) { invalidate(); $('evidence').textContent = `无法完成计算：${error.message}。请确认本机服务正在运行；不会显示模拟成功结果。`; }
  finally { $('compute').disabled = false; $('reducer').disabled = false; }
});
$('export').addEventListener('click', () => { if (!result) return; const file = new Blob([JSON.stringify({ syntheticDemo: true, ...JSON.parse(result.json) }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = 'moondata-demo-evidence.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
if (reduced.matches) stop();
invalidate(); render();
