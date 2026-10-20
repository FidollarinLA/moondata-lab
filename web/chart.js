const NS = 'http://www.w3.org/2000/svg';
const fmt = v => typeof v === 'number' ? Number(v.toPrecision(5)).toString() : String(v);
function node(tag, attrs = {}, text) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); if (text !== undefined) el.textContent = text; return el; }
export function drawChart(svg, chart) {
  svg.replaceChildren();
  const series = (chart?.series ?? (chart?.points?.length ? [{ name: chart.yLabel, color: '#659b77', points: chart.points }] : [])).filter(s => s.points?.length);
  if (!series.length) return;
  svg.append(node('title', {}, `${chart.xLabel} / ${chart.yLabel}`));
  const W = Math.max(320, svg.getBoundingClientRect().width || 800), left = 70, right = 20, width = W - left - right;
  svg.setAttribute('viewBox', `0 0 ${W} 350`);
  const columns = Math.max(1, Math.floor(width / 140));
  const top = 48 + (chart.series ? Math.max(0, Math.ceil(series.length / columns) - 1) * 18 : 0), bottom = 270;
  const points = series.flatMap(s => s.points);
  const ys = points.filter(p => p.y !== null).map(p => p.y);
  if (!ys.length) return;
  let ymin, ymax;
  if (chart.kind === 'bar') {
    ymin = Math.min(...ys, 0); ymax = Math.max(...ys, 0);
    if (ymin === ymax) ymax = ymin + 1;
  } else {
    ymin = Math.min(...ys); ymax = Math.max(...ys);
    if (ymin === ymax) { const pad = Math.max(Math.abs(ymin) * 0.05, 1); ymin -= pad; ymax += pad; }
    else { const pad = (ymax - ymin) * 0.05; ymin -= pad; ymax += pad; }
  }
  const sy = y => bottom - (y - ymin) / (ymax - ymin) * (bottom - top);
  for (let i = 0; i <= 4; i++) { const y = ymin * (1 - i / 4) + ymax * i / 4; svg.append(node('line', { x1: left, x2: W - right, y1: sy(y), y2: sy(y), stroke: '#e8eddf', 'stroke-dasharray': '4 5' }), node('text', { x: left - 12, y: sy(y) + 4, 'text-anchor': 'end' }, fmt(y))); }
  svg.append(node('text', { x: left, y: 15 }, chart.yLabel), node('text', { x: left + width / 2, y: 337, 'text-anchor': 'middle' }, chart.xLabel));
  if (chart.series) series.forEach((s, i) => { const x = left + i % columns * width / columns, y = 27 + Math.floor(i / columns) * 18; svg.append(node('rect', { x, y, width: 9, height: 4, fill: s.color }), node('text', { x: x + 13, y: y + 6 }, s.name.slice(0, 13))); });
  if (chart.kind === 'bar') {
    const axis = series[0].points;
    const bw = width / Math.max(axis.length, 1);
    series.forEach((s, j) => { for (let i = 0; i < s.points.length; i++) { const p = s.points[i], x = left + i * bw, zero = sy(0), y = sy(p.y ?? 0);
      if (p.y !== null) { const rect = node('rect', { x: x + bw * .1 + j * bw * .8 / series.length, y: Math.min(y, zero), width: bw * .8 / series.length * .94, height: Math.abs(zero - y), fill: s.color, rx: 2 }); rect.append(node('title', {}, `${s.name} · ${p.x}：${fmt(p.y)}`)); svg.append(rect); }
      if (j === 0 && i % Math.ceil(s.points.length / (W < 500 ? 3 : 7)) === 0) svg.append(node('text', { x: x + bw / 2, y: 292, 'text-anchor': 'middle' }, String(p.x).slice(0, W < 500 ? 8 : 12)));
    } });
  } else {
    const continuous = chart.kind === 'scatter' || ['number', 'date'].includes(chart.xMode);
    const valueX = (p, i) => continuous ? p.x : chart.xMode ? p.order : i;
    const xs = series.flatMap(s => s.points.map(valueX)); let xmin = Math.min(...xs), xmax = Math.max(...xs);
    if (xmin === xmax) { const pad = Math.max(Math.abs(xmin) * 1e-6, 1); xmin -= pad; xmax += pad; }
    const sx = (p, i) => left + (valueX(p, i) - xmin) / (xmax - xmin) * width;
    for (const s of series) {
      if (chart.kind === 'line') svg.append(node('polyline', { points: s.points.map((p, i) => `${sx(p, i)},${sy(p.y)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2 }));
      s.points.forEach((p, i) => { const c = node('circle', { cx: sx(p, i), cy: sy(p.y), r: chart.kind === 'scatter' ? 3 : 2, fill: s.color, opacity: .65 }); c.append(node('title', {}, `${s.name} · 第 ${p.row} 行 · ${p.xLabel ?? p.x}：${fmt(p.y)}`)); svg.append(c); });
    }
    const axisPoints = series[0].points;
    for (let i = 0; i <= 4; i += W < 500 ? 2 : 1) { const v = xmin * (1 - i / 4) + xmax * i / 4; const label = continuous ? chart.xMode === 'date' ? new Date(v).toISOString().slice(0, 10) : fmt(v) : axisPoints[Math.round(i / 4 * (axisPoints.length - 1))].x; svg.append(node('text', { x: left + i / 4 * width, y: 292, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, String(label).slice(0, 16))); }
  }
}
