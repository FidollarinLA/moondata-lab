const NS = 'http://www.w3.org/2000/svg';
const fmt = v => typeof v === 'number' ? Number(v.toPrecision(5)).toString() : String(v);
function node(tag, attrs = {}, text) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); if (text !== undefined) el.textContent = text; return el; }
export function drawChart(svg, chart) {
  svg.replaceChildren(); if (!chart?.points.length) return;
  svg.append(node('title', {}, `${chart.xLabel} / ${chart.yLabel}`));
  const pts = chart.points, W = 800, left = 78, right = 24, top = 30, bottom = 270, width = W - left - right;
  const ys = pts.filter(p => p.y !== null).map(p => p.y);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys, 0); if (ymin === ymax) ymax = ymin + 1;
  const sy = y => bottom - (y - ymin) / (ymax - ymin) * (bottom - top);
  for (let i = 0; i <= 4; i++) { const y = ymin + (ymax - ymin) * i / 4; svg.append(node('line', { x1: left, x2: W - right, y1: sy(y), y2: sy(y), stroke: '#e8eddf', 'stroke-dasharray': '4 5' }), node('text', { x: left - 12, y: sy(y) + 4, 'text-anchor': 'end' }, fmt(y))); }
  svg.append(node('text', { x: left, y: 15 }, chart.yLabel), node('text', { x: left + width / 2, y: 337, 'text-anchor': 'middle' }, chart.xLabel));
  if (chart.kind === 'bar') {
    const bw = width / pts.length;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], x = left + i * bw, zero = sy(0), y = sy(p.y ?? 0);
      const rect = node('rect', { x: x + bw * .13, y: Math.min(y, zero), width: bw * .74, height: Math.abs(zero - y), fill: i % 2 ? '#9ebc85' : '#659b77', rx: 2 }); rect.append(node('title', {}, `${p.x}：${p.y === null ? '无有效数值' : fmt(p.y)}`)); svg.append(rect);
      if (i % Math.ceil(pts.length / 7) === 0) svg.append(node('text', { x: x + bw / 2, y: 292, 'text-anchor': 'middle' }, String(p.x).slice(0, 12)));
    }
  } else {
    let xmin = chart.kind === 'scatter' ? Math.min(...pts.map(p => p.x)) : 0, xmax = chart.kind === 'scatter' ? Math.max(...pts.map(p => p.x)) : pts.length - 1; if (xmin === xmax) xmax = xmin + 1;
    const sx = (p, i) => left + ((chart.kind === 'scatter' ? p.x : i) - xmin) / (xmax - xmin) * width;
    if (chart.kind === 'line') svg.append(node('polyline', { points: pts.map((p, i) => `${sx(p, i)},${sy(p.y)}`).join(' '), fill: 'none', stroke: '#6a9870', 'stroke-width': 2 }));
    for (let i = 0; i < pts.length; i++) { const p = pts[i], c = node('circle', { cx: sx(p, i), cy: sy(p.y), r: chart.kind === 'scatter' ? 3 : 2, fill: '#4d896a', opacity: .65 }); c.append(node('title', {}, `第 ${p.row} 行 · ${p.x}：${fmt(p.y)}`)); svg.append(c); }
    for (let i = 0; i <= 4; i++) { const index = Math.round(i / 4 * (pts.length - 1)); svg.append(node('text', { x: left + i / 4 * width, y: 292, 'text-anchor': 'middle' }, fmt(chart.kind === 'scatter' ? xmin + (xmax - xmin) * i / 4 : pts[index].x).slice(0, 16))); }
  }
}
