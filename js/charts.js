// 차트(SVG 문자열). 한 축에 한 가지 단위만 쓰고(가격과 거래량은 따로 그린다), 가리키면 값이 뜬다.
import { $app, esc, eokman } from './util.js';

export const eok = (n) => (n === null || n === undefined ? '-' : `${(n / 1e8).toFixed(n >= 1e9 ? 1 : 2).replace(/\.?0+$/, '')}억`);
export const ymLabel = (ym) => `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;

export function sparkline(values, { w = 120, h = 34 } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number');
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const min = Math.min(...pts.map((p) => p[1])); const max = Math.max(...pts.map((p) => p[1])); const span = max - min || 1;
  const X = (i) => 3 + (i / Math.max(1, values.length - 1)) * (w - 6); const Y = (v) => h - 4 - ((v - min) / span) * (h - 8);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="2.6"/></svg>`;
}
const niceTicks = (min, max, n = 4) => { const span = max - min || 1; const step0 = span / n; const mag = 10 ** Math.floor(Math.log10(step0)); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0; const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) out.push(v); return out; };
// 값이 있는 점끼리만 잇는다(거래 없는 달에서 선이 끊긴다). 한 점만 남으면 점으로 찍는다.
const segments = (values, X, Y) => { const segs = []; let cur = []; values.forEach((v, i) => { if (typeof v === 'number') cur.push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur); return segs; };

// 월별 선 차트. points: [{label, value, sub}], compare: 같은 축에 점선으로 겹쳐 그릴 비교 계열 { label, points: [값…] }(points와 길이가 같다),
// dots: 개별 거래 점 [{x(0~n-1 소수), value, tip}], refLines: [{value, label}], yFormat: 축 눈금 글자, tipFormat: 가리켰을 때 값 글자
export function lineChart({ id, points, compare = null, mainLabel = '', dots = [], refLines = [], height = 230, title, yFormat = eok, tipFormat = eokman }) {
  const W = 720; const H = height; const m = { l: 52, r: 16, t: 14, b: 26 };
  const cmp = compare && compare.points.some((v) => typeof v === 'number') ? compare : null;
  const vals = [...points.map((p) => p.value), ...dots.map((d) => d.value), ...(cmp ? cmp.points : [])].filter((v) => typeof v === 'number');
  if (!points.some((p) => typeof p.value === 'number') && !dots.length) return `<div class="chart-box">${title ? `<div class="chart-title">${esc(title)}</div>` : ''}<p class="small muted" style="padding:18px">이 조건의 거래가 없어 추이를 그릴 수 없습니다.</p></div>`;
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  const refs = refLines.filter((r) => typeof r.value === 'number' && r.value >= lo * 0.7 && r.value <= hi * 1.3);
  for (const r of refs) { lo = Math.min(lo, r.value); hi = Math.max(hi, r.value); }
  const pad = (hi - lo || hi * 0.1) * 0.1; lo -= pad; hi += pad;
  const n = points.length; const X = (i) => m.l + (n <= 1 ? 0.5 : i / (n - 1)) * (W - m.l - m.r); const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const ticks = niceTicks(lo, hi, 4);
  const draw = (segs, cls) => segs.map((s) => (s.length > 1 ? `<polyline class="line${cls}" points="${s.join(' ')}"/>` : `<circle class="pt${cls}" cx="${s[0].split(',')[0]}" cy="${s[0].split(',')[1]}" r="3.5"/>`)).join('');
  const every = Math.ceil(n / 8);
  const tip = (p, i) => `${p.label} · ${typeof p.value === 'number' ? tipFormat(p.value) : '거래 없음'}${p.sub ? ` · ${p.sub}` : ''}${cmp && typeof cmp.points[i] === 'number' ? ` · ${cmp.label} ${tipFormat(cmp.points[i])}` : ''}`;
  return `<figure class="chart-box" id="${id}" data-chart>
    ${title ? `<figcaption class="chart-title">${esc(title)}</figcaption>` : ''}
    ${cmp ? `<div class="chart-legend small"><span><i class="lg-line solid"></i>${esc(mainLabel || '이 지구')}</span><span><i class="lg-line dashed"></i>${esc(cmp.label)}</span></div>` : ''}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '추이 차트')}">
      ${ticks.map((t) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="axis" x="${m.l - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${esc(yFormat(t))}</text>`).join('')}
      ${points.map((p, i) => (i % every === 0 || i === n - 1 ? `<text class="axis" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('')}
      ${refs.map((r) => `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${Y(r.value).toFixed(1)}" y2="${Y(r.value).toFixed(1)}"/><text class="ref-label" x="${W - m.r - 4}" y="${(Y(r.value) - 5).toFixed(1)}" text-anchor="end">${esc(r.label)} ${esc(yFormat(r.value))}</text>`).join('')}
      ${dots.map((d) => `<circle class="dot" cx="${X(d.x).toFixed(1)}" cy="${Y(d.value).toFixed(1)}" r="3.2"><title>${esc(d.tip)}</title></circle>`).join('')}
      ${cmp ? draw(segments(cmp.points, X, Y), ' cmp') : ''}
      ${draw(segments(points.map((p) => p.value), X, Y), '')}
      <line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" hidden/><circle class="marker" r="5" hidden/>
      ${points.map((p, i) => `<rect class="hit" x="${(X(i) - (W - m.l - m.r) / Math.max(1, n - 1) / 2).toFixed(1)}" y="${m.t}" width="${((W - m.l - m.r) / Math.max(1, n - 1)).toFixed(1)}" height="${H - m.t - m.b}" data-i="${i}" data-x="${X(i).toFixed(1)}" data-y="${typeof p.value === 'number' ? Y(p.value).toFixed(1) : ''}" data-tip="${esc(tip(p, i))}"/>`).join('')}
    </svg>
    <div class="chart-tip" hidden></div>
  </figure>`;
}
// 월별 막대 차트(거래량). 가격 차트와 축을 섞지 않도록 따로 그린다.
export function barChart({ id, points, height = 120, title, unit = '건' }) {
  const W = 720; const H = height; const m = { l: 52, r: 16, t: 10, b: 24 };
  const max = Math.max(1, ...points.map((p) => p.value || 0)); const n = points.length;
  const bw = (W - m.l - m.r) / n; const Y = (v) => m.t + (1 - v / max) * (H - m.t - m.b); const every = Math.ceil(n / 8);
  const ticks = niceTicks(0, max, 2).filter((t) => t > 0);
  return `<figure class="chart-box" id="${id}" data-chart>
    ${title ? `<figcaption class="chart-title">${esc(title)}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '거래량')}">
      ${ticks.map((t) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="axis" x="${m.l - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${t}</text>`).join('')}
      <line class="grid base" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>
      ${points.map((p, i) => { const h = Math.max(0, H - m.b - Y(p.value || 0)); const x = m.l + i * bw + 1; const w = Math.max(2, bw - 2); const r = Math.min(4, h, w / 2); return `${h > 0 ? `<path class="bar" d="M${x.toFixed(1)},${H - m.b} v${-(h - r).toFixed(1)} q0,${-r} ${r},${-r} h${(w - 2 * r).toFixed(1)} q${r},0 ${r},${r} v${(h - r).toFixed(1)} z"/>` : ''}${i % every === 0 || i === n - 1 ? `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(p.label)}</text>` : ''}<rect class="hit" x="${(m.l + i * bw).toFixed(1)}" y="${m.t}" width="${bw.toFixed(1)}" height="${H - m.t - m.b}" data-x="${(x + w / 2).toFixed(1)}" data-tip="${esc(`${p.label} · ${p.value || 0}${unit}`)}"/>`; }).join('')}
      <line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" hidden/>
    </svg><div class="chart-tip" hidden></div></figure>`;
}
export function bindCharts(root = $app) {
  for (const box of root.querySelectorAll('[data-chart]')) {
    const svg = box.querySelector('svg'); const tip = box.querySelector('.chart-tip'); const cross = box.querySelector('.cross'); const marker = box.querySelector('.marker');
    const show = (hit) => {
      const r = svg.getBoundingClientRect(); const scale = r.width / 720; const x = Number(hit.dataset.x);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.removeAttribute('hidden');
      if (marker) { if (hit.dataset.y) { marker.setAttribute('cx', x); marker.setAttribute('cy', hit.dataset.y); marker.removeAttribute('hidden'); } else marker.setAttribute('hidden', ''); }
      tip.textContent = hit.dataset.tip; tip.hidden = false;
      const left = Math.min(Math.max(4, x * scale - tip.offsetWidth / 2), r.width - tip.offsetWidth - 4); tip.style.left = `${left}px`;
    };
    const hide = () => { tip.hidden = true; cross.setAttribute('hidden', ''); if (marker) marker.setAttribute('hidden', ''); };
    for (const hit of box.querySelectorAll('.hit')) { hit.addEventListener('pointerenter', () => show(hit)); hit.addEventListener('pointerdown', () => show(hit)); }
    svg.addEventListener('pointerleave', hide);
  }
}
