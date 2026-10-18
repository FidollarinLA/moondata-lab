const clean = value => String(value ?? '').replace(/[\r\n|]/g, ' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_[\]()!#]/g, '\\$&');
const n = (v, unit = '') => v == null ? '未观察到 / 不可用' : `${Number(v).toPrecision(6)}${unit ? ` ${unit}` : ''}`;
export function makeReport(results, comparison = null) {
  const createdAt = new Date().toISOString();
  const lines = ['# MoonData Lab 实验分析报告', '', `生成时间：${createdAt}`, '',
    '计算引擎：MoonBit。以下指标由数值工具生成，未包含模型自行计算的数值。', ''];
  for (const r of results) {
    const m = r.metrics, s = r.selection;
    lines.push(`## ${clean(r.dataset.name)}`, '',
      `数据类型：${r.dataset.synthetic ? '合成演示数据，不代表实测' : '用户上传，测量条件由用户确认'}`,
      `SHA-256（上传文件 UTF-8 内容）：${r.dataset.sha256}`, '',
      `时间列：${clean(s.timeColumn)}（原单位 ${clean(s.timeUnit)}，计算统一为秒）；响应列：${clean(s.valueColumn)}（${clean(s.valueUnit) || '未声明单位'}）。`,
      `观察区间：${n(r.observation.start, 's')} ～ ${n(r.observation.end, 's')}；区间外排除 ${r.excludedRows} 行。`,
      `目标值 ${n(s.target)}，初始值 ${n(s.initial)}，阶跃时刻 ${n(s.stepTime, 's')}，误差带 ±${n(s.bandPercent, '%')}（相对阶跃幅值），末段窗口 ${n(s.tailPercent, '%')}（按时长）。`, '',
      '| 指标 | 结果 |', '| --- | --- |',
      `| 超调量 | ${n(m.overshoot_percent, '%')} |`,
      `| 10–90% 上升时间 | ${n(m.rise_time, 's')} |`,
      `| 观察窗内调节时间 | ${n(m.settling_time, 's')} |`,
      `| 峰值 | ${n(m.peak_value, s.valueUnit)} |`,
      `| 峰值时刻（相对阶跃） | ${n(m.peak_time, 's')} |`,
      `| 末段均值 | ${n(m.tail_mean, s.valueUnit)} |`,
      `| 末段误差（目标减均值） | ${n(m.steady_error, s.valueUnit)} |`,
      `| 绝对误差积分 IAE | ${n(m.iae, `${s.valueUnit || '响应单位'}·s`)} |`,
      `| 全区间均值 / 总体标准差 | ${n(r.summary.mean)} / ${n(r.summary.stddev)} |`,
      `| 原始分析样本 / 阶跃后样本 | ${r.summary.count} / ${m.samples} |`, '',
      `末段样本数：${m.tail_samples}；末段起点：${n(m.tail_start, 's')}。`,
      ...m.warnings.map(w => `- ${clean(w)}`), '');
  }
  if (comparison?.warnings.length) lines.push('## 比较限制', '', ...comparison.warnings.map(w => `- ${clean(w)}`), '');
  lines.push('## 方法与限制', '',
    '- 单阶跃模型，阶跃时刻和初始/目标值由用户明确指定；多阶跃应先选择区间。',
    '- 超调量按阶跃方向、相对阶跃幅值计算。10% 与 90% 首次穿越时间采用线性插值；起始已跨过阈值时不补造穿越时间。',
    '- 调节时间取最后一个带外样本之后的带内样本时刻，至少要求两个末尾带内样本，只描述观察窗口。',
    '- 末段均值为最后指定时长区间内样本的算术平均；不是无限时间稳态证明。',
    '- IAE 对分段线性误差的绝对值积分，包含穿越零点时的分段面积。',
    '- 图表可降采样显示；指标始终使用区间内全部原始样本。',
    '- 不根据比较自动证明因果、闭环稳定性或电机故障。', '');
  return { markdown: lines.join('\n'), json: { contract: 'moondata.report/1', createdAt, results, comparisonWarnings: comparison?.warnings ?? [] } };
}
