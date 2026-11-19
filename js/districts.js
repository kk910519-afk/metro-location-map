// 지구별 입지: 지도(신설 노선·역·지구)와 비교표. 지도에는 아파트가 아니라 지구만 올리고, 지구를 고르면 그 안의 단지를 찾는다.
import { $app, api, esc, eokman, icon, toast, opt, local, dt, isPublic } from './util.js';
import { getMapKit } from './mapkit.js';
import { TIER_COLORS, RAMP, NEUTRAL_PIN } from './colors.js';
import { safeHref } from './links.js';
import { notesHtml, bindNotes, watchPanel, bindWatchPanel, eok } from './market.js';

// 급지 도입 때 저장 키를 바꿨다: 권역·관심·선택은 이어받고, 정렬·지도 표시는 급지 기준으로 새로 시작한다
const old = local.get('districts.v1', {});
const st = { group: old.group || 'all', pinnedOnly: !!old.pinnedOnly, sort: 'tier', metric: 'tier', sel: old.sel || null, ...local.get('districts.v2', {}) };
const persist = () => local.set('districts.v2', { group: st.group, pinnedOnly: st.pinnedOnly, sort: st.sort, metric: st.metric, sel: st.sel });
const METRICS = { tier: '급지 (지금 · 미래)', transit: '교통 (지금 · 개통 후)', school: '학군', living: '생활', overall: '별점 평균 (시세 제외)' };
const METRIC_NAME = { tier: '급지', overall: '별점 평균', transit: '교통', school: '학군', living: '생활' };
const tierColor = (t) => TIER_COLORS[t] || NEUTRAL_PIN;
export const tierBadge = (t) => (t ? `<b class="tier-badge" style="--c:${tierColor(t)[0]};--f:${tierColor(t)[1]}">${t}급</b>` : '<span class="stars-none">미정</span>');
// '5급 → 4급' 꼴: 지금 → 미래
const tierTwo = (t) => (t?.tier ? `<span class="dz-two">${tierBadge(t.tier)} <span class="arrow">→</span> ${tierBadge(t.tierFuture)}</span>` : '');
const man = (won) => `${Math.round(won / 10000).toLocaleString('ko-KR')}만 원`;
// 지도 핀에 올릴 값. 종합·교통은 [지금, 개통 후] 두 개, 학군·생활은 하나.
const pinValues = (d, key) => (key === 'tier' ? [d.tier?.tier ?? null, d.tier?.tierFuture ?? null] : key === 'overall' ? [d.scores.overallNow, d.scores.overallFuture] : key === 'transit' ? [d.scores.transitNow.stars, d.scores.transitFuture.stars] : [d.scores[key]?.stars ?? null]);
const isTwo = (key) => key === 'tier' || key === 'overall' || key === 'transit';
const num1 = (v) => (v === null || v === undefined ? null : Number(v).toFixed(1));
// '3.7 → 4.0' 꼴: 지금 → 개통 후
const twoHtml = (a, b) => (num1(a) === null && num1(b) === null ? '<span class="stars-none">미확인</span>' : `<span class="dz-two">${num1(a) ?? '?'} <span class="arrow">→</span> <b>${num1(b) ?? '?'}</b></span>`);
const prices = new Map(); // 지구별 가격 요약(국평 기준). 관심 지구는 자동, 나머지는 눌렀을 때만 불러온다.
let mapObj = null; let mapMarkers = [];
let weightsOpen = false;   // 비중 조정 패널을 열어 둔 상태(다시 그려도 유지)
const W_KEYS = [['price', '시세'], ['transit', '교통'], ['school', '학군'], ['living', '생활']];
const wText = (w) => W_KEYS.map(([k, label]) => `${label} ${w[k]}`).join(' · ');
const PRESETS = [['기본', { price: 50, transit: 25, school: 15, living: 10 }], ['교통 중심', { price: 30, transit: 45, school: 15, living: 10 }], ['학군 중심', { price: 30, transit: 20, school: 40, living: 10 }],
  ['시세 중심', { price: 70, transit: 15, school: 10, living: 5 }], ['시세 빼고 입지만', { price: 0, transit: 50, school: 30, living: 20 }]];
let tierAutoTried = false; // 급지 시세 자동 불러오기는 한 번만 시도한다
let fitAll = null;   // 보이는 지구 전체가 들어오게 지도를 맞춘다
let closeBig = null; // 크게 보기를 닫는다(뒤로 가기·Esc에서 부른다)
const FOCUS_ZOOM = 11.3; // 지구를 눌렀을 때 확대하는 정도(지구 이름과 역 이름이 보이는 수준)

// ---------- 별점 ----------
export function starsHtml(v, { low = false, compact = false } = {}) {
  if (v === null || v === undefined) return '<span class="stars-none">미확인</span>';
  return `<span class="stars-wrap"><span class="stars" role="img" aria-label="5점 만점에 ${v}점${low ? ', 근거 약함' : ''}"><span class="stars-bg">★★★★★</span><span class="stars-fg" style="width:${v * 20}%">★★★★★</span></span><span class="stars-num">${Number(v).toFixed(1)}</span>${low ? (compact ? '<abbr class="stars-low" title="근거가 약한 평가입니다">*</abbr>' : '<span class="tag stars-lowtag">근거 약함</span>') : ''}</span>`;
}
export const isLow = (s) => s?.basis === 'research' && s.confidence === 'low';
const basisTag = (s) => (s.basis === 'mine' ? '<span class="tag">내 점수</span>' : s.basis === 'research' ? '<span class="tag">조사 자료</span>' : '');
export const hubCell = (h) => (h.now ? `${h.now.min}분${h.future ? ` <span class="arrow">→</span> <b>${h.future.min}분</b>` : ''}` : h.future ? `<span class="muted">?</span> <span class="arrow">→</span> <b>${h.future.min}분</b>` : '<span class="muted">미확인</span>');
export const srcLinks = (xs) => (xs || []).slice(0, 4).map((x) => `<a href="${esc(safeHref(x.url))}" target="_blank" rel="noopener">${esc(x.title || '출처')}</a>`).join(' · ');
export const regBadge = (r) => (r.regulated === true ? `<span class="badge badge-warn">규제지역${r.landPermit === true ? ' · 토지거래허가' : ''}</span>` : r.regulated === false ? '<span class="badge badge-muted">비규제</span>' : '<span class="badge badge-muted">규제 미확인</span>');

// 급지 점수 구성. 줄마다 얻은 점수/배점과 근거 값, 순위를 보여준다. full이면 계산 기준도 덧붙인다.
function tierParts(d, full) {
  const t = d.tier; if (!t?.tier) return '';
  const p = t.parts; const rk = t.rank || {}; const of = rk.of ? `${rk.of}곳 중 ` : '';
  const pct = (v, max) => (max > 0 ? Math.round((v / max) * 100) : 0);
  const line = (label, part, detail, future = null) => `<div class="tp-row${part.max > 0 ? '' : ' off'}"><span class="tp-l">${label}</span><span class="tp-bar" role="img" aria-label="${label} ${part.points ?? 0}점, 배점 ${part.max}점"><i style="width:${pct(part.points ?? 0, part.max)}%"></i>${future !== null && future > (part.points ?? 0) ? `<u style="left:${pct(part.points ?? 0, part.max)}%;width:${pct(future - (part.points ?? 0), part.max)}%"></u>` : ''}</span><span class="tp-v"><b>${part.points ?? '-'}</b>${future !== null && future !== part.points ? ` → <b>${future}</b>` : ''} / ${part.max}</span><span class="tp-d">${detail}</span></div>`;
  const s = d.scores;
  return `<div class="tier-parts">
    ${line('시세', p.price, `㎡당 ${man(p.price.perM2)} · 전용 84㎡로 환산하면 ${esc(eokman(p.price.perM2 * 84))} · 최근 3개월 ${p.price.count}건${rk.price ? ` · ${of}${rk.price}위` : ''}`)}
    ${line('교통', p.transit, `${s.transitNow.avgMin ?? '?'}분${s.transitFuture.avgMin !== null && s.transitFuture.avgMin !== s.transitNow.avgMin ? ` → ${s.transitFuture.avgMin}분` : ''} (세 업무지구 평균)${rk.transit ? ` · ${of}${rk.transit}위${rk.transitFuture && rk.transitFuture !== rk.transit ? ` → ${rk.transitFuture}위` : ''}` : ''}`, p.transit.pointsFuture)}
    ${line('학군', p.school, `${p.school.points === null ? '평가 없음(0점 처리)' : `별점 ${s.school.stars}`}${rk.school ? ` · ${of}${rk.school}위` : ''}`)}
    ${line('생활', p.living, `${p.living.points === null ? '평가 없음(0점 처리)' : `별점 ${s.living.stars}`}${rk.living ? ` · ${of}${rk.living}위` : ''}`)}
    ${full ? `<p class="small muted">급지는 100점 만점(시세 ${p.price.max} · 교통 ${p.transit.max} · 학군 ${p.school.max} · 생활 ${p.living.max})으로 매기고 85점 이상 1급, 10점 내려갈 때마다 한 급씩 내려가 35점 미만이 7급입니다. 시세 점수는 ㎡당 500만 원이 0점, 4,000만 원이 만점인 배수 눈금입니다. 미래 급지는 교통만 개통 후 점수로 바꿔 다시 계산한 것이며, 시세가 그만큼 오른다는 뜻은 아닙니다.</p>` : ''}
  </div>`;
}

// 지구 점수 카드. full이면 근거·출처·역별 시간까지 보여준다.
export function scoreCard(d, { full = false, stationLinks = {}, hubs = [] } = {}) {
  const s = d.scores; const tf = s.transitFuture; const t = d.tier;
  const row = (label, body, reason, extra = '') => `<div class="sc-row"><div class="sc-label">${label}</div><div class="sc-stars">${body}</div><div class="sc-reason">${reason}${extra}</div></div>`;
  const research = (x) => `${esc(x.reason || '')} ${basisTag(x)}${isLow(x) ? '<span class="tag stars-lowtag">근거 약함</span>' : ''}${full && x.facts?.length ? `<ul class="sc-facts">${x.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}${full && x.sources?.length ? `<div class="small">${srcLinks(x.sources)}</div>` : ''}`;
  const regions = [...new Map(d.region.map((r) => [r.sigungu, r])).values()];
  return `<div class="score-card">
    <div class="sc-head"><div><span class="sc-overall">${t?.tier ? `급지 <span class="sc-when">지금</span>${tierBadge(t.tier)} <span class="arrow">→</span> <span class="sc-when">미래</span>${tierBadge(t.tierFuture)}` : `급지 <span class="muted">${d.planned ? '입주 전(시세 없음)' : '미정(시세를 불러와야 합니다)'}</span>`}</span>${t?.tier ? ` <span class="small muted">${t.score}점${t.scoreFuture !== t.score ? ` → ${t.scoreFuture}점` : ''}${t.rank ? ` · ${t.rank.of}곳 중 ${t.rank.score}위${t.rank.scoreFuture !== t.rank.score ? ` → ${t.rank.scoreFuture}위` : ''}` : ''}${t.partial ? ' · 일부 항목 미확인' : ''}</span>` : ''}</div>
      <div class="row sc-tags">${d.planned ? '<span class="badge badge-accent">입주 전 예정 지구</span>' : ''}${regions.map((r) => `<span title="${esc(r.sigungu)}">${regBadge(r)}</span>`).join('')}</div></div>
    ${tierParts(d, full)}
    ${row('교통 · 지금', starsHtml(s.transitNow.stars), esc(s.transitNow.reason))}
    ${row('교통 · 개통 후', starsHtml(tf.stars), esc(tf.reason), tf.changed ? ' <span class="tag">추정</span>' : '')}
    ${row('학군', starsHtml(s.school.stars), research(s.school))}
    ${row('생활 인프라', starsHtml(s.living.stars), research(s.living))}
    <div class="hub-chips">${s.transitNow.hubs.map((h) => `<span class="hub-chip"><span class="muted">${esc(h.name)}</span> ${hubCell(h)}</span>`).join('')}</div>
    ${full ? `${s.stations.length ? `<details class="small sc-more" open><summary>기준 역별 소요시간</summary><div class="table-wrap"><table><tr><th>역</th>${hubs.map((h) => `<th class="num">${esc(h.name)}</th>`).join('')}<th>길찾기</th></tr>
      ${s.stations.map((x) => `<tr><td><b>${esc(x.name)}</b> ${x.open ? '' : '<span class="tag">미개통·지점 기준</span>'}<div class="muted">${esc(x.lines.join(' · ') || '기존 노선')}${x.coordSource === 'approx' ? ' · 대략 위치' : ''}</div></td>${hubs.map((h) => { const t = x.times[h.id]; return `<td class="num">${t.now === null ? '-' : `${t.now}분`}${t.future !== null && (t.now === null || t.future < t.now) ? ` → <b>${t.future}분</b>` : ''}</td>`; }).join('')}<td>${(stationLinks[x.name] || []).map((l) => `<a href="${esc(safeHref(l.url))}" target="_blank" rel="noopener">${esc(l.hub)}</a>`).join(' · ') || '-'}</td></tr>`).join('')}</table></div></details>` : ''}
      <p class="small muted">교통 시간은 역(또는 지구 대표 지점)에서 출발하는 기준이라 집에서 역까지 가는 시간은 빠져 있습니다. '개통 후'는 거리와 속도로 계산한 추정치입니다. 학군·생활은 AI가 공개 자료를 찾아 매긴 대략적인 평가이며 통계 점수가 아닙니다.</p>` : ''}
  </div>`;
}

// ---------- 지도 ----------
const pinColor = (v) => (v === null || v === undefined ? NEUTRAL_PIN : RAMP.find(([min]) => v >= min).slice(1));
function clearMap() { for (const m of mapMarkers) m.remove(); mapMarkers = []; if (mapObj) { mapObj.remove(); mapObj = null; } }
let lastDraw = null; // 테마가 바뀌면 같은 내용으로 지도를 다시 그린다
async function drawMap(list, transit, onPick) {
  const host = document.getElementById('dz-map'); if (!host) return;
  lastDraw = [list, transit, onPick];
  const kit = await getMapKit();
  if (!kit) { host.innerHTML = '<p class="small muted" style="padding:16px">지도를 불러오지 못했습니다. 아래 표로 확인하세요.</p>'; return; }
  clearMap();
  const ML = kit.ML; const css = getComputedStyle(document.documentElement); const ink = css.getPropertyValue('--ink').trim() || '#2F2A24'; const panel = css.getPropertyValue('--panel').trim() || '#fff';
  mapObj = new ML.Map({ container: host, style: kit.style, center: [126.99, 37.5], zoom: 9.2, minZoom: 7.5, maxZoom: 15, attributionControl: { compact: true } });
  const pts = list.filter((d) => d.center);
  const bounds = new ML.LngLatBounds(); for (const d of pts) bounds.extend([d.center.lng, d.center.lat]);
  fitAll = (animate = true) => { if (mapObj && pts.length) mapObj.fitBounds(bounds, { padding: 46, maxZoom: 12, animate }); };
  fitAll(false);
  mapObj.addControl(new ML.NavigationControl({ showCompass: false }), 'bottom-right');
  const zoomClass = () => host.classList.toggle('zoomed', mapObj.getZoom() >= 10.4);
  mapObj.on('zoom', zoomClass); zoomClass();
  mapObj.on('load', () => {
    if (transit?.available) {
      const feats = []; for (const l of transit.lines) for (const s of l.segments) feats.push({ type: 'Feature', properties: { id: l.id, name: l.name, color: l.color, open: s.open }, geometry: { type: 'LineString', coordinates: s.coords } });
      mapObj.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
      mapObj.addLayer({ id: 'lines-open', type: 'line', source: 'lines', filter: ['==', ['get', 'open'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4 } });
      mapObj.addLayer({ id: 'lines-plan', type: 'line', source: 'lines', filter: ['==', ['get', 'open'], false], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1.4, 1.4] } });
      const onLine = new Set(transit.lines.flatMap((l) => l.stations));
      mapObj.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: transit.stations.filter((s) => onLine.has(s.name)).map((s) => ({ type: 'Feature', properties: { name: s.name, open: s.open, lines: s.lines.map((l) => l.name).join(' · '), approx: s.coordSource === 'approx' }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) } });
      mapObj.addLayer({ id: 'st', type: 'circle', source: 'stations', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.2, 12, 5], 'circle-color': ['case', ['get', 'open'], ink, panel], 'circle-stroke-color': ink, 'circle-stroke-width': 1.4 } });
      if (kit.vector) mapObj.addLayer({ id: 'st-label', type: 'symbol', source: 'stations', minzoom: 10.6, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': ink, 'text-halo-color': panel, 'text-halo-width': 1.4 } });
      mapObj.on('click', 'st', (e) => { const p = e.features[0].properties; new ML.Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setHTML(`<b>${esc(p.name)}역</b><div class="small">${esc(p.lines)}${p.open === true || p.open === 'true' ? '' : ' · 미개통'}${p.approx === true || p.approx === 'true' ? ' · 대략 위치' : ''}</div>`).addTo(mapObj); });
      mapObj.on('mouseenter', 'st', () => { mapObj.getCanvas().style.cursor = 'pointer'; }); mapObj.on('mouseleave', 'st', () => { mapObj.getCanvas().style.cursor = ''; });
    }
  });
  for (const h of transit?.hubs || []) { const el = document.createElement('div'); el.className = 'dz-hub'; el.textContent = h.name; mapMarkers.push(new ML.Marker({ element: el, anchor: 'center' }).setLngLat([h.lng, h.lat]).addTo(mapObj)); }
  for (const d of list) {
    if (!d.center) continue;
    const vals = pinValues(d, st.metric); const two = vals.length === 2;
    const el = document.createElement('button'); el.type = 'button'; el.className = `dz-pin${d.pinned ? ' pinned' : ''}${d.planned ? ' planned' : ''}${st.sel === d.id ? ' sel' : ''}`; el.dataset.id = d.id;
    const isTier = st.metric === 'tier';
    const say = (v) => (v === null || v === undefined ? (isTier && d.planned ? '입주 전' : '미확인') : isTier ? `${v}급` : `${num1(v)}점`);
    el.setAttribute('aria-label', two ? `${d.name} ${METRIC_NAME[st.metric]} 지금 ${say(vals[0])}, ${isTier ? '미래' : '개통 후'} ${say(vals[1])}` : `${d.name} ${METRIC_NAME[st.metric]} ${say(vals[0])}`);
    // 위 칸이 지금, 아래 칸이 미래(개통 후). 칸마다 자기 값의 색을 쓴다.
    const cell = (v) => { const [bg, fg] = isTier ? tierColor(v) : pinColor(v); return `<span class="pv" style="--c:${bg};--f:${fg}">${v === null || v === undefined ? '?' : isTier ? `${v}급` : num1(v)}</span>`; };
    el.innerHTML = `<span class="dz-pin-score${two ? ' two' : ''}">${isTier && vals[0] === null ? `<span class="pv" style="--c:${NEUTRAL_PIN[0]};--f:${NEUTRAL_PIN[1]}">${d.planned ? '예정' : '?'}</span>` : vals.map(cell).join('')}</span><span class="dz-pin-name">${esc(d.name)}</span>`;
    el.onclick = (e) => { e.stopPropagation(); onPick(d.id); };
    mapMarkers.push(new ML.Marker({ element: el, anchor: 'center' }).setLngLat([d.center.lng, d.center.lat]).addTo(mapObj));
  }
}
const markSelected = () => { for (const el of document.querySelectorAll('.dz-pin')) el.classList.toggle('sel', el.dataset.id === st.sel); for (const el of document.querySelectorAll('.dz-row[data-id]')) el.classList.toggle('sel', el.dataset.id === st.sel); };

// ---------- 화면: 지구 지도 + 비교표 ----------
export async function districtsHome() {
  $app.innerHTML = '<p class="muted">지구 자료를 불러오는 중…</p>';
  const [data, transit, cfg, wl] = await Promise.all([api('api/market/districts'), api('api/market/transit'), api('api/market/config'), api('api/market/watchlist').catch(() => ({ items: [] }))]);
  const all = data.districts; const groups = [...new Set(all.map((d) => d.group))];
  if (st.group !== 'all' && !groups.includes(st.group)) st.group = 'all';
  const loadPrices = async (ids) => {
    if (!data.configured) return;
    const step = isPublic() ? Math.max(1, ids.length) : 4; // 공개 사이트는 가격 요약이 한 파일이라 한 번에 읽는다
    for (let i = 0; i < ids.length; i += step) {
      const chunk = ids.slice(i, i + step); for (const id of chunk) prices.set(id, { loading: true }); renderTable();
      try { const r = await api(`api/market/overview?months=12&band=s84&ids=${chunk.join(',')}`); if (r.ok) for (const a of r.areas) prices.set(a.id, a); else for (const id of chunk) prices.set(id, { error: r.error?.message || '조회 실패' }); }
      catch (e) { for (const id of chunk) prices.set(id, { error: e.message }); }
      renderTable();
    }
  };
  const visible = () => all.filter((d) => (st.group === 'all' || d.group === st.group) && (!st.pinnedOnly || d.pinned));
  const sorters = {
    tier: (a, b) => (b.tier?.score ?? -1) - (a.tier?.score ?? -1), tierFuture: (a, b) => (b.tier?.scoreFuture ?? -1) - (a.tier?.scoreFuture ?? -1),
    overallFuture: (a, b) => (b.scores.overallFuture ?? -1) - (a.scores.overallFuture ?? -1) || (b.scores.overallNow ?? -1) - (a.scores.overallNow ?? -1), overallNow: (a, b) => (b.scores.overallNow ?? -1) - (a.scores.overallNow ?? -1) || (b.scores.overallFuture ?? -1) - (a.scores.overallFuture ?? -1), now: (a, b) => (a.scores.transitNow.avgMin ?? 999) - (b.scores.transitNow.avgMin ?? 999), future: (a, b) => (a.scores.transitFuture.avgMin ?? 999) - (b.scores.transitFuture.avgMin ?? 999),
    saved: (a, b) => (b.scores.transitFuture.savedTotal || 0) - (a.scores.transitFuture.savedTotal || 0), school: (a, b) => (b.scores.school.stars ?? -1) - (a.scores.school.stars ?? -1), living: (a, b) => (b.scores.living.stars ?? -1) - (a.scores.living.stars ?? -1),
    price: (a, b) => (prices.get(a.id)?.recentMedianPrice ?? 9e15) - (prices.get(b.id)?.recentMedianPrice ?? 9e15), name: (a, b) => a.name.localeCompare(b.name, 'ko') };
  const priceCell = (d) => {
    if (d.planned) return '<span class="muted">입주 전</span>';
    const p = prices.get(d.id);
    if (!p) return data.configured ? `<button type="button" class="btn small secondary" data-price="${d.id}">가격 보기</button>` : '<span class="muted">인증키 없음</span>';
    if (p.loading) return '<span class="muted">불러오는 중…</span>'; if (p.error) return `<span class="muted" title="${esc(p.error)}">조회 실패</span>`;
    return p.recentMedianPrice === null || p.recentMedianPrice === undefined ? '<span class="muted">최근 거래 없음</span>' : `<b>${esc(eok(p.recentMedianPrice))}</b><div class="small muted">최근 3개월 ${p.recentCount}건${p.medianBuildYear ? ` · 준공 중앙 ${Math.round(p.medianBuildYear)}년` : ''}</div>`;
  };
  const rowHtml = (d) => { const s = d.scores; return `<div class="dz-row${st.sel === d.id ? ' sel' : ''}" data-id="${d.id}">
      <button type="button" class="star ${d.pinned ? 'on' : ''}" data-pin="${d.id}" aria-pressed="${d.pinned}" aria-label="${d.pinned ? '관심 지구에서 빼기' : '관심 지구로 표시'}" title="관심 지구">${d.pinned ? '★' : '☆'}</button>
      <div class="dz-name"><a href="#/market/area/${d.id}"><b>${esc(d.name)}</b></a><div class="small muted">${esc(d.group)}${d.planned ? ' · 입주 전' : ''}${d.region.some((r) => r.landPermit === true) ? ' · 토허' : ''}</div></div>
      <div class="dz-c dz-tier"><span class="lbl">급지</span>${d.tier?.tier ? `${tierTwo(d.tier)}<span class="small muted">${d.tier.score}점</span>` : `<span class="muted">${d.planned ? '입주 전' : '미정'}</span>`}</div>
      <div class="dz-c"><span class="lbl">교통 지금</span>${starsHtml(s.transitNow.stars, { compact: true })}</div>
      <div class="dz-c"><span class="lbl">개통 후</span>${starsHtml(s.transitFuture.stars, { compact: true })}</div>
      <div class="dz-c"><span class="lbl">학군</span>${starsHtml(s.school.stars, { compact: true, low: isLow(s.school) })}</div>
      <div class="dz-c"><span class="lbl">생활</span>${starsHtml(s.living.stars, { compact: true, low: isLow(s.living) })}</div>
      ${s.transitNow.hubs.map((h) => `<div class="dz-c dz-hubcell"><span class="lbl">${esc(h.name)}</span>${hubCell(h)}</div>`).join('')}
      <div class="dz-c dz-price"><span class="lbl">국평(84㎡) 가격</span>${priceCell(d)}</div></div>`; };
  function renderTable() {
    const box = document.getElementById('dz-table'); if (!box) return;
    const list = visible().sort(sorters[st.sort] || sorters.tier);
    box.innerHTML = `<div class="dz-row dz-headrow"><span></span><div>지구</div><div>급지 <span class="hd-sub">지금 → 미래</span></div><div>교통 지금</div><div>개통 후</div><div>학군</div><div>생활</div>${data.hubs.map((h) => `<div>${esc(h.name)}</div>`).join('')}<div>국평(84㎡) 가격</div></div>${list.map(rowHtml).join('') || '<p class="small muted" style="padding:12px">조건에 맞는 지구가 없습니다.</p>'}`;
    document.getElementById('dz-count').textContent = `${list.length}곳`;
    for (const b of box.querySelectorAll('[data-pin]')) b.onclick = async (e) => { e.stopPropagation(); const d = all.find((x) => x.id === b.dataset.pin); d.pinned = !d.pinned; try { await api('api/market/pin', { method: 'PUT', body: { id: d.id, pinned: d.pinned } }); toast(d.pinned ? '관심 지구로 표시했습니다' : '관심 지구에서 뺐습니다'); } catch (err) { d.pinned = !d.pinned; toast(err.message, true); } renderTable(); for (const el of document.querySelectorAll(`.dz-pin[data-id="${d.id}"]`)) el.classList.toggle('pinned', d.pinned); };
    for (const b of box.querySelectorAll('[data-price]')) b.onclick = (e) => { e.stopPropagation(); loadPrices([b.dataset.price]); };
    for (const r of box.querySelectorAll('.dz-row[data-id]')) r.onclick = (e) => { if (e.target.closest('a,button')) return; pick(r.dataset.id, false); };
  }
  function renderSel() {
    const box = document.getElementById('dz-sel'); if (!box) return; const d = all.find((x) => x.id === st.sel);
    const head = d ? `<div class="row spread dz-sel-head"><h3>${esc(d.name)} <span class="small muted">${esc(d.group)}</span></h3><a class="btn small" id="dz-go" href="#/market/area/${d.id}">상세분석 보기 →</a></div>` : '';
    if (!d) box.innerHTML = `<p class="small muted">${isBig() ? '지구를 누르면 상세분석 페이지로 갑니다.' : '지도의 지구를 누르면 상세분석 페이지로 갑니다. 아래 표의 줄을 누르면 지도가 그 지구로 확대되고 점수와 사유가 여기에 나옵니다.'}</p>`;
    else if (isBig()) { const s = d.scores; const mini = (label, body) => `<span><span class="mini-lbl">${label}</span>${body}</span>`;
      box.innerHTML = `${head}<div class="dz-mini">${mini('급지', d.tier?.tier ? `${tierTwo(d.tier)} <span class="muted">${d.tier.score}점</span>` : `<span class="muted">${d.planned ? '입주 전' : '미정'}</span>`)}${mini('교통 지금', starsHtml(s.transitNow.stars, { compact: true }))}${mini('개통 후', starsHtml(s.transitFuture.stars, { compact: true }))}${mini('학군', starsHtml(s.school.stars, { compact: true, low: isLow(s.school) }))}${mini('생활', starsHtml(s.living.stars, { compact: true, low: isLow(s.living) }))}</div>
        <div class="hub-chips">${s.transitNow.hubs.map((h) => `<span class="hub-chip"><span class="muted">${esc(h.name)}</span> ${hubCell(h)}</span>`).join('')}</div>`; }
    else box.innerHTML = `${head}<a class="dz-sel-card" href="#/market/area/${d.id}" aria-label="${esc(d.name)} 상세분석 보기">${d.note ? `<p class="small muted">${esc(d.note)}</p>` : ''}${scoreCard(d)}</a>`;
    // 크게 보기에서 지구 화면으로 넘어갈 때는 크게 보기용 기록을 먼저 지워 뒤로 가기가 한 번 헛돌지 않게 한다
    const go = document.getElementById('dz-go'); if (go) go.onclick = (e) => { if (!isBig() || !history.state?.dzBig) return; e.preventDefault(); const to = go.getAttribute('href'); window.addEventListener('popstate', () => { location.hash = to; }, { once: true }); setBig(false); };
  }
  const isBig = () => !!document.querySelector('.dz-map-panel.big');
  function setBig(on, fromHistory = false) {
    const panel = document.querySelector('.dz-map-panel'); if (!panel || panel.classList.contains('big') === on) return;
    panel.classList.toggle('big', on); document.body.classList.toggle('dz-noscroll', on);
    const b = document.getElementById('dz-big'); if (b) { b.textContent = on ? '닫기' : '크게 보기'; b.setAttribute('aria-pressed', String(on)); }
    if (on) history.pushState({ dzBig: true }, ''); else if (!fromHistory && history.state?.dzBig) history.back();
    renderSel(); requestAnimationFrame(() => { if (mapObj) mapObj.resize(); });
  }
  document.body.classList.remove('dz-noscroll'); closeBig = (fromHistory) => setBig(false, fromHistory);
  function pick(id, fromMap = true) {
    st.sel = id; persist(); markSelected(); renderSel();
    const d = all.find((x) => x.id === id);
    if (mapObj && d?.center) mapObj.easeTo({ center: [d.center.lng, d.center.lat], zoom: Math.max(mapObj.getZoom(), FOCUS_ZOOM), duration: 600 });
    if (fromMap && !isBig()) document.getElementById('dz-sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const W = data.tiers?.rule?.weights || { price: 50, transit: 25, school: 15, living: 10 };
  const lineLegend = transit.available ? transit.lines.map((l) => `<span class="lg-item" title="${esc(l.summary || '')}"><span class="lg-line" style="--c:${esc(l.color)}"></span>${esc(l.name)} <span class="muted">${esc(l.status)}</span></span>`).join('') : '';
  $app.innerHTML = `<section class="hero"><div class="hero-text"><p class="eyebrow">시세·교통·학군·생활로 나눈 서울·수도권 7개 급지</p><h1>지구별 급지 한눈에</h1></div>
      <div class="row mk-filters"><label class="chip-select">${icon('map')}<select id="dz-group" aria-label="권역"><option value="all">전체 권역</option>${groups.map((g) => opt(g, g, st.group)).join('')}</select></label>
        <label class="inline small"><input type="checkbox" id="dz-pinned" ${st.pinnedOnly ? 'checked' : ''}> 관심 지구만</label></div></section>
    <div class="panel dz-map-panel"><div class="row spread dz-map-top"><h2>급지 지도 <span class="small muted">지구 · 신설 노선 · 역</span></h2>
        <div class="row dz-map-tools"><label class="inline small"><span class="dz-metric-lbl">지도에 표시할 점수</span> <select id="dz-metric" aria-label="지도에 표시할 점수">${Object.entries(METRICS).map(([k, l]) => opt(k, l, st.metric)).join('')}</select></label>
          <button type="button" class="btn small secondary" id="dz-fit">전체 보기</button><button type="button" class="btn small secondary" id="dz-big" aria-pressed="false">크게 보기</button></div></div>
      <div class="dz-map" id="dz-map" role="application" aria-label="지구 입지 지도"></div>
      <div class="dz-legend"><span class="lg-item"><span class="lg-line solid"></span>운행 중</span><span class="lg-item"><span class="lg-line dashed"></span>공사·계획(개략선)</span><span class="lg-item"><span class="lg-dot open"></span>운행 역</span><span class="lg-item"><span class="lg-dot"></span>예정 역</span>
        <span class="lg-item" id="dz-pin-hint"><span class="lg-pin"><i>지금</i><i>미래</i></span>핀의 위 칸은 지금, 아래 칸은 미래(신설 노선 반영)</span>
        <span class="lg-item"><span class="lg-pin planned"><i>&nbsp;&nbsp;</i></span>점선 핀은 입주 전 예정 지구(시세가 없어 급지 없음)</span>
        <span class="lg-item" id="dz-lg-tier">급지 ${TIER_COLORS.slice(1).map(([bg, fg], i) => `<span class="lg-sw tier" style="background:${bg};color:${fg}">${i + 1}</span>`).join('')}</span>
        <span class="lg-item" id="dz-lg-score">점수 ${RAMP.slice().reverse().map(([min, bg]) => `<span class="lg-sw" style="background:${bg}" title="${min}점 이상"></span>`).join('')} 낮음 → 높음</span></div>
      <p class="small muted dz-tier-note" id="dz-tier-note">${!data.configured ? '실거래 인증키가 없어 급지를 매기지 못합니다. 별점만 표시합니다.' : data.tiers?.asOf ? `급지에 쓴 시세: ${esc(dt(data.tiers.asOf))} 기준 최근 3개월 실거래(${data.tiers.priced}곳). ` : '급지에 쓸 시세를 불러오는 중입니다… '}${data.configured && !isPublic() ? '<button type="button" class="btn small secondary" id="dz-tier-refresh">시세 다시 불러오기</button>' : ''}</p>
      ${data.configured ? `<details class="tier-weights" id="dz-weights"${weightsOpen ? ' open' : ''}><summary>급지 비중 바꾸기 <span class="small muted">지금: ${wText(W)}</span>${data.tiers?.custom ? ' <span class="tag">내 비중</span>' : ''}</summary>
        <p class="small muted">무엇을 더 중요하게 볼지 정하면 급지를 다시 매깁니다. 시세 비중을 올리면 시장이 비싸게 쳐주는 곳이, 내리면 교통·학군·생활이 좋은 곳이 위로 올라옵니다.</p>
        <div class="row tw-presets">${PRESETS.map(([name], i) => `<button type="button" class="btn small secondary" data-preset="${i}">${name}</button>`).join('')}</div>
        <div class="tw-rows">${W_KEYS.map(([k, label]) => `<label class="tw-row"><span class="tw-l">${label}</span><input type="range" min="0" max="100" step="5" value="${Math.round(W[k] / 5) * 5}" data-w="${k}" aria-label="${label} 비중"><output data-out="${k}">${W[k]}</output></label>`).join('')}</div>
        <p class="small" id="tw-sum" aria-live="polite"></p>
        <div class="row"><button type="button" class="btn small" id="tw-apply">이 비중으로 다시 계산</button>${data.tiers?.custom ? '<button type="button" class="btn small secondary" id="tw-reset">기본값으로 되돌리기</button>' : ''}</div></details>` : ''}
      ${lineLegend ? `<div class="dz-legend lines">${lineLegend}</div>` : '<p class="small muted">노선 자료가 없습니다.</p>'}
      <div id="dz-sel" class="dz-sel"></div></div>
    <div class="panel"><div class="row spread"><h2>지구 비교표 <span class="count" id="dz-count"></span></h2>
        <div class="row"><label class="inline small">정렬 <select id="dz-sort">${[['tier', '급지 높은 순(지금)'], ['tierFuture', '급지 높은 순(미래)'], ['now', '지금 가까운 순'], ['future', '개통 후 가까운 순'], ['saved', '개통으로 많이 줄어드는 순'], ['school', '학군 높은 순'], ['living', '생활 높은 순'], ['price', '가격 낮은 순(불러온 지구)'], ['name', '이름 순']].map(([v, l]) => opt(v, l, st.sort)).join('')}</select></label>
          ${data.configured ? '<button type="button" class="btn small secondary" id="dz-loadall">보이는 지구 가격 모두 불러오기</button>' : ''}</div></div>
      <div class="dz-table" id="dz-table"></div>
      <p class="small muted">시간은 역(지구 대표 지점) → 업무지구 역 기준이며 <b>지금 → 개통 후(추정)</b> 순서입니다. * 표시는 근거가 약한 평가입니다. ${data.transit?.checkedAt ? `현재 소요시간 조회 ${esc(dt(data.transit.checkedAt))}.` : '현재 소요시간 자료가 없습니다.'} 가격은 전용 84㎡ 안팎 최근 3개월 실거래 중앙값입니다.</p>
      <details class="small"><summary>점수는 이렇게 매깁니다</summary><p>${esc(data.transit?.method?.stars || '')}</p><p>지금: ${esc(data.transit?.method?.now || '')}</p><p>개통 후: ${esc(data.transit?.method?.future || '')}</p><p>학군·생활: AI가 공개 자료(보도, 학원·학교 정보 등)를 찾아 매긴 대략적인 평가입니다. 지구 화면에서 근거와 출처를 볼 수 있습니다. 급지는 100점 만점(${wText(W)})을 7구간으로 나눈 것입니다. 85점 이상 1급, 10점 내려갈 때마다 한 급씩 내려가 35점 미만이 7급입니다. 시세는 최근 3개월 전용 59형·84형의 ㎡당 중앙값이고, ㎡당 500만 원이 0점, 4,000만 원이 만점인 배수 눈금으로 매깁니다. 비중은 지도 아래 '급지 비중 바꾸기'에서 바꿀 수 있습니다. 미래 급지는 교통만 개통 후 점수로 바꿔 다시 계산한 것입니다.</p></details></div>
    <div class="row" style="margin:6px 0 14px">${isPublic() ? '' : `<a class="btn small secondary" href="#/market/areas">${icon('pin')} 지구 목록 편집</a>`}<a class="btn small secondary" href="#/market/facts">${icon('doc')} 노선·호재 자료</a></div>
    ${isPublic() ? '' : `${watchPanel(wl)}${notesHtml(cfg.notes, cfg.areas)}`}`;
  // 지도 핀을 누르면 바로 그 지구의 상세분석 페이지로 간다. 돌아오면 그 지구가 선택된 채로 보인다.
  const openDetail = (id) => { st.sel = id; persist(); const to = `#/market/area/${id}`; if (isBig() && history.state?.dzBig) { window.addEventListener('popstate', () => { location.hash = to; }, { once: true }); setBig(false); } else location.hash = to; };
  const redraw = () => { renderTable(); drawMap(visible(), transit, openDetail); };
  document.getElementById('dz-group').onchange = (e) => { st.group = e.target.value; persist(); redraw(); };
  document.getElementById('dz-pinned').onchange = (e) => { st.pinnedOnly = e.target.checked; persist(); redraw(); };
  const pinHint = () => { const h = document.getElementById('dz-pin-hint'); if (h) h.hidden = !isTwo(st.metric); const a = document.getElementById('dz-lg-tier'); const b = document.getElementById('dz-lg-score'); if (a) a.hidden = st.metric !== 'tier'; if (b) b.hidden = st.metric === 'tier'; };
  if (!METRICS[st.metric]) st.metric = 'tier';
  // 급지 시세: 처음이면 자동으로 한 번 불러오고, 그 뒤로는 버튼을 눌렀을 때만 갱신한다
  const refreshTiers = async (btn) => {
    const note = document.getElementById('dz-tier-note'); if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
    try { await api('api/market/tiers/refresh', { method: 'POST' }); toast('급지 시세를 갱신했습니다'); districtsHome(); }
    catch (e) { if (note) note.textContent = `급지 시세를 불러오지 못했습니다: ${e.message}`; toast(e.message, true); }
  };
  const tr = document.getElementById('dz-tier-refresh'); if (tr) tr.onclick = () => refreshTiers(tr);
  // 급지 비중 조정: 미끄럼 막대로 고르고, 합계가 100이 아니면 비율대로 100에 맞춰 적용한다
  const wBox = document.getElementById('dz-weights');
  if (wBox) {
    wBox.ontoggle = () => { weightsOpen = wBox.open; };
    const inputs = [...wBox.querySelectorAll('input[data-w]')];
    const read = () => Object.fromEntries(inputs.map((i) => [i.dataset.w, Number(i.value)]));
    const show = () => {
      const w = read(); const sum = Object.values(w).reduce((a, b) => a + b, 0);
      for (const i of inputs) wBox.querySelector(`[data-out="${i.dataset.w}"]`).textContent = i.value;
      const norm = sum > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round((v / sum) * 1000) / 10])) : null;
      document.getElementById('tw-sum').textContent = sum === 100 ? '합계 100' : sum > 0 ? `합계 ${sum} → 100에 맞추면 ${wText(norm)}` : '적어도 하나는 0보다 커야 합니다';
      document.getElementById('tw-apply').disabled = !(sum > 0);
    };
    for (const i of inputs) i.oninput = show;
    for (const b of wBox.querySelectorAll('[data-preset]')) b.onclick = () => { const p = PRESETS[Number(b.dataset.preset)][1]; for (const i of inputs) i.value = p[i.dataset.w]; show(); };
    const send = async (body, done) => { try { await api('api/market/tiers/weights', { method: 'PUT', body }); toast(done); weightsOpen = true; districtsHome(); } catch (e) { toast(e.message, true); } };
    document.getElementById('tw-apply').onclick = () => send({ weights: read() }, '바꾼 비중으로 급지를 다시 매겼습니다');
    const rs = document.getElementById('tw-reset'); if (rs) rs.onclick = () => send({ reset: true }, '기본 비중으로 되돌렸습니다');
    show();
  }
  if (data.configured && !isPublic() && !data.tiers?.asOf && !tierAutoTried) { tierAutoTried = true; refreshTiers(tr); }
  pinHint();
  document.getElementById('dz-metric').onchange = (e) => { st.metric = e.target.value; persist(); pinHint(); drawMap(visible(), transit, openDetail); };
  document.getElementById('dz-fit').onclick = () => fitAll?.();
  document.getElementById('dz-big').onclick = () => setBig(!isBig());
  document.getElementById('dz-sort').onchange = (e) => { st.sort = e.target.value; persist(); renderTable(); };
  const la = document.getElementById('dz-loadall'); if (la) la.onclick = () => loadPrices(visible().filter((d) => !d.planned && !prices.get(d.id)?.recentCount && !prices.get(d.id)?.loading).map((d) => d.id));
  if (!isPublic()) { bindWatchPanel(() => districtsHome()); bindNotes(null, () => districtsHome()); }
  renderTable(); renderSel(); drawMap(visible(), transit, openDetail);
  // 상세 페이지에서 돌아왔을 때 선택해 둔 지구로 지도를 맞춘다
  if (st.sel) { const d0 = all.find((x) => x.id === st.sel); if (d0?.center) setTimeout(() => { if (mapObj) mapObj.jumpTo({ center: [d0.center.lng, d0.center.lat], zoom: Math.max(mapObj.getZoom(), FOCUS_ZOOM) }); }, 400); }
  loadPrices(all.filter((d) => (isPublic() || d.pinned) && !d.planned && !prices.has(d.id)).map((d) => d.id));
}
window.addEventListener('hashchange', () => { document.body.classList.remove('dz-noscroll'); if (location.hash !== '#/market') { clearMap(); closeBig = null; } });
window.addEventListener('popstate', () => { if (location.hash === '#/market') closeBig?.(true); });
document.addEventListener('themechange', () => { if (lastDraw && document.getElementById('dz-map')) drawMap(...lastDraw); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBig?.(false); });
