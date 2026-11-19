// 공개 사이트(읽기 전용 스냅샷)의 순수 계산 부분. 화면이 서버에 하던 요청을 미리 내보낸 자료 파일로 돌리고,
// 관심 지구·급지 비중처럼 방문자마다 다른 것은 브라우저 저장값을 응답에 입힌다. 브라우저 API를 쓰지 않아 Node에서 테스트한다.
import { retier, normalizeTierWeights, TIER_RULE } from './tier.js';

export const PUBLIC_STATE_KEY = 'public.v1';
const FILES = { 'api/meta': 'data/meta.json', 'api/market/transit': 'data/transit.json', 'api/market/config': 'data/config.json' };

// 요청 → { file, post?, ids? }(자료 파일) | { local: 'pin' | 'weights' }(브라우저 저장) | { value }(고정 응답) | null(공개 사이트에 없는 기능)
export function staticRoute(method, path) {
  const m = String(method || 'GET').toUpperCase();
  const [rawPath, query = ''] = String(path || '').replace(/^\//, '').split('?');
  if (m === 'PUT' && rawPath === 'api/market/pin') return { local: 'pin' };
  if (m === 'PUT' && rawPath === 'api/market/tiers/weights') return { local: 'weights' };
  if (m !== 'GET') return null;
  if (FILES[rawPath]) return { file: FILES[rawPath] };
  if (rawPath === 'api/market/districts') return { file: 'data/districts.json', post: 'districts' };
  if (rawPath === 'api/market/watchlist') return { value: { ok: true, items: [] } };
  if (rawPath === 'api/market/overview') { const ids = (new URLSearchParams(query).get('ids') || '').split(',').filter(Boolean); return { file: 'data/overview.json', post: 'overview', ids }; }
  const d = rawPath.match(/^api\/market\/areas\/([a-z0-9-]+)\/detail$/); // 지구 id는 소문자·숫자·붙임표만(경로를 벗어나는 주소를 막는다)
  if (d) return { file: `data/detail/${d[1]}.json` };
  return null;
}

// 브라우저에 저장해 둔 관심 지구와 비중. 저장이 막혔거나 값이 이상하면 기본값(빈 관심 목록, 기본 비중)으로 본다.
export function readPublicState(storage) {
  const empty = { pinned: [], weights: null };
  let raw = null;
  try { raw = storage?.getItem(PUBLIC_STATE_KEY) ?? null; } catch { return empty; }
  if (!raw) return empty;
  let v; try { v = JSON.parse(raw); } catch { return empty; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return empty;
  const pinned = Array.isArray(v.pinned) ? v.pinned.filter((x) => typeof x === 'string') : [];
  const weights = v.weights && typeof v.weights === 'object' ? normalizeTierWeights(v.weights) : null;
  return { pinned, weights };
}

const sameWeights = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);
// 지구 목록 응답에 관심 표시를 입히고, 내 비중이 있으면 급지·순위를 다시 매긴다
export function applyLocal(res, { pinned = [], weights = null } = {}) {
  const pins = new Set(pinned);
  const w = weights && typeof weights === 'object' ? normalizeTierWeights(weights) : null;
  const custom = !!w && !sameWeights(w, TIER_RULE.weights);
  const districts = (res.districts || []).map((d) => ({ ...d, pinned: pins.has(d.id) }));
  if (custom) retier(districts, w);
  return { ...res, districts, tiers: { ...res.tiers, rule: { ...(res.tiers?.rule || TIER_RULE), weights: custom ? w : TIER_RULE.weights }, custom } };
}

// 가격 요약(모든 지구가 한 파일)에서 요청한 지구만 고른다
export const pickOverview = (res, ids) => { const want = new Set(ids || []); return { ...res, areas: (res.areas || []).filter((a) => want.has(a.id)) }; };
