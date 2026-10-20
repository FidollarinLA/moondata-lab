import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../docs/assets/', import.meta.url); await mkdir(directory, { recursive: true });
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const diagrams = [
  ['workflow', '从一张表，到可核对的答案', '先看字段，再选坐标；每一步都保留人的选择。', [
    ['01', '带来数据', '上传 CSV / JSON / JSONL', '或确认合成方案后生成'],
    ['02', '认识这张表', '查看类型、缺失与来源', '选择 X / Y 与聚合方式'],
    ['03', '画图与核对', 'MoonBit 计算有效样本', '对照参数、排除行和方法'],
    ['04', '带走结果', '下载图表、表格与报告', '用来源指纹追溯这次计算'],
  ]],
  ['architecture', '把理解、计算与呈现分开', '模型提出配置；受限工具执行；计算结果可以独立复核。', [
    ['UI', '浏览器工作台', '中文表单 · 选轴 · 对话', 'SVG 图表与结果下载'],
    ['API', 'Node 编排层', '本机会话 · 校验 · 工具边界', '不执行模型生成的代码'],
    ['CORE', 'MoonBit 核心', 'CSV · 生成器 · 统计 · 聚合', 'JS / Wasm GC 双后端验证'],
    ['AI', '可选模型', '本地 Qwen / 远程工具模型', '通过编排层调用受限工具'],
  ]],
  ['data-flow', '数字是怎样进入一张图的', '完整数据用于统计；图表预览有显示上限；报告从查询重新计算。', [
    ['IN', '原始文本', '保留 UTF-8 内容指纹', '合成数据附来源标识'],
    ['TYPE', '结构化字段', '解析类型与空值', '概览与配对有效性检查'],
    ['MATH', '明确的查询', '选轴 · 聚合 · 有效样本', 'MoonBit 按计算契约执行'],
    ['OUT', '图表与报告', '显示数量和排除行数', '统计、参数、来源一起导出'],
  ]],
];
for (const [name, title, subtitle, cards] of diagrams) {
  const colors = ['#eef6ed', '#fff2e5', '#edf2fb', '#f7eef6'];
  const nodes = cards.map(([badge, heading, line1, line2], i) => {
    const x = 32 + i * 254;
    return `<g transform="translate(${x} 150)"><rect width="230" height="188" rx="24" fill="${colors[i]}" stroke="#dce5de"/><circle cx="39" cy="39" r="20" fill="#fff"/><text x="39" y="44" text-anchor="middle" font-size="11" font-weight="700">${badge}</text><text x="22" y="92" font-size="21" font-weight="700">${heading}</text><text x="22" y="124" font-size="13">${escape(line1)}</text><text x="22" y="149" font-size="13">${escape(line2)}</text><path d="M179 35q8 -16 16 0q-8 16 -16 0" fill="none" stroke="#94aa99" stroke-width="2"/></g>`;
  }).join('');
  // Architecture has a return arrow to the orchestration layer, not CORE → AI.
  const arrows = name === 'architecture'
    ? '<path d="M262 244h24"/><path d="M516 244h24"/><path d="M909 150V126H401v24"/>'
    : '<path d="M262 244h24"/><path d="M516 244h24"/><path d="M770 244h24"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="408" viewBox="0 0 1060 408" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${subtitle} ${cards.map(c => c.slice(1).join('，')).join('；')}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="m1 1 5 3-5 3" fill="none" stroke="#66816e" stroke-width="1.5"/></marker></defs><rect width="1060" height="408" rx="20" fill="#fff"/><g font-family="Microsoft YaHei,system-ui,sans-serif" fill="#29493c"><text x="32" y="35" font-size="11" letter-spacing="3" fill="#708574">MOONDATA LAB / ${name.toUpperCase()}</text><text x="32" y="79" font-size="29" font-weight="700">${title}</text><text x="32" y="109" font-size="14" fill="#5a7163">${subtitle}</text>${nodes}<g fill="none" stroke="#66816e" stroke-width="2" marker-end="url(#arrow)">${arrows}</g><text x="32" y="382" font-size="12" fill="#657a6d">MAKE DATA. FIND ANSWERS.   ·   人确认方向，工具留下证据。</text></g></svg>`;
  await writeFile(new URL(`${name}.svg`, directory), svg);
}
console.log('Wrote workflow, architecture and data-flow SVG diagrams.');
