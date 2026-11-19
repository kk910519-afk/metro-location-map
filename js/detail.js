// 지구 상세분석 페이지. 서버(또는 공개 사이트의 자료 파일)가 준 한 덩어리를 받아 그리고, 평형·기간은 받은 자료를 잘라 보여준다(다시 묻지 않는다).
import { $app, api, esc, eokman, icon, toast, opt, local, dt, isPublic } from './util.js';
import { lineChart, barChart, sparkline, bindCharts, eok, ymLabel } from './charts.js';
import { starsHtml, tierBadge, hubCell, srcLinks, regBadge, isLow } from './districts.js';
import { notesHtml, bindNotes, pctText, linkRow, catalystList } from './market.js';
import { getMapKit } from './mapkit.js';
import { externalLinks, districtMapLinks, safeHref } from './links.js';

const st = { band: 's84', years: 3, sort: 'count', pmin: null, pmax: null, built: 'all', ...local.get('detail.v1', {}) };
const persist = () => local.set('detail.v1', { band: st.band, years: st.years, sort: st.sort, pmin: st.pmin, pmax: st.pmax, built: st.built });
const BANDS = { s59: '59형', s84: '84형' };
const BAND_NOTE = { s59: '전용 50~69㎡', s84: '전용 80~89㎡' };
const BUILT = { all: ['준공 전체', null, null], y5: ['5년 이내', -5, null], y10: ['10년 이내', -10, null], y20: ['20년 이내', -20, null], old: ['20년 넘음', null, -21] };
const SECTIONS = [['summary', '요약'], ['price', '집값'], ['transit', '교통'], ['school', '학군·생활'], ['geo', '지리·입지'], ['supply', '공급·리스크'], ['residents', '거주 후기'], ['complexes', '단지']];
const NODATA = '<p class="small muted">조사 자료 없음</p>';
const list = (xs) => (xs?.length ? `<ul class="dt-list">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const man = (won) => `${Math.round(won / 10000).toLocaleString('ko-KR')}만 원`;
let miniMap = null;
function clearMiniMap() { if (miniMap) { miniMap.remove(); miniMap = null; } }
window.addEventListener('hashchange', clearMiniMap);

export async function districtDetail(id, opts = {}) {
  if (!opts.silent) $app.innerHTML = '<p class="muted">불러오는 중… 처음 여는 지구는 5년치 실거래를 받아 오느라 1분쯤 걸릴 수 있습니다.</p>';
  let d;
  try { d = await api(`api/market/areas/${encodeURIComponent(id)}/detail`); }
  catch (e) { $app.innerHTML = `<div class="empty panel">${icon('alert')}<b>이 주소에는 볼 수 있는 화면이 없습니다.</b><p class="small muted">${esc(e.message)}</p><a class="btn small" href="#/market">급지 지도로</a></div>`; return; }
  const D = d.district; const s = D.scores; const t = D.tier; const P = d.profile; const pub = isPublic();
  const watch = d.watch || []; const notes = d.notes || [];
  const rerender = () => districtDetail(id, { silent: true });
  // 조사 자료 꼬리표: AI가 조사했다는 것과 기준일, 근거가 약하면 그것도
  const aiTag = `<span class="tag ai-tag">AI 조사${d.profileAsOf ? ` · ${esc(d.profileAsOf)}` : ''}</span>${P?.confidence === 'low' ? '<span class="tag stars-lowtag">근거 약함</span>' : ''}`;
  // 평형: 고른 평형에 거래가 없고 다른 평형에 있으면 다른 평형을 보여준다(저장한 선택은 바꾸지 않는다)
  const bandKey = () => (d.bands && !d.bands[st.band]?.tradeCount && d.bands[st.band === 's84' ? 's59' : 's84']?.tradeCount ? (st.band === 's84' ? 's59' : 's84') : st.band);
  const yearNow = new Date().getFullYear();

  // ---------- 머리 ----------
  const mapLinks = districtMapLinks(d.area.center);
  const head = `<p class="small"><a href="#/market">← 급지 지도</a></p>
    <section class="dt-head"><div class="dt-head-text"><p class="eyebrow">${esc(d.area.group)}${d.area.parts.length ? ` · ${esc(d.area.parts.map((p) => `${p.sigungu} ${p.dongs.join('·')}`).join(' / '))}` : ''}</p><h1>${esc(d.area.name)}</h1>${d.area.note ? `<p class="small muted">${esc(d.area.note)}</p>` : ''}</div>
      <div class="dt-head-side"><div class="dt-tier">${t?.tier ? `<span class="sc-overall"><span class="sc-when">지금</span>${tierBadge(t.tier)} <span class="arrow">→</span> <span class="sc-when">미래</span>${tierBadge(t.tierFuture)}</span>` : `<span class="muted">${d.area.planned ? '입주 전(시세가 없어 급지 없음)' : '급지 미정(시세 없음)'}</span>`}</div>
        ${t?.tier ? `<div class="small muted">${t.score}점${t.scoreFuture !== t.score ? ` → ${t.scoreFuture}점` : ''}${t.rank ? ` · ${t.rank.of}곳 중 ${t.rank.score}위${t.rank.scoreFuture !== t.rank.score ? ` → ${t.rank.scoreFuture}위` : ''}` : ''}${t.partial ? ' · 일부 항목 미확인' : ''}</div>` : ''}
        <button type="button" class="btn small secondary" id="pin-btn" aria-pressed="${D.pinned}">${D.pinned ? '★ 관심 지구' : '☆ 관심 지구로 표시'}</button></div>
      ${mapLinks.length ? `<div class="dt-ext" role="group" aria-label="이 지구 주변 시세 지도 열기">${mapLinks.map((l) => `<a class="btn small secondary" href="${esc(safeHref(l.url))}" target="_blank" rel="noopener noreferrer" title="${esc(l.label)}에서 이 지구 중심 주변 지도 열기(새 창) · ${esc(l.note)}">${esc(l.label)} <span aria-hidden="true">↗</span></a>`).join('')}</div>` : ''}</section>
    <nav class="dt-tabs" aria-label="구역 바로가기">${SECTIONS.filter(([k]) => !(d.area.planned && k === 'complexes')).map(([k, label]) => `<button type="button" data-jump="sec-${k}">${label}</button>`).join('')}</nav>`;

  // ---------- 한눈에 ----------
  const sumBand = d.bands ? (d.bands.s84.yoy.recentMedianPrice !== null ? 's84' : d.bands.s59.yoy.recentMedianPrice !== null ? 's59' : null) : null;
  const sumYoy = sumBand ? d.bands[sumBand].yoy : null;
  const regions = [...new Map(D.region.map((r) => [r.sigungu, r])).values()];
  const summary = `<section class="panel dt-sec" id="sec-summary"><div class="row spread"><h2>한눈에</h2><span class="row">${P ? aiTag : ''}</span></div>
      ${P ? `<p class="dt-oneline">${esc(P.summary_ko)}</p><div class="grid grid-2 dt-sw"><div><h3>강점</h3>${list(P.strengths) || NODATA}</div><div><h3>약점</h3>${list(P.weaknesses) || NODATA}</div></div>` : `<p class="small muted">한 줄 평·강점·약점 조사 자료 없음</p>`}
      <div class="grid dt-stats">
        <div class="stat"><div class="label">${d.area.planned ? '실거래' : `${sumBand ? BANDS[sumBand] : '84형'} 최근 3개월 중앙값`}</div><div class="value">${d.area.planned ? '입주 전' : sumYoy ? esc(eokman(sumYoy.recentMedianPrice)) : '거래 없음'}</div><div class="small muted">${sumYoy ? `${sumYoy.recentCount}건 · ㎡당 ${esc(man(sumYoy.recentPerM2))}` : d.area.planned ? '아래 공급 계획 참고' : '59형·84형 모두 최근 거래 없음'}</div></div>
        <div class="stat"><div class="label">1년 전 같은 기간 대비</div><div class="value">${sumYoy ? pctText(sumYoy.changePct) : '<span class="muted">-</span>'}</div><div class="small muted">${sumYoy?.priorCount ? `1년 전 ${sumYoy.priorCount}건 (㎡당 기준)` : '비교할 거래 없음'}</div></div>
        <div class="stat"><div class="label">업무지구 평균 소요시간</div><div class="value">${s.transitNow.avgMin === null ? '<span class="muted">미확인</span>' : `${s.transitNow.avgMin}분`}${s.transitFuture.avgMin !== null && s.transitFuture.avgMin !== s.transitNow.avgMin ? ` <span class="arrow">→</span> ${s.transitFuture.avgMin}분` : ''}</div><div class="small muted">강남·광화문·여의도 평균 · 지금 → 개통 후(추정)</div></div>
        <div class="stat"><div class="label">규제</div><div class="value dt-reg">${regions.map((r) => `<span title="${esc(r.sigungu)}">${regBadge(r)}</span>`).join(' ') || '<span class="muted">미확인</span>'}</div><div class="small muted">${esc(regions.map((r) => r.sigungu).join(' · '))}</div></div>
      </div></section>`;

  // ---------- 집값 추이(평형·기간을 바꿀 때 이 구역과 단지 구역만 다시 그린다) ----------
  const seg = (name, items, cur) => `<span class="seg" role="group" aria-label="${name}">${items.map(([v, l]) => `<button type="button" data-${name}="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</span>`;
  function priceHtml() {
    const bk = bandKey(); const B = d.bands[bk]; const n = st.years * 12; const series = B.series.slice(-n);
    const peak = series.filter((x) => x.medianPrice !== null).reduce((m, x) => (!m || x.medianPrice > m.medianPrice ? x : m), null);
    const recent = B.yoy.recentMedianPrice; const off = peak && recent !== null ? Math.round((recent / peak.medianPrice - 1) * 1000) / 10 : null;
    const count = series.reduce((a, x) => a + x.count, 0);
    const g = d.groupSeries?.[bk]?.slice(-n) || null;
    const pts = (get) => series.map((x, i) => ({ label: ymLabel(x.ym), value: get(x), sub: `${x.count}건${i === series.length - 1 ? ' · 집계 중' : ''}` }));
    return `<div class="row spread dt-price-top"><h2>집값 추이 <span class="small muted">${BAND_NOTE[bk]}</span></h2><div class="row">${seg('band', Object.entries(BANDS), bk)}${seg('years', [[1, '1년'], [3, '3년'], [5, '5년']], st.years)}</div></div>
      ${bk !== st.band ? `<p class="small muted">${BANDS[st.band]} 거래가 없어 ${BANDS[bk]}을 보여줍니다.</p>` : ''}
      ${d.coverage.missingMonths ? `<div class="callout warn small">실거래 ${d.coverage.missingMonths}개월분을 아직 받지 못했습니다. 그 달은 거래가 없는 것처럼 보입니다.</div>` : ''}
      ${!B.tradeCount ? `<p class="small muted">최근 5년 동안 ${BANDS[bk]} 거래가 없습니다.</p>` : `
      <div class="grid dt-stats">
        <div class="stat"><div class="label">최근 3개월 중앙값</div><div class="value">${recent === null ? '거래 없음' : esc(eokman(recent))}</div><div class="small muted">${B.yoy.recentCount}건${B.yoy.recentPerM2 ? ` · ㎡당 ${esc(man(B.yoy.recentPerM2))}` : ''}</div></div>
        <div class="stat"><div class="label">1년 전 같은 기간 대비</div><div class="value">${pctText(B.yoy.changePct)}</div><div class="small muted">1년 전 ${B.yoy.priorMedianPrice === null ? '거래 없음' : `${esc(eokman(B.yoy.priorMedianPrice))} · ${B.yoy.priorCount}건`}</div></div>
        <div class="stat"><div class="label">${st.years}년 최고가 대비</div><div class="value">${off === null ? '-' : `${off}%`}</div><div class="small muted">${peak ? `월 중앙값 최고 ${esc(eok(peak.medianPrice))} (${esc(ymLabel(peak.ym))})` : '거래 없음'}</div></div>
        <div class="stat"><div class="label">${st.years}년 거래</div><div class="value">${count.toLocaleString('ko-KR')}건</div><div class="small muted">해제된 거래 제외</div></div></div>
      ${lineChart({ id: 'ch-price', title: '월별 매매 중앙값', points: pts((x) => x.medianPrice) })}
      ${lineChart({ id: 'ch-perm2', title: `㎡당 중앙값${g ? ` · 이 지구와 ${d.groupSeries.group} 평균` : ''}`, points: pts((x) => (x.medianPerM2 === null ? null : Math.round(x.medianPerM2))), compare: g ? { label: `${d.groupSeries.group} 평균`, points: g.map((x) => x.perM2) } : null, mainLabel: d.area.name, height: 200, yFormat: (v) => `${Math.round(v / 10000).toLocaleString('ko-KR')}만`, tipFormat: man })}
      ${!pub && (!g || d.groupSeries.lastYm !== d.refYm) ? `<p class="small muted">${g ? `권역 평균은 ${esc(ymLabel(d.groupSeries.lastYm || d.refYm))}까지만 계산돼 있습니다.` : '같은 권역 평균 비교선이 아직 없습니다.'} <button type="button" class="btn small secondary" id="grp-refresh">${g ? '권역 평균 다시 계산' : '권역 평균 불러오기'}</button> (모든 지구의 5년치 실거래를 확인해 몇 분 걸립니다)</p>` : ''}
      ${barChart({ id: 'ch-vol', title: '월별 거래량', points: series.map((x) => ({ label: ymLabel(x.ym), value: x.count })) })}
      <p class="small muted">실거래 신고 기한이 계약 후 30일이라 가장 최근 달은 아직 집계 중입니다. 거래가 적은 달의 중앙값은 한두 건에 크게 흔들립니다.${g ? ` 권역 평균은 ${esc(d.groupSeries.group)}에 속한 지구의 같은 평형 거래를 모아 낸 ㎡당 중앙값입니다.` : ''}</p>
      <details class="small"><summary>표로 보기</summary><div class="table-wrap"><table><tr><th>계약월</th><th class="num">중앙값</th><th class="num">㎡당</th><th class="num">거래</th></tr>${[...series].reverse().map((x) => `<tr><td>${esc(ymLabel(x.ym))}</td><td class="num">${x.medianPrice === null ? '-' : esc(eokman(x.medianPrice))}</td><td class="num">${x.medianPerM2 === null ? '-' : esc(man(x.medianPerM2))}</td><td class="num">${x.count}</td></tr>`).join('')}</table></div></details>`}`;
  }
  const plan = () => { const pl = s.planned; const item = (label, v) => `<tr><th>${label}</th><td>${v ? esc(v) : '<span class="badge badge-warn">미확인</span>'}</td></tr>`;
    return `<h2>공급 계획과 일정</h2>${pl ? `<div class="table-wrap"><table class="plan">${item('공급 규모', pl.households)}${item('위치', pl.areaNote)}${item('본청약', pl.firstSubscription)}${item('첫 입주 목표', pl.firstMoveIn)}${item('지구 준공 목표', pl.completion)}${item('분양가 사례', pl.priceNote)}${item('자족 기능', pl.selfSufficiency)}${item('일정 변경', pl.slipNote)}</table></div><p class="small">${srcLinks(pl.sources)}</p>` : NODATA}
      <p class="small muted">입주 전이라 실거래가 없습니다. 일정은 자주 바뀌므로 청약 전에는 LH·국토교통부 공고에서 다시 확인하세요. 교통 점수는 지구 대략 위치 기준 추정입니다.</p>`; };

  // ---------- 교통 ----------
  const tf = s.transitFuture;
  const lineCard = (l) => `<li class="dt-line" style="--c:${esc(l.color)}"><div class="row spread"><b>${esc(l.name)}</b><span class="row"><span class="tag">${esc(l.status)}</span>${l.target ? `<span class="tag">목표 ${esc(l.target)}</span>` : '<span class="tag tag-muted">개통 시기 미확정</span>'}</span></div>
      ${l.stations.length ? `<div class="small muted">이 지구 기준 역: ${esc(l.stations.join(' · '))}</div>` : ''}${l.summary ? `<div class="small">${esc(l.summary)}</div>` : ''}${l.slipNote ? `<div class="small muted">변경·지연: ${esc(l.slipNote)}</div>` : ''}${l.sources?.length ? `<div class="small">${srcLinks(l.sources)}</div>` : ''}</li>`;
  const counted = d.transit.lines.filter((l) => l.counted); const uncounted = d.transit.lines.filter((l) => !l.counted);
  const transit = `<section class="dt-sec dt-grid" id="sec-transit">
      <div class="panel"><div class="row spread"><h2>교통 · 지금</h2>${starsHtml(s.transitNow.stars)}</div><p class="small">${esc(s.transitNow.reason)}</p>
        <div class="hub-chips">${s.transitNow.hubs.map((h) => `<span class="hub-chip"><span class="muted">${esc(h.name)}</span> ${h.now ? `${h.now.min}분` : '<span class="muted">미확인</span>'}</span>`).join('')}</div>
        ${s.stations.length ? `<div class="table-wrap"><table><tr><th>기준 역</th>${d.transit.hubs.map((h) => `<th class="num">${esc(h.name)}</th>`).join('')}<th>길찾기</th></tr>${s.stations.map((x) => `<tr><td><b>${esc(x.name)}</b> ${x.open ? '' : '<span class="tag">미개통·지점 기준</span>'}<div class="small muted">${esc(x.lines.join(' · ') || '기존 노선')}${x.coordSource === 'approx' ? ' · 대략 위치' : ''}</div></td>${d.transit.hubs.map((h) => `<td class="num">${x.times[h.id].now === null ? '-' : `${x.times[h.id].now}분`}</td>`).join('')}<td class="small">${(d.transit.stationLinks[x.name] || []).map((l) => `<a href="${esc(safeHref(l.url))}" target="_blank" rel="noopener">${esc(l.hub)}</a>`).join(' · ') || '-'}</td></tr>`).join('')}</table></div>` : '<p class="small muted">연결된 기준 역이 없습니다.</p>'}
        <p class="small muted">역(또는 지구 대표 지점)에서 업무지구 역까지의 표준 소요시간입니다. 집에서 역까지 가는 시간과 출근 시간대 혼잡은 들어 있지 않습니다.${d.transit.checkedAt ? ` 조회 ${esc(dt(d.transit.checkedAt))}.` : ''}</p></div>
      <div class="panel"><div class="row spread"><h2>교통 · 미래</h2>${starsHtml(tf.stars)}</div><p class="small">${esc(tf.reason)}${tf.changed ? ' <span class="tag">추정</span>' : ''}</p>
        <div class="hub-chips">${s.transitNow.hubs.map((h) => `<span class="hub-chip"><span class="muted">${esc(h.name)}</span> ${hubCell(h)}</span>`).join('')}</div>
        ${counted.length ? `<ul class="dt-lines">${counted.map(lineCard).join('')}</ul>` : '<p class="small muted">이 지구의 기준 역에 닿는 신설 노선이 없습니다.</p>'}
        ${uncounted.length ? `<h3 class="dt-sub">점수 계산에 넣지 못한 노선 <span class="small muted">역 위치가 정해지지 않음</span></h3><ul class="dt-lines">${uncounted.map(lineCard).join('')}</ul>` : ''}
        <p class="small muted">'개통 후' 시간은 거리와 속도로 계산한 추정치이고, 개통 시기는 자주 밀립니다. 노선 자료는 AI가 공개 자료를 찾아 정리한 것입니다.</p></div></section>`;

  // ---------- 학군·생활 ----------
  const research = (title, x) => `<div class="panel"><div class="row spread"><h2>${title}</h2>${starsHtml(x.stars)}</div>
      <p class="small">${esc(x.reason || '')} ${x.basis === 'mine' ? '<span class="tag">내 점수</span>' : x.basis === 'research' ? '<span class="tag ai-tag">AI 조사</span>' : ''}${isLow(x) ? '<span class="tag stars-lowtag">근거 약함</span>' : ''}</p>
      ${list(x.facts)}${x.sources?.length ? `<p class="small">${srcLinks(x.sources)}</p>` : ''}</div>`;
  const myScore = pub ? '' : `<details class="small sc-more dt-mine"><summary>학군·생활 점수를 내 판단으로 고치기</summary><form id="my-score" class="row" style="flex-wrap:wrap;align-items:flex-end;margin-top:8px">
      ${[['school', '학군'], ['living', '생활 인프라']].map(([k, l]) => `<label class="field">${l}<select name="${k}"><option value="">조사 자료 그대로</option>${[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map((v) => `<option value="${v}" ${s[k].basis === 'mine' && s[k].stars === v ? 'selected' : ''}>${v}점</option>`).join('')}</select></label><label class="field" style="flex:1;min-width:160px">${l} 메모<input name="${k}Note" maxlength="200" value="${s[k].basis === 'mine' ? esc(s[k].reason || '') : ''}" placeholder="예: 임장해 보니 학원가 도보 10분"></label>`).join('')}
      <button class="btn small" type="submit">저장</button></form></details>`;
  const school = `<section class="dt-sec" id="sec-school"><div class="dt-grid">${research('학군', s.school)}${research('생활 인프라', s.living)}</div>
      <p class="small muted">학군·생활 별점은 AI가 공개 자료(보도, 학원·학교 정보 등)를 찾아 매긴 대략적인 평가이며 통계 점수가 아닙니다.</p>${myScore}</section>`;

  // ---------- 지리·입지 ----------
  const H = d.housing; const maxDec = H ? Math.max(1, ...H.decades.map((x) => x.count)) : 1;
  const housing = H && H.complexCount ? `<h3 class="dt-sub">주거 구성 <span class="small muted">최근 5년 실거래에 나온 단지 기준</span></h3>
      <p class="small">단지 ${H.complexCount}곳${H.medianBuildYear ? ` · 준공 중앙 ${Math.round(H.medianBuildYear)}년` : ''}</p>
      <div class="dt-bars">${H.decades.map((x) => `<div class="dt-bar"><span class="dt-bar-l">${esc(x.label)}</span><span class="dt-bar-t"><i style="width:${Math.round((x.count / maxDec) * 100)}%"></i></span><span class="dt-bar-v">${x.count}곳</span></div>`).join('')}</div>
      <p class="small muted">실거래 자료에는 세대수가 없어 단지 수로만 셉니다.</p>` : '';
  const geo = `<section class="dt-sec dt-grid" id="sec-geo">
      <div class="panel"><div class="row spread"><h2>지리적 특징</h2><span class="row">${P ? aiTag : ''}</span></div>
        ${d.area.center ? '<div class="dt-map" id="dt-map" role="application" aria-label="지구 위치와 주변 역·노선 지도"></div><p class="small muted">표시는 지구의 대략적인 중심입니다. 지구 경계선 자료는 없어 그리지 않았습니다.</p>' : ''}
        ${P?.geography ? `<p>${esc(P.geography.text_ko)}</p>${list(P.geography.facts)}` : NODATA}</div>
      <div class="panel"><div class="row spread"><h2>입지적 특징</h2><span class="row">${P?.location?.type ? `<span class="tag">${esc(P.location.type)}</span>` : ''}${P ? aiTag : ''}</span></div>
        ${P?.location ? `<p>${esc(P.location.text_ko)}</p>${list(P.location.facts)}` : NODATA}${housing}</div></section>`;

  // ---------- 공급·리스크 ----------
  const supplyItems = P?.supply?.items || [];
  const supply = `<section class="dt-sec dt-grid" id="sec-supply">
      <div class="panel"><div class="row spread"><h2>공급·정비 계획</h2><span class="row">${P ? aiTag : ''}</span></div>
        ${P?.supply ? `${P.supply.text_ko ? `<p>${esc(P.supply.text_ko)}</p>` : ''}${supplyItems.length ? `<ul class="facts">${supplyItems.map((x) => `<li><div class="row spread"><b>${esc(x.title)}</b><span class="row">${x.status ? `<span class="tag">${esc(x.status)}</span>` : ''}${x.targetDate && x.targetDate !== '미확인' ? `<span class="tag">${esc(x.targetDate)}</span>` : ''}</span></div>${x.summary_ko ? `<div class="small">${esc(x.summary_ko)}</div>` : ''}</li>`).join('')}</ul>` : (P.supply.text_ko ? '' : '<p class="small muted">확인된 공급·정비 계획 없음</p>')}` : NODATA}
        <h3 class="dt-sub">관련 호재 <span class="small muted">AI 조사${d.factsAsOf ? ` · ${esc(d.factsAsOf)}` : ''}</span></h3>${d.catalysts.length ? catalystList(d.catalysts) : '<p class="small muted">이 지구에 연결된 조사 항목이 없습니다.</p>'}</div>
      <div class="panel"><div class="row spread"><h2>규제 · 리스크</h2><span class="row">${P ? aiTag : ''}</span></div>
        <ul class="facts">${regions.map((r) => `<li><div class="row spread"><b>${esc(r.sigungu)}</b><span>${regBadge(r)}</span></div>${r.regulatedType ? `<div class="small">${esc(r.regulatedType)}</div>` : ''}${r.landPermitNote ? `<div class="small muted">${esc(r.landPermitNote)}</div>` : ''}</li>`).join('')}</ul>
        ${regions.some((r) => r.landPermit === true) ? '<div class="callout warn small">토지거래허가구역입니다. 계약 전에 구청 허가가 필요하고, 허가 후 정해진 기간 안에 입주해 실거주해야 하며 전세를 낀 매매는 원칙적으로 어렵습니다.</div>' : ''}
        <h3 class="dt-sub">리스크</h3>${list(P?.risks) || NODATA}
        <h3 class="dt-sub">임장 때 볼 것</h3>${P?.checklist?.length ? `<ul class="dt-list dt-check">${P.checklist.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : NODATA}</div></section>`;

  // ---------- 거주 만족도·후기 ----------
  const R = P?.residents; const sv = R?.survey;
  const residents = `<section class="panel dt-sec" id="sec-residents"><div class="row spread"><h2>거주 만족도 · 후기</h2><span class="row">${P ? aiTag : ''}</span></div>
      ${R ? `${sv?.items?.length ? `<h3 class="dt-sub">공식 조사 <span class="small muted">${esc(sv.scope)} 평균 · 이 지구만의 값이 아닙니다</span></h3>
          <div class="table-wrap"><table><tr><th>항목</th><th class="num">값</th><th class="num">조사 연도</th></tr>${sv.items.map((x) => `<tr><td>${esc(x.label)}</td><td class="num"><b>${esc(x.value)}</b></td><td class="num">${esc(x.year ?? '-')}</td></tr>`).join('')}</table></div><p class="small">${srcLinks(sv.sources)}</p><p class="small muted">서울·경기·인천은 조사 문항과 척도가 서로 달라, 다른 시·도의 지구와 이 숫자를 비교할 수 없습니다.</p>` : '<p class="small muted">이 지역의 공식 만족도 조사 숫자는 확인하지 못했습니다.</p>'}
        <h3 class="dt-sub">거주자 후기에서 자주 나오는 이야기</h3>
        ${R.pros?.length || R.cons?.length ? `<div class="grid grid-2 dt-sw"><div><h3>장점</h3>${list(R.pros) || '<p class="small muted">없음</p>'}</div><div><h3>불만</h3>${list(R.cons) || '<p class="small muted">없음</p>'}</div></div>` : `<p class="small muted">${d.area.planned ? '입주 전이라 거주자 후기가 없습니다.' : '후기 화면을 읽지 못해 요약하지 않았습니다. 아래 링크에서 직접 확인하세요.'}</p>`}
        ${R.links?.length ? `<p class="small">원문 보기: ${R.links.map((x) => `<a href="${esc(safeHref(x.url))}" target="_blank" rel="noopener">${esc(x.title || '후기')}</a>`).join(' · ')}</p>` : ''}
        <p class="small muted">거주자 후기는 주관적 의견이고 글을 남긴 사람들에 치우쳐 있습니다. 원문을 옮기지 않고 자주 나오는 내용만 요약했으며, 급지 점수에는 넣지 않았습니다.</p>` : NODATA}</section>`;

  // ---------- 단지 ----------
  function complexesHtml() {
    const bk = bandKey(); const all = d.bands[bk].complexes; const [, bFrom, bTo] = BUILT[st.built] || BUILT.all;
    const sorters = { count: (a, b) => b.count - a.count, price: (a, b) => (a.recentMedian ?? 9e15) - (b.recentMedian ?? 9e15), priceDesc: (a, b) => (b.recentMedian ?? -1) - (a.recentMedian ?? -1), yoy: (a, b) => (b.yoyPct ?? -999) - (a.yoyPct ?? -999), offpeak: (a, b) => (a.offPeakPct ?? 0) - (b.offPeakPct ?? 0), year: (a, b) => (b.buildYear || 0) - (a.buildYear || 0) };
    const rows = all.filter((c) => (st.pmin === null || (c.recentMedian !== null && c.recentMedian >= st.pmin * 1e8)) && (st.pmax === null || (c.recentMedian !== null && c.recentMedian <= st.pmax * 1e8))
      && (bFrom === null || (c.buildYear && c.buildYear >= yearNow + bFrom)) && (bTo === null || (c.buildYear && c.buildYear <= yearNow + bTo))).sort(sorters[st.sort] || sorters.count);
    const watched = (c) => watch.some((w) => w.key === c.key && w.band === bk);
    const row = (c) => `<div class="cx-row">
        <div class="cx-name">${pub ? `<b>${esc(c.aptNm)}</b>` : `<a href="#/market/area/${id}/complex?key=${encodeURIComponent(c.key)}&band=${bk}"><b>${esc(c.aptNm)}</b></a>`}<div class="small muted">${esc(c.umdNm)}${c.buildYear ? ` · ${c.buildYear}년` : ''} · 전용 ${c.areas.join('·')}㎡ · ${c.count}건</div><div class="cx-links small">${linkRow(externalLinks(c))}</div></div>
        <div class="cx-price"><b>${c.recentMedian === null ? '-' : esc(eokman(c.recentMedian))}</b><div class="small muted">${esc(c.recentBasis)}</div></div>
        <div class="cx-chg"><span class="lbl">1년 전 대비</span>${pctText(c.yoyPct)}</div>
        <div class="cx-peak"><span class="lbl">1년 최고 대비</span>${c.offPeakPct === null ? '-' : `${c.offPeakPct}%`}<div class="small muted">최고 ${esc(eok(c.peak.priceWon))} (${esc(c.peak.dealDate.slice(2, 7))})</div></div>
        <div class="cx-last"><span class="lbl">최근 거래</span>${esc(c.last.dealDate.slice(5))} · ${esc(c.last.floor ?? '?')}층 · ${esc(eok(c.last.priceWon))}</div>
        <div class="cx-spark">${sparkline(c.spark || [], { w: 90, h: 28 })}</div>
        ${pub ? '<span></span>' : `<button type="button" class="star ${watched(c) ? 'on' : ''}" data-watch="${esc(c.key)}" aria-pressed="${watched(c)}" aria-label="${watched(c) ? '관심 단지에서 빼기' : '관심 단지에 담기'}" title="관심 단지">${watched(c) ? '★' : '☆'}</button>`}</div>`;
    return `<div class="row spread"><h2>이 지구 단지 <span class="small muted">${BANDS[bk]} · 최근 12개월 거래</span> <span class="count">${rows.length}곳</span></h2>
        <div class="row cx-filters"><label class="inline small">가격 <input id="f-pmin" type="number" step="0.5" min="0" placeholder="최소" value="${st.pmin ?? ''}" style="width:70px"> ~ <input id="f-pmax" type="number" step="0.5" min="0" placeholder="최대" value="${st.pmax ?? ''}" style="width:70px"> 억</label>
        <label class="inline small">준공 <select id="f-built">${Object.entries(BUILT).map(([k, v]) => opt(k, v[0], st.built)).join('')}</select></label>
        <label class="inline small">정렬 <select id="cx-sort">${[['count', '거래 많은 순'], ['price', '가격 낮은 순'], ['priceDesc', '가격 높은 순'], ['yoy', '1년 상승률 높은 순'], ['offpeak', '최고가 대비 많이 내린 순'], ['year', '신축 순']].map(([v, l]) => opt(v, l, st.sort)).join('')}</select></label></div></div>
      ${rows.length ? `<div class="cx-list">${rows.map(row).join('')}</div>` : `<p class="small muted">${all.length ? '조건에 맞는 단지가 없습니다. 가격대·준공 시기 조건을 바꿔 보세요.' : `최근 12개월 동안 ${BANDS[bk]} 거래가 있는 단지가 없습니다.`}</p>`}
      <p class="small muted">최근 중앙값은 최근 3개월 거래 기준이며, 그 기간에 거래가 없으면 마지막 거래 3건으로 대신합니다. 층·향·동에 따라 실제 가격은 달라집니다. 호가와 매물은 단지 이름 아래의 호갱노노·네이버 부동산 링크에서 확인하세요(검색 화면으로 연결됩니다).</p>`;
  }

  // ---------- 비슷한 지구·바닥 ----------
  const similar = d.similar.length ? `<section class="dt-similar"><h3>비슷한 급지의 다른 지구</h3><div class="row" style="flex-wrap:wrap">${d.similar.map((x) => `<a class="chip" href="#/market/area/${esc(x.id)}">${tierBadge(x.tier)} <b>${esc(x.name)}</b> <span class="muted">${esc(x.group)} · ${x.score}점</span></a>`).join('')}</div></section>` : '';
  const foot = `<p class="small muted dt-foot">${d.asOf ? `실거래 자료 기준 ${esc(dt(d.asOf))} · ` : ''}출처 <a href="${esc(safeHref(d.source.url))}" target="_blank" rel="noopener">${esc(d.source.name)}</a> · 해제된 거래는 계산에서 제외합니다. 한 줄 평·지리·입지·공급·리스크·거주 후기는 AI가 공개 자료를 찾아 정리한 것이며${d.profileAsOf ? ` (${esc(d.profileAsOf)} 조사)` : ''}, 사실과 다를 수 있으니 출처에서 다시 확인하세요. 매수·투자 권유가 아닙니다.</p>
    ${P?.sources?.length ? `<details class="small dt-foot"><summary>조사 출처 ${P.sources.length}건</summary><ul class="dt-list">${P.sources.map((x) => `<li><a href="${esc(safeHref(x.url))}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a>${x.date && x.date !== '미확인' ? ` <span class="muted">(${esc(x.date)})</span>` : ''}</li>`).join('')}</ul></details>` : ''}`;

  $app.innerHTML = `${head}${summary}
    <section class="panel dt-sec" id="sec-price">${d.area.planned ? plan() : priceHtml()}</section>
    ${transit}${school}${geo}${supply}${residents}
    ${d.area.planned ? '' : `<section class="panel dt-sec" id="sec-complexes">${complexesHtml()}</section>`}
    ${similar}${pub ? '' : notesHtml(notes, [d.area], id)}${foot}`;

  // ---------- 동작 ----------
  for (const b of $app.querySelectorAll('[data-jump]')) b.onclick = () => document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('pin-btn').onclick = async () => { try { await api('api/market/pin', { method: 'PUT', body: { id, pinned: !D.pinned } }); toast(D.pinned ? '관심 지구에서 뺐습니다' : '관심 지구로 표시했습니다'); rerender(); } catch (e) { toast(e.message, true); } };
  const numOrNull = (v) => (v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  function bindComplexes() {
    const box = document.getElementById('sec-complexes'); if (!box) return;
    const redo = () => { persist(); box.innerHTML = complexesHtml(); bindComplexes(); };
    box.querySelector('#f-pmin').onchange = (e) => { st.pmin = numOrNull(e.target.value); redo(); };
    box.querySelector('#f-pmax').onchange = (e) => { st.pmax = numOrNull(e.target.value); redo(); };
    box.querySelector('#f-built').onchange = (e) => { st.built = e.target.value; redo(); };
    box.querySelector('#cx-sort').onchange = (e) => { st.sort = e.target.value; redo(); };
    for (const b of box.querySelectorAll('[data-watch]')) b.onclick = async () => {
      const on = b.getAttribute('aria-pressed') !== 'true'; const bk = bandKey();
      try { await api('api/market/watch', { method: 'PUT', body: { areaId: id, key: b.dataset.watch, band: bk, watched: on } }); } catch (e) { toast(e.message, true); return; }
      const i = watch.findIndex((w) => w.key === b.dataset.watch && w.band === bk); if (on && i < 0) watch.push({ key: b.dataset.watch, band: bk }); if (!on && i >= 0) watch.splice(i, 1);
      b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on); toast(on ? '관심 단지에 담았습니다' : '관심 단지에서 뺐습니다');
    };
  }
  function bindPrice() {
    const box = document.getElementById('sec-price'); if (!box || d.area.planned) return;
    const redo = () => { persist(); box.innerHTML = priceHtml(); bindPrice(); const cx = document.getElementById('sec-complexes'); if (cx) { cx.innerHTML = complexesHtml(); bindComplexes(); } };
    for (const b of box.querySelectorAll('[data-band]')) b.onclick = () => { st.band = b.dataset.band; redo(); };
    for (const b of box.querySelectorAll('[data-years]')) b.onclick = () => { st.years = Number(b.dataset.years); redo(); };
    const gr = box.querySelector('#grp-refresh');
    if (gr) gr.onclick = async () => { gr.disabled = true; gr.textContent = '불러오는 중…'; try { const r = await api('api/market/groups/refresh', { method: 'POST' }); toast(r.missing ? `권역 평균을 계산했습니다(못 받은 달 ${r.missing}개)` : '권역 평균을 계산했습니다'); rerender(); } catch (e) { toast(e.message, true); gr.disabled = false; gr.textContent = '권역 평균 불러오기'; } };
    bindCharts(box);
  }
  if (![1, 3, 5].includes(st.years)) st.years = 3;
  if (!BANDS[st.band]) st.band = 's84';
  bindPrice(); bindComplexes();
  const ms = document.getElementById('my-score');
  if (ms) ms.onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); try { await api(`api/market/scores/${id}`, { method: 'PUT', body: { school: { stars: fd.get('school') || null, note: fd.get('schoolNote') }, living: { stars: fd.get('living') || null, note: fd.get('livingNote') } } }); toast('점수를 저장했습니다'); rerender(); } catch (err) { toast(err.message, true); } };
  if (!pub) bindNotes(id, rerender);
  drawMiniMap(d);
}

// 작은 지도: 지구 중심 표시 하나와 주변 역·노선. 지구 경계선은 자료가 없어 그리지 않는다.
async function drawMiniMap(d) {
  clearMiniMap();
  const host = document.getElementById('dt-map'); if (!host || !d.area.center) return;
  const [kit, transit] = await Promise.all([getMapKit(), api('api/market/transit').catch(() => null)]);
  if (!document.body.contains(host)) return; // 그리는 사이 다른 화면으로 넘어갔다
  if (!kit) { host.innerHTML = '<p class="small muted" style="padding:16px">지도를 불러오지 못했습니다.</p>'; return; }
  const ML = kit.ML; const css = getComputedStyle(document.documentElement); const ink = css.getPropertyValue('--ink').trim() || '#2F2A24'; const panel = css.getPropertyValue('--panel').trim() || '#fff';
  const map = new ML.Map({ container: host, style: kit.style, center: [d.area.center.lng, d.area.center.lat], zoom: 12, minZoom: 9, maxZoom: 15, attributionControl: { compact: true }, cooperativeGestures: true });
  miniMap = map;
  map.addControl(new ML.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('load', () => {
    if (!transit?.available) return;
    const feats = []; for (const l of transit.lines) for (const sg of l.segments) feats.push({ type: 'Feature', properties: { color: l.color, open: sg.open }, geometry: { type: 'LineString', coordinates: sg.coords } });
    map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    map.addLayer({ id: 'lines-open', type: 'line', source: 'lines', filter: ['==', ['get', 'open'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4 } });
    map.addLayer({ id: 'lines-plan', type: 'line', source: 'lines', filter: ['==', ['get', 'open'], false], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1.4, 1.4] } });
    const onLine = new Set(transit.lines.flatMap((l) => l.stations)); const mine = new Set(d.area.stations || []);
    map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: transit.stations.filter((x) => onLine.has(x.name) || mine.has(x.name)).map((x) => ({ type: 'Feature', properties: { name: x.name, open: x.open }, geometry: { type: 'Point', coordinates: [x.lng, x.lat] } })) } });
    map.addLayer({ id: 'st', type: 'circle', source: 'stations', paint: { 'circle-radius': 4.5, 'circle-color': ['case', ['get', 'open'], ink, panel], 'circle-stroke-color': ink, 'circle-stroke-width': 1.4 } });
    if (kit.vector) map.addLayer({ id: 'st-label', type: 'symbol', source: 'stations', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': ink, 'text-halo-color': panel, 'text-halo-width': 1.4 } });
  });
  const el = document.createElement('div'); el.className = 'dt-center'; el.textContent = d.area.name;
  new ML.Marker({ element: el, anchor: 'bottom', offset: [0, -7] }).setLngLat([d.area.center.lng, d.area.center.lat]).addTo(map);
}
document.addEventListener('themechange', () => { const m = location.hash.match(/^#\/market\/area\/([^/?]+)$/); if (m && document.getElementById('dt-map')) districtDetail(decodeURIComponent(m[1]), { silent: true }); });
