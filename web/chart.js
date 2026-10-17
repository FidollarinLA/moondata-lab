const NS = 'http://www.w3.org/2000/svg';
const colors = ['#347d65', '#c9854a'];
function el(name, attrs = {}, content) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (content !== undefined) node.textContent = content;
  return node;
}
const tick = value => Math.abs(value) >= 10000 || (value !== 0 && Math.abs(value) < .001) ? value.toExponential(1) : Number(value.toPrecision(4)).toString();
export function drawChart(container, results) {
  container.replaceChildren();
  const width = Math.max(300, container.clientWidth - 26), height = container.clientHeight - 8;
  const left = width < 500 ? 50 : 65, right = 18, top = 27, bottom = 43;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `阶跃响应曲线：${results.map(r => r.dataset.name).join(' 与 ')}。完整数值见结果表。` });
  const points = results.map(r => r.chart.points.map(([t, v]) => [t - r.selection.stepTime, v]));
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const line of points) for (const [x, y] of line) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  for (const r of results) { ymin = Math.min(ymin, r.selection.target - r.metrics.band_absolute); ymax = Math.max(ymax, r.selection.target + r.metrics.band_absolute); }
  const padding = Math.max((ymax - ymin) * .13, Math.abs(ymax) * .02, 1e-10);
  ymin -= padding; ymax += padding;
  if (xmax === xmin) xmax = xmin + 1;
  const xscale = x => left + (x - xmin) / (xmax - xmin) * (width - left - right);
  const yscale = y => height - bottom - (y - ymin) / (ymax - ymin) * (height - top - bottom);
  svg.append(el('rect', { x: left, y: top, width: width - left - right, height: height - top - bottom, fill: '#fff' }));
  for (let i = 0; i <= 5; i++) {
    const y = ymin + (ymax - ymin) * i / 5, py = yscale(y);
    svg.append(el('line', { x1: left, y1: py, x2: width - right, y2: py, stroke: '#edf0e7', 'stroke-width': 1 }));
    svg.append(el('text', { x: left - 12, y: py + 4, 'text-anchor': 'end', fill: '#96a28b', 'font-size': 11, 'font-family': 'Segoe UI, sans-serif' }, tick(y)));
  }
  const xticks = width < 500 ? 4 : 6;
  for (let i = 0; i <= xticks; i++) {
    const x = xmin + (xmax - xmin) * i / xticks, px = xscale(x);
    svg.append(el('line', { x1: px, y1: top, x2: px, y2: height - bottom, stroke: '#f0f3eb', 'stroke-width': 1 }));
    svg.append(el('text', { x: px, y: height - bottom + 21, 'text-anchor': 'middle', fill: '#96a28b', 'font-size': 11, 'font-family': 'Segoe UI, sans-serif' }, tick(x)));
  }
  svg.append(el('text', { x: left, y: 15, fill: '#86967b', 'font-size': 11 }, results[0].selection.valueUnit || '响应值（未声明单位）'));
  svg.append(el('text', { x: width - right, y: height - 7, 'text-anchor': 'end', fill: '#96a28b', 'font-size': 10 }, '相对阶跃时间 / s'));
  results.forEach((r, index) => {
    const target = r.selection.target, band = r.metrics.band_absolute;
    const py1 = yscale(target + band), py2 = yscale(target - band);
    svg.append(el('rect', { x: left, y: py1, width: width - left - right, height: py2 - py1, fill: colors[index], opacity: .045 }));
    svg.append(el('line', { x1: left, y1: yscale(target), x2: width - right, y2: yscale(target), stroke: index ? colors[index] : '#9da995', 'stroke-dasharray': '6 5', 'stroke-width': 1 }));
    const line = points[index];
    const d = line.map(([x, y], i) => `${i ? 'L' : 'M'}${xscale(x).toFixed(3)},${yscale(y).toFixed(3)}`).join(' ');
    svg.append(el('path', { d, fill: 'none', stroke: colors[index], 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  });
  const cursor = el('line', { x1: 0, y1: top, x2: 0, y2: height - bottom, stroke: '#839b78', 'stroke-dasharray': '3 4', visibility: 'hidden', 'data-cursor': 'true' });
  svg.append(cursor);
  const tooltip = document.createElement('div'); tooltip.className = 'chart-tooltip'; tooltip.hidden = true;
  container.append(svg, tooltip);
  svg.addEventListener('pointermove', event => {
    const box = svg.getBoundingClientRect();
    // xMidYMid meet: account for letterboxing before mapping pointer coordinates.
    const factor = Math.min(box.width / width, box.height / height);
    const offset = (box.width - width * factor) / 2;
    const px = (event.clientX - box.left - offset) / factor;
    if (px < left || px > width - right) { tooltip.hidden = true; cursor.setAttribute('visibility', 'hidden'); return; }
    const x = xmin + (px - left) / (width - left - right) * (xmax - xmin);
    const lines = [`相对阶跃 ${tick(x)} s · 显示点`];
    points.forEach((line, i) => {
      let low = 0, high = line.length - 1;
      while (low < high) { const mid = (low + high) >>> 1; if (line[mid][0] < x) low = mid + 1; else high = mid; }
      let index = low;
      if (index > 0 && Math.abs(line[index - 1][0] - x) < Math.abs(line[index][0] - x)) index--;
      lines.push(`${results[i].dataset.name}: ${tick(line[index][1])} ${results[i].selection.valueUnit}`);
    });
    tooltip.textContent = lines.join('\n'); tooltip.hidden = false;
    cursor.setAttribute('x1', px); cursor.setAttribute('x2', px); cursor.setAttribute('visibility', 'visible');
    tooltip.style.left = `${Math.max(5, Math.min(event.clientX - container.getBoundingClientRect().left + 12, container.clientWidth - 220))}px`;
    tooltip.style.top = '30px';
  });
  svg.addEventListener('pointerleave', () => { tooltip.hidden = true; cursor.setAttribute('visibility', 'hidden'); });
  return svg;
}

export function exportSvg(container) {
  const source = container.querySelector('svg');
  if (!source) return null;
  const copy = source.cloneNode(true);
  copy.querySelector('[data-cursor]')?.remove();
  const [, , width, height] = copy.getAttribute('viewBox').split(' ');
  copy.setAttribute('xmlns', NS); copy.setAttribute('width', width); copy.setAttribute('height', height);
  return new XMLSerializer().serializeToString(copy);
}
