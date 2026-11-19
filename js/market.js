// 지구별 실거래 요약과 단지 비교, 지구 편집·자료·백업 화면. 차트는 한 축·한 계열만 쓰고(가격과 거래량은 따로), 호버 툴팁을 제공한다.
import { $app, api, esc, eokman, money, icon, toast, opt, local, dt, isPublic } from './util.js';
import { districtsHome } from './districts.js';
import { lineChart, bindCharts, eok, ymLabel } from './charts.js';
import { safeHref } from './links.js';
export { eok };

const state = { band: 's84', ...local.get('market.v1', {}) };
// 외부 서비스 바로가기(호가·매물은 앱으로 가져오지 않고 해당 서비스에서 확인)
export const linkRow = (links) => (links || []).map((l) => `<a class="ext" href="${esc(safeHref(l.url))}" target="_blank" rel="noopener" title="${esc(l.note || '')}">${esc(l.label)}</a>`).join('');
export const pctText = (v) => (v === null || v === undefined ? '<span class="muted">비교 불가</span>' : `<span class="chg ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : '–'} ${Math.abs(v).toFixed(1)}%</span>`);

// ---------- 공통 조각 ----------
const notConfigured = (keyVar) => `<div class="empty panel">${icon('alert')}<b>실거래가 인증키가 없습니다</b><p class="small muted">${esc(keyVar)}를 설정하고 다시 시작하면 지역별 실거래가 표시됩니다. 데모 자료로 대신 보여주지 않습니다.</p></div>`;
const sourceLine = (r) => `<p class="small muted">출처 <a href="${esc(safeHref(r.source.url))}" target="_blank" rel="noopener">${esc(r.source.name)}</a> · 조회 ${esc(dt(r.fetchedAt))}${(r.errors || []).length ? ` · <span style="color:var(--warn)">일부 달 조회 실패 ${r.errors.length}건(${esc(r.errors[0].message)})</span>` : ''} · 해제된 거래는 계산에서 제외합니다.</p>`;

// 호재·규제 조사 자료(AI 조사, 출처 포함). 사실로 단정하지 않고 확인 상태와 출처를 함께 보여준다.
const CONF = { high: ['badge-ok', '출처 확인'], medium: ['badge-warn', '재확인 권장'], low: ['badge-muted', '불확실'] };
const factSrc = (s) => (s || []).map((x) => `<a href="${esc(safeHref(x.url))}" target="_blank" rel="noopener">${esc(x.title || '출처')}</a>${x.date && x.date !== '미확인' ? ` <span class="muted">(${esc(x.date)}${x.type === 'news' ? ', 보도' : ''})</span>` : ''}`).join(' · ');
// 호재 한 건(이름·상태·목표 시기·확인 상태·요약·출처). withAreas: 연결된 지구 이름을 함께 보여준다.
const catalystItem = (c, withAreas = false) => `<li><div class="row spread"><b>${esc(c.name || c.title)}${withAreas && c.areas?.length ? ` <span class="small muted">${esc(c.areas.slice(0, 4).join(', '))}${c.areas.length > 4 ? ` 외 ${c.areas.length - 4}곳` : ''}</span>` : ''}</b><span class="row">${c.status ? `<span class="tag">${esc(c.status)}</span>` : ''}${c.targetDate && c.targetDate !== '미확인' ? `<span class="tag">목표 ${esc(c.targetDate)}</span>` : ''}<span class="badge ${(CONF[c.confidence] || CONF.low)[0]}">${(CONF[c.confidence] || CONF.low)[1]}</span></span></div>
    <div class="small">${esc(c.summary_ko || '')}</div>${c.slipNote_ko ? `<div class="small muted">변경·지연: ${esc(c.slipNote_ko)}</div>` : ''}${c.notes_ko ? `<div class="small muted">${esc(c.notes_ko)}</div>` : ''}<div class="small">${factSrc(c.sources)}</div></li>`;
export const catalystList = (cats) => `<ul class="facts">${cats.map((c) => catalystItem(c)).join('')}</ul>`;
function factsHtml(facts, { areaName = null, compact = false } = {}) {
  if (!facts || (!facts.catalysts?.length && !facts.rules?.length)) return `<div class="panel"><h2>호재·규제 메모</h2><p class="small muted">아직 조사 자료가 없습니다. 아래에 직접 메모와 출처 링크를 남길 수 있습니다.</p></div>`;
  const match = (c) => !areaName || (c.areas || []).includes(areaName);
  const cats = (facts.catalysts || []).filter(match);
  const grouped = (xs) => [['rail', '신설 노선(지도에 표시)'], ['rail-other', '그 밖의 철도 계획'], ['development', '지구별 개발 계획']].map(([k, title]) => { const g = xs.filter((c) => (c.kind || 'development') === k); return g.length ? `<details class="facts-group" ${k === 'rail' ? 'open' : ''}><summary><b>${title}</b> <span class="muted">${g.length}건</span></summary><ul class="facts">${g.map(item).join('')}</ul></details>` : ''; }).join('');
  const item = (c) => catalystItem(c, !areaName);
  return `<div class="panel"><div class="row spread"><h2>${areaName ? `${esc(areaName)} 관련 호재` : '호재·개발 계획'}</h2><span class="small muted">AI가 ${esc(facts.asOf || '')}에 조사한 자료 · 일정은 자주 바뀌므로 출처에서 재확인</span></div>
    ${cats.length ? `${!areaName && !compact ? grouped(cats) : `<ul class="facts">${(compact ? cats.slice(0, 4) : cats).map(item).join('')}</ul>`}${compact && cats.length > 4 ? `<a class="small" href="#/market/facts">전체 ${cats.length}건 보기</a>` : ''}` : '<p class="small muted">이 지역에 연결된 조사 항목이 없습니다.</p>'}
    ${!areaName && !compact && facts.rules?.length ? `<h2 style="margin-top:16px">매매 규제·세금</h2><ul class="facts">${facts.rules.map(item).join('')}</ul>` : ''}
    ${!compact && facts.unverified?.length ? `<p class="small muted">확인하지 못한 항목: ${facts.unverified.map(esc).join(', ')}</p>` : ''}</div>`;
}
export function notesHtml(notes, areas, areaId = null) {
  const list = notes.filter((n) => !areaId || n.areaId === areaId || !n.areaId);
  return `<div class="panel"><h2>내 메모 <span class="small muted">임장·중개사 통화·기사 링크</span></h2>
    <form id="note-form" class="row" style="flex-wrap:wrap;align-items:flex-end"><label class="field" style="flex:2;min-width:220px">메모<input name="text" required maxlength="1000" placeholder="예: ○○단지 84A 로열층 9.1억 매물, 12월 입주 가능"></label><label class="field" style="flex:1;min-width:160px">링크(선택)<input name="url" type="url" placeholder="https://"></label>
      ${areaId ? '' : `<label class="field">지역<select name="areaId"><option value="">전체</option>${areas.map((a) => opt(a.id, a.name, '')).join('')}</select></label>`}<button class="btn small" type="submit">남기기</button></form>
    ${list.length ? `<ul class="facts">${list.map((n) => `<li><div class="row spread"><span>${esc(n.text)}${n.url ? ` <a href="${esc(safeHref(n.url))}" target="_blank" rel="noopener">링크</a>` : ''}</span><span class="row"><span class="small muted">${esc(areas.find((a) => a.id === n.areaId)?.name || '전체')} · ${esc(dt(n.createdAt))}</span><button type="button" class="btn small secondary" data-del-note="${n.id}">삭제</button></span></div></li>`).join('')}</ul>` : '<p class="small muted">아직 메모가 없습니다.</p>'}</div>`;
}
export function bindNotes(areaId, rerender) {
  const f = document.getElementById('note-form');
  if (f) f.onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(f); try { await api('api/market/notes', { method: 'POST', body: { text: fd.get('text'), url: fd.get('url') || null, areaId: areaId || fd.get('areaId') || null } }); toast('메모를 남겼습니다'); rerender(); } catch (err) { toast(err.message, true); } };
  for (const b of $app.querySelectorAll('[data-del-note]')) b.onclick = async () => { await api(`api/market/notes/${b.dataset.delNote}`, { method: 'DELETE' }); rerender(); };
}

// ---------- 화면: 지구별 입지(첫 화면) ----------
const wrow = (w) => `<tr><td><a href="#/market/area/${w.areaId}/complex?key=${encodeURIComponent(w.key)}&band=${w.band}"><b>${esc(w.aptNm)}</b></a><div class="small muted">${esc(w.areaName)} · ${esc(w.umdNm)} · ${esc((w.bandLabel || '').split(' ')[0])}${w.stat?.buildYear ? ` · ${w.stat.buildYear}년` : ''}</div>${w.memo ? `<div class="small">${esc(w.memo)}</div>` : ''}</td>
      <td class="num">${w.stat ? money(w.stat.recentMedian) : '<span class="muted">거래 없음</span>'}<div class="small muted">${esc(w.stat?.recentBasis || '')}</div></td>
      <td class="num">${pctText(w.stat?.yoyPct)}</td><td class="num">${w.stat?.offPeakPct === null || w.stat?.offPeakPct === undefined ? '-' : `${w.stat.offPeakPct}%`}</td>
      <td><button type="button" class="btn small secondary" data-unwatch="${esc(w.areaId)}|${esc(w.band)}|${esc(w.key)}">빼기</button></td></tr>`;
export const watchPanel = (wl) => `<div class="panel"><div class="row spread"><h2>관심 단지 ${wl.items?.length ? `<span class="count">${wl.items.length}곳</span>` : ''}</h2><span class="small muted">최근 3개월 중앙값 기준</span></div>
      ${wl.items?.length ? `<div class="table-wrap"><table><tr><th>단지</th><th class="num">최근 중앙값</th><th class="num">1년 전 대비</th><th class="num">기간 최고 대비</th><th></th></tr>${wl.items.map(wrow).join('')}</table></div>` : '<p class="small muted">지구를 열어 단지 옆의 별표를 누르면 여기에 모아 비교합니다.</p>'}</div>`;
export function bindWatchPanel(rerender) {
  for (const b of $app.querySelectorAll('[data-unwatch]')) b.onclick = async () => { const [areaId, band, ...k] = b.dataset.unwatch.split('|'); await api('api/market/watch', { method: 'PUT', body: { areaId, band, key: k.join('|'), watched: false } }); rerender(); };
}
export async function market() {
  return districtsHome();
}

// ---------- 화면: 단지 상세 ----------
export async function marketComplex(id, opts = {}) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const key = q.get('key'); const band = q.get('band') || state.band;
  if (!opts.silent) $app.innerHTML = '<p class="muted">불러오는 중…</p>';
  const r = await api(`api/market/areas/${id}/complex?key=${encodeURIComponent(key)}&band=${band}&months=36`);
  if (!r.ok) { $app.innerHTML = `<div class="callout bad">실거래 조회 실패: ${esc(r.error?.message || '')}</div>`; return; }
  const months = r.months; const idx = (d) => { const ym = d.slice(0, 4) + d.slice(5, 7); const i = months.indexOf(ym); return i < 0 ? null : i + (Number(d.slice(8, 10)) - 15) / 31; };
  const dots = r.trades.filter((t) => !t.canceled).map((t) => ({ x: idx(t.dealDate), value: t.priceWon, tip: `${t.dealDate} · ${t.areaM2}㎡ ${t.floor ?? '?'}층 · ${eokman(t.priceWon)}` })).filter((d) => d.x !== null);
  const s = r.stat;
  const here = (extra) => `#/market/area/${id}/complex?key=${encodeURIComponent(key)}&band=${extra.band || band}`;
  $app.innerHTML = `<p class="small"><a href="#/market/area/${id}">← ${esc(r.area.name)}</a></p>
    <div class="row spread"><div><h1>${esc(r.aptNm)}</h1><div class="muted small">${esc(r.umdNm)}${s?.buildYear ? ` · ${s.buildYear}년 준공` : ''}${s ? ` · 전용 ${s.areas.join('·')}㎡` : ''}</div></div>
      <div class="row"><button type="button" class="btn secondary" id="watch-btn">${r.watched ? '★ 관심 단지' : '☆ 관심 단지에 담기'}</button></div></div>
    <div class="link-row"><span class="small muted">호가·매물 확인</span>${linkRow(r.links)}${(r.commute || []).length ? `<span class="small muted">기준 역에서 길찾기(카카오맵)</span>${r.commute.map((c) => `<a class="ext" href="${esc(safeHref(c.url))}" target="_blank" rel="noopener">${esc(c.hub)}</a>`).join('')}` : ''}</div>
    <div class="row" style="margin:8px 0;flex-wrap:wrap">${r.otherBands.map((b) => `<a class="chip ${b.key === band ? 'on' : ''}" href="${here({ band: b.key })}">${esc(b.label.split(' ')[0])} <span class="muted">${b.count}건</span></a>`).join('')}</div>
    ${s ? `<div class="grid grid-3" style="margin-bottom:12px">
      <div class="stat"><div class="label">최근 중앙값</div><div class="value">${esc(eokman(s.recentMedian))}</div><div class="small muted">${esc(s.recentBasis)} · ㎡당 ${esc(eokman(Math.round(s.recentPerM2)))}</div></div>
      <div class="stat"><div class="label">3년 내 최고가 대비</div><div class="value">${s.offPeakPct === null ? '-' : `${s.offPeakPct}%`}</div><div class="small muted">최고 ${esc(eokman(s.peak.priceWon))} (${esc(s.peak.dealDate)} · ${esc(s.peak.floor ?? '?')}층) · 최저 ${esc(eokman(s.low.priceWon))}</div></div>
      <div class="stat"><div class="label">1년 전 대비 · 거래 수</div><div class="value">${pctText(s.yoyPct)}</div><div class="small muted">3년 ${s.count}건 · 최근 거래 ${esc(s.last.dealDate)}</div></div></div>` : '<div class="callout warn">이 면적대의 유효한 거래가 없습니다. 다른 면적을 골라 보세요.</div>'}
    <div class="panel">${lineChart({ id: 'ch-cx', title: '거래별 가격(점)과 월 중앙값(선) · 최근 36개월', points: r.series.map((x) => ({ label: ymLabel(x.ym), value: x.medianPrice, sub: `${x.count}건` })), dots, height: 250 })}</div>
    <div class="panel"><h2>실거래 내역 <span class="count">${r.trades.length}건</span></h2><div class="table-wrap"><table><tr><th>계약일</th><th class="num">전용</th><th class="num">층</th><th class="num">거래금액</th><th>구분</th></tr>
      ${r.trades.slice(0, 80).map((t) => `<tr class="${t.canceled ? 'trade-canceled' : ''}"><td>${esc(t.dealDate)}</td><td class="num">${esc(t.areaM2)}㎡</td><td class="num">${esc(t.floor ?? '?')}</td><td class="num">${esc(eokman(t.priceWon))}</td><td class="small">${t.canceled ? `<span class="badge badge-bad">해제${t.cancelDate ? ` ${esc(t.cancelDate)}` : ''}</span>` : esc(t.dealingType || '')}${t.aptDong ? ` · ${esc(t.aptDong)}동` : ''}</td></tr>`).join('')}</table></div>${r.trades.length > 80 ? '<p class="small muted">최근 80건만 표시합니다.</p>' : ''}</div>
    ${sourceLine(r)}`;
  bindCharts();
  document.getElementById('watch-btn').onclick = async () => { await api('api/market/watch', { method: 'PUT', body: { areaId: id, key, band, watched: !r.watched } }); toast(r.watched ? '관심 단지에서 뺐습니다' : '관심 단지에 담았습니다'); marketComplex(id, { silent: true }); };
}
// ---------- 화면: 관심 지역 편집 ----------
export async function marketAreas() {
  const cfg = await api('api/market/config'); let areas = JSON.parse(JSON.stringify(cfg.areas));
  const codes = Object.entries(cfg.lawdCodes).filter(([k]) => !k.startsWith('_')).flatMap(([sido, m]) => Object.entries(m).map(([gu, code]) => ({ code, label: `${sido} ${gu}` })));
  const draw = () => {
    $app.innerHTML = `<p class="small"><a href="#/market">← 급지 지도</a></p><h1>지구 목록 편집</h1>
      <p class="small muted">지구는 시군구와 법정동 묶음입니다. 필요 없는 지구는 삭제하고, 보고 싶은 곳은 아래에서 추가하세요. 직접 추가한 지구는 연결된 역이 없어 교통 점수가 미확인으로 나옵니다.</p>
      <div class="panel"><div class="table-wrap"><table><tr><th>이름</th><th>묶음</th><th>범위</th><th></th></tr>
        ${areas.map((a, i) => `<tr><td><input data-name="${i}" value="${esc(a.name)}" style="width:150px"></td><td><input data-group="${i}" value="${esc(a.group)}" style="width:110px"></td><td class="small">${a.parts.map((p) => `${esc(p.sigungu || p.lawdCd)}: ${p.dongs.map(esc).join(', ')}`).join('<br>')}</td><td><button type="button" class="btn small secondary" data-rm="${i}">삭제</button></td></tr>`).join('')}</table></div>
        <div class="row" style="margin-top:10px"><button class="btn" id="areas-save">저장</button><button class="btn secondary" id="areas-reset">기본값으로 되돌리기</button></div></div>
      <div class="panel"><h2>지역 추가</h2><div class="row" style="flex-wrap:wrap;align-items:flex-end">
        <label class="field">이름<input id="new-name" placeholder="예: 광명 철산"></label><label class="field">묶음<input id="new-group" placeholder="예: 광명" style="width:110px"></label>
        <label class="field">시군구<select id="new-code"><option value="">선택</option>${codes.map((c) => `<option value="${c.code}">${esc(c.label)}</option>`).join('')}</select></label><button type="button" class="btn secondary" id="load-dongs">동 불러오기</button></div>
        <div id="dong-box" class="row" style="flex-wrap:wrap;margin-top:8px"></div><div class="row" style="margin-top:8px"><button type="button" class="btn" id="add-area" disabled>추가</button></div></div>`;
    for (const el of $app.querySelectorAll('[data-name]')) el.oninput = () => { areas[Number(el.dataset.name)].name = el.value; };
    for (const el of $app.querySelectorAll('[data-group]')) el.oninput = () => { areas[Number(el.dataset.group)].group = el.value; };
    for (const el of $app.querySelectorAll('[data-rm]')) el.onclick = () => { areas.splice(Number(el.dataset.rm), 1); draw(); };
    document.getElementById('areas-save').onclick = async () => { try { await api('api/market/areas', { method: 'PUT', body: { areas } }); toast('저장했습니다'); location.hash = '#/market'; } catch (e) { toast(e.message, true); } };
    document.getElementById('areas-reset').onclick = async () => { const r = await api('api/market/areas/reset', { method: 'POST' }); areas = r.areas; toast('기본 지역으로 되돌렸습니다'); draw(); };
    document.getElementById('load-dongs').onclick = async () => {
      const code = document.getElementById('new-code').value; const box = document.getElementById('dong-box'); if (!code) return toast('시군구를 고르세요', true);
      box.textContent = '불러오는 중…';
      try { const r = await api(`api/market/dongs?lawdCd=${code}`); box.innerHTML = r.dongs.length ? r.dongs.map((d) => `<label class="inline small"><input type="checkbox" value="${esc(d.name)}"> ${esc(d.name)} <span class="muted">${d.trades}건</span></label>`).join('') : '<span class="small muted">최근 3개월 거래가 없습니다.</span>'; document.getElementById('add-area').disabled = !r.dongs.length; } catch (e) { box.textContent = e.message; }
    };
    document.getElementById('add-area').onclick = () => {
      const name = document.getElementById('new-name').value.trim(); const sel = document.getElementById('new-code'); const dongs = [...document.querySelectorAll('#dong-box input:checked')].map((x) => x.value);
      if (!name || !dongs.length) return toast('이름과 동을 하나 이상 고르세요', true);
      areas.push({ id: null, name, group: document.getElementById('new-group').value.trim() || '기타', note: '', parts: [{ lawdCd: sel.value, sigungu: sel.selectedOptions[0].textContent.split(' ').slice(1).join(' '), dongs }] }); draw(); toast('아래 "저장"을 눌러야 반영됩니다');
    };
  };
  draw();
}

// ---------- 화면: 호재·규제 자료 ----------
export async function marketFacts() {
  const cfg = await api('api/market/config');
  $app.innerHTML = `<p class="small"><a href="#/market">← 급지 지도</a></p><h1>노선·호재 자료</h1>
    <div class="callout">AI가 공개 자료를 조사해 정리한 내용입니다. 개통·입주 시기와 대출 규제는 자주 바뀌므로, 계약 전에는 각 항목의 출처와 은행·구청에서 다시 확인하세요.</div>
    ${factsHtml(cfg.facts)}${isPublic() ? '' : notesHtml(cfg.notes, cfg.areas)}`;
  if (!isPublic()) bindNotes(null, () => marketFacts());
}

// ---------- 화면: 백업 ----------
export async function marketBackup() {
  const draw = async () => {
    const b = await api('api/backups');
    $app.innerHTML = `<p class="small"><a href="#/market">← 급지 지도</a></p><h1>백업</h1>
      <div class="panel"><p class="small muted">내 메모·내 점수·관심 지구·관심 단지·급지 비중이 든 저장 파일을 복사해 둡니다. 실거래 저장분은 다시 받을 수 있으므로 백업하지 않습니다.</p>
        <div class="row"><button type="button" class="btn" id="backup-btn">지금 백업 만들기</button></div>
        <p class="small muted" style="margin-top:10px">저장 파일 ${esc(b.dataFile || '-')}</p>
        ${b.files.length ? `<ul class="facts">${b.files.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>${b.count > b.files.length ? `<p class="small muted">최근 ${b.files.length}개만 표시합니다(전체 ${b.count}개).</p>` : ''}` : '<p class="small muted">아직 백업이 없습니다.</p>'}</div>`;
    document.getElementById('backup-btn').onclick = async () => { try { const r = await api('api/backup', { method: 'POST' }); toast(`백업 완료: ${r.file}`); draw(); } catch (e) { toast(e.message, true); } };
  };
  await draw();
}
