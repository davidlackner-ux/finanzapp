// Lightweight SVG charts with hover/tap tooltips. Colors come from CSS custom properties (--viz-*).

import { el, fmt, fmtShort } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Rounds the axis maximum up to 1/2/2.5/5 × 10^n (in euros). */
function niceMax(cents) {
  const euros = Math.max(1, cents / 100);
  const pow = 10 ** Math.floor(Math.log10(euros));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= euros);
  return step * pow * 100;
}

/** Bar with 4px rounded top, anchored to the baseline. */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function gridAndAxis(svg, { left, right, top, bottom, width, height, max }) {
  for (const f of [0, 0.5, 1]) {
    const y = top + (height - top - bottom) * (1 - f);
    svg.append(svgEl('line', { x1: left, x2: width - right, y1: y, y2: y, class: f === 0 ? 'axis' : 'grid' }));
    const label = svgEl('text', { x: left - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' });
    label.textContent = fmtShort(max * f);
    svg.append(label);
  }
}

// On touch screens tooltips stay open after a tap until the user taps elsewhere
let openTip = null;
document.addEventListener('pointerdown', (e) => {
  if (openTip && !openTip.root.contains(e.target)) openTip.hide();
});

function makeTooltip(root) {
  const tip = el('div', { className: 'chart-tip', hidden: true });
  root.append(tip);
  const tooltip = {
    show(x, rows, title) {
      tip.replaceChildren(
        el('strong', { textContent: title }),
        ...rows.map((r) =>
          el('div', { className: 'tip-row' },
            el('span', { className: `swatch ${r.dashed ? 'dashed' : ''}`, style: `--c: var(${r.color})` }),
            el('span', { textContent: r.label }),
            el('b', { textContent: fmt(r.value) }),
          ),
        ),
      );
      tip.hidden = false;
      const w = tip.offsetWidth;
      const left = Math.max(0, Math.min(root.clientWidth - w, x - w / 2));
      tip.style.left = `${left}px`;
      openTip = tooltip;
    },
    hide() {
      tip.hidden = true;
      tooltip.onHide?.();
    },
    root,
    onHide: null,
  };
  return tooltip;
}

export function legend(items) {
  return el('div', { className: 'legend' },
    items.map((i) => el('span', {}, el('span', { className: `swatch ${i.dashed ? 'dashed' : ''}`, style: `--c: var(${i.color})` }), i.label)),
  );
}

/**
 * Grouped bars per month (expenses + income). Tapping a month calls onSelect(key).
 * @param {{ key: string, label: string, expense: number, income: number }[]} months
 */
export function monthBarChart(root, months, { selectedKey, onSelect }) {
  const width = Math.max(280, root.clientWidth || 320);
  const height = 190;
  const box = { left: 36, right: 4, top: 10, bottom: 24, width, height };
  const max = niceMax(Math.max(...months.flatMap((m) => [m.expense, m.income])));
  const plotH = height - box.top - box.bottom;
  const groupW = (width - box.left - box.right) / months.length;
  const barW = Math.max(3, Math.min(14, (groupW - 8) / 2));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart', role: 'img', 'aria-label': 'Einnahmen und Ausgaben pro Monat' });
  root.replaceChildren();
  const tooltip = makeTooltip(root);

  months.forEach((m, i) => {
    const gx = box.left + i * groupW;
    if (m.key === selectedKey) svg.append(svgEl('rect', { x: gx + 1, y: box.top, width: groupW - 2, height: plotH, rx: 6, class: 'col-highlight' }));
  });
  gridAndAxis(svg, { ...box, max });

  months.forEach((m, i) => {
    const gx = box.left + i * groupW;
    const x0 = gx + (groupW - (barW * 2 + 2)) / 2;
    [['expense', '--viz-expense'], ['income', '--viz-income']].forEach(([field, color], j) => {
      const h = (m[field] / max) * plotH;
      const d = barPath(x0 + j * (barW + 2), box.top + plotH - h, barW, h);
      if (d) svg.append(svgEl('path', { d, style: `fill: var(${color})` }));
    });
    const label = svgEl('text', { x: gx + groupW / 2, y: height - 6, 'text-anchor': 'middle', class: `tick ${m.key === selectedKey ? 'selected' : ''}` });
    label.textContent = m.label;
    svg.append(label);

    const hit = svgEl('rect', { x: gx, y: 0, width: groupW, height, class: 'hit' });
    const show = () =>
      tooltip.show(gx + groupW / 2, [
        { label: 'Ausgaben', value: m.expense, color: '--viz-expense' },
        { label: 'Einnahmen', value: m.income, color: '--viz-income' },
      ], m.title ?? m.label);
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && tooltip.hide());
    hit.addEventListener('click', () => {
      show();
      onSelect?.(m.key);
    });
    svg.append(hit);
  });

  root.prepend(svg);
}

/**
 * Cumulative line chart over the days of a month.
 * @param {{ label: string, values: number[], color: string, dashed?: boolean }[]} series values in cents per day
 */
export function cumulativeChart(root, series, { days, dayLabel }) {
  const width = Math.max(280, root.clientWidth || 320);
  const height = 190;
  const box = { left: 36, right: 10, top: 10, bottom: 24, width, height };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = width - box.left - box.right;
  const plotH = height - box.top - box.bottom;
  const x = (i) => box.left + (days === 1 ? 0 : (i / (days - 1)) * plotW);
  const y = (v) => box.top + plotH - (v / max) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart', role: 'img', 'aria-label': 'Ausgaben im Monatsverlauf' });
  gridAndAxis(svg, { ...box, max });

  for (const d of [1, 8, 15, 22, days]) {
    const t = svgEl('text', { x: x(d - 1), y: height - 6, 'text-anchor': d === days ? 'end' : 'middle', class: 'tick' });
    t.textContent = `${d}.`;
    svg.append(t);
  }

  // Draw the primary series last so it stays on top
  for (const s of [...series].reverse()) {
    if (!s.values.length) continue;
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    svg.append(svgEl('path', { d, class: `line ${s.dashed ? 'dashed' : ''}`, style: `stroke: var(${s.color})` }));
  }

  // End marker for the primary (first) series
  const main = series[0];
  if (main.values.length) {
    const i = main.values.length - 1;
    svg.append(svgEl('circle', { cx: x(i), cy: y(main.values[i]), r: 4.5, class: 'dot', style: `fill: var(${main.color})` }));
  }

  const cross = svgEl('line', { y1: box.top, y2: box.top + plotH, class: 'crosshair', visibility: 'hidden' });
  const dots = series.map((s) => svgEl('circle', { r: 4, class: 'dot', style: `fill: var(${s.color})`, visibility: 'hidden' }));
  svg.append(cross, ...[...dots].reverse()); // primary dot on top

  root.replaceChildren();
  const tooltip = makeTooltip(root);
  const hit = svgEl('rect', { x: box.left, y: 0, width: plotW, height, class: 'hit' });
  const move = (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(days - 1, Math.round(((px - box.left) / plotW) * (days - 1))));
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    const rows = [];
    series.forEach((s, k) => {
      const v = s.values[i];
      dots[k].setAttribute('visibility', v == null ? 'hidden' : 'visible');
      if (v == null) return;
      dots[k].setAttribute('cx', x(i));
      dots[k].setAttribute('cy', y(v));
      rows.push({ label: s.label, value: v, color: s.color, dashed: s.dashed });
    });
    tooltip.show(x(i), rows, dayLabel(i + 1));
  };
  tooltip.onHide = () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && tooltip.hide());
  svg.append(hit);

  root.prepend(svg);
}
