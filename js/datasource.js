// 화면이 자료를 얻는 곳. 내 PC에서는 서버(api/...)에 묻고, 공개 사이트(읽기 전용 스냅샷)에서는 미리 내보낸 자료 파일(data/...)을 읽는다.
// 공개 사이트인지는 index.html의 <meta name="site-data" content="static">으로 안다(내보내기 스크립트가 넣는다).
import { staticRoute, applyLocal, pickOverview, readPublicState, PUBLIC_STATE_KEY } from './static-routes.js';
import { normalizeTierWeights } from './tier.js';

const STATIC = typeof document !== 'undefined' && document.querySelector('meta[name="site-data"]')?.content === 'static';
export const isStaticData = () => STATIC;

const storage = () => { try { return window.localStorage; } catch { return null; } };
const saveState = (state) => { try { storage()?.setItem(PUBLIC_STATE_KEY, JSON.stringify(state)); } catch { /* 저장이 막혀 있으면 이번 화면에서만 반영된다 */ } };
async function readFile(file) {
  const res = await fetch(file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status === 404 ? '자료가 없습니다' : `자료를 불러오지 못했습니다(${res.status})`);
  return res.json();
}

async function staticApi(path, opts) {
  const route = staticRoute(opts.method || 'GET', path);
  if (!route) throw new Error('공개 사이트에서는 쓸 수 없는 기능입니다');
  if (route.value) return JSON.parse(JSON.stringify(route.value));
  const state = readPublicState(storage());
  if (route.local === 'pin') {
    const id = String(opts.body?.id || ''); const pinned = state.pinned.filter((x) => x !== id);
    if (id && opts.body?.pinned !== false) pinned.push(id);
    saveState({ ...state, pinned }); return { pinned };
  }
  if (route.local === 'weights') {
    const weights = opts.body?.reset ? null : normalizeTierWeights(opts.body?.weights);
    if (!opts.body?.reset && !weights) throw new Error('비중은 0 이상의 숫자여야 하고, 적어도 하나는 0보다 커야 합니다');
    saveState({ ...state, weights }); return { tiers: { custom: !!weights } };
  }
  const data = await readFile(route.file);
  if (route.post === 'districts') return applyLocal(data, state);
  if (route.post === 'overview') return pickOverview(data, route.ids);
  // 지구 상세: 내 관심 표시와 내 비중으로 다시 매긴 급지·순위를 지구 목록에서 가져와 입힌다
  if (route.file.startsWith('data/detail/') && data.district) {
    const mine = applyLocal(await readFile('data/districts.json'), state).districts.find((d) => d.id === data.district.id);
    if (mine) data.district = mine;
  }
  return data;
}

export async function api(path, opts = {}) {
  if (STATIC) return staticApi(path, opts);
  const res = await fetch(String(path).replace(/^\//, ''), { headers: { 'content-type': 'application/json' }, cache: 'no-store', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}
