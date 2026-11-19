/* 수도권 입지분석 파트너 - 화면 진입점(ES 모듈). 라우터와 시작 코드만 둔다. */
import { $app, S, setMeta, api, esc, isPublic, dt } from './js/util.js';
import { initTheme } from './js/theme.js';
import { market, marketComplex, marketAreas, marketFacts, marketBackup } from './js/market.js';
import { districtDetail } from './js/detail.js';

// ---------- 라우터 ----------
const routes = [
  [/^#\/market$/, () => market()], [/^#\/market\/areas$/, marketAreas], [/^#\/market\/facts$/, marketFacts], [/^#\/market\/backup$/, marketBackup],
  [/^#\/market\/area\/([^/?]+)\/complex/, (m) => marketComplex(m[1])], [/^#\/market\/area\/([^/?]+)/, (m) => districtDetail(decodeURIComponent(m[1]))],
];
async function render() {
  const hash = location.hash || '#/market'; // 첫 화면은 급지 지도
  // 공개 사이트에 없는 화면(단지 상세·지구 편집·백업)은 오류 대신 안내를 보여준다
  if (isPublic() && /^#\/market\/(areas|backup)$|^#\/market\/area\/[^/?]+\/complex/.test(hash)) { $app.innerHTML = `<div class="empty panel"><b>이 주소에는 볼 수 있는 화면이 없습니다.</b><a class="btn small" href="#/market">급지 지도로</a></div>`; return; }
  const navKey = /^#\/market\/facts/.test(hash) ? 'facts' : 'market';
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('active', a.dataset.nav === navKey);
  document.querySelector('.more')?.removeAttribute('open');
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) { try { await fn(m); } catch (e) { console.error(e); $app.innerHTML = `<div class="callout bad">오류: ${esc(e.message)}</div>`; } window.scrollTo({ top: 0 }); return; }
  }
  location.hash = '#/market'; // 모르는 주소는 첫 화면으로
}
window.addEventListener('hashchange', render);

// ---------- 시작 ----------
(async () => {
  initTheme();
  try { setMeta(await api('api/meta')); } catch (e) { $app.innerHTML = `<div class="callout bad">자료를 불러오지 못했습니다: ${esc(e.message)}</div>`; return; }
  // 내 PC에서만 쓰는 메뉴는 공개 사이트에서 감춘다
  if (isPublic()) {
    for (const el of document.querySelectorAll('[data-local]')) el.hidden = true;
    const tag = document.getElementById('asof-tag'); const asOf = S.META.asOf ? dt(S.META.asOf).slice(0, 10) : null;
    if (tag && asOf) { tag.textContent = `자료 기준일 ${asOf}`; tag.title = '이 날짜에 내보낸 읽기 전용 자료입니다'; tag.hidden = false; }
  }
  render();
})();
