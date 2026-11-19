/* 공통 유틸: API 호출, 이스케이프, 금액 표기, 아이콘 */
export const $app = document.getElementById('app');
export const S = { META: null };
export const setMeta = (m) => { S.META = m; };
// 공개 사이트(읽기 전용 스냅샷)인지. 내 PC의 서버에서는 false다.
export const isPublic = () => S.META?.public === true;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 자료 요청: 내 PC에서는 서버, 공개 사이트에서는 자료 파일(js/datasource.js)
export { api } from './datasource.js';

export function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast${err ? ' err' : ''}`; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 3200);
}

export function eokman(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '미확인';
  const sign = n < 0 ? '-' : ''; const abs = Math.round(Math.abs(n));
  const eok = Math.floor(abs / 1e8); const man = Math.floor((abs % 1e8) / 1e4);
  if (!eok && !man) return `${sign}${abs.toLocaleString('ko-KR')}원`;
  return `${sign}${eok ? `${eok}억 ` : ''}${man ? `${man.toLocaleString('ko-KR')}만` : ''}원`.replace(/ 원$/, '원');
}
export const won = (n) => (n === null || n === undefined ? '미확인' : `${Math.round(n).toLocaleString('ko-KR')}원`);
export const money = (n) => (n === null || n === undefined ? '<span class="muted">미확인</span>' : `<span class="money">${esc(eokman(n))}<span class="won">${esc(won(n))}</span></span>`);
// 날짜·시각 표시. 시간대가 붙은 ISO 문자열(…Z)은 보는 사람의 현지 시각으로 바꿔 보여준다.
export const dt = (s) => {
  if (!s) return '-';
  const d = new Date(s);
  if (/T.*(Z|[+-]\d\d:?\d\d)$/.test(String(s)) && !Number.isNaN(d.getTime())) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  return String(s).slice(0, 16).replace('T', ' ');
};
export const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.1C1.4 8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 2.8 1.6-1.7 3-2.8 5-2.8 3.6 0 5.6 3.5 4.3 6.9C19.5 15.9 12 20.5 12 20.5z"/>',
  won: '<path d="M3 7l3 10 3-8 3 8 3-10 3 10"/><path d="M2 11h20M2 14h20"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  compare: '<path d="M8 3v18M16 3v18M3 8h5M3 16h5M16 8h5M16 16h5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-6-6-9 9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// 로컬 저장(화면 상태 복원용). 실패해도 동작에 영향 없음.
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
