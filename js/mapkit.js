/* 지도 도구: MapLibre GL JS + OpenFreeMap 벡터 스타일. 바탕 색과 라벨 밀도를 테마에 맞춰 바꾼다. */
import { S } from './util.js';

const theme = () => document.documentElement.dataset.theme || 'light';
let baseStyle = null;

// 따뜻한 바탕: OpenFreeMap Positron 레이어 색을 테마별로 바꾸고, 도로명·표지판 등 잔정보를 숨긴다. 급지 핀(갈색 계열)이 잘 보이도록 바탕은 옅게 둔다.
export const PALETTE = {
  light: {
    background: '#F1EADD', park: '#DDE2C6', landcover_wood: '#D2DAB9', landuse_residential: '#EDE5D7', water: '#BFD3D9', waterway: '#AFC8CF',
    building: ['#E6DCCB', '#D9CDB9'], highway_minor: '#E9E0D0', highway_major_inner: '#FFFBF4', highway_major_casing: '#DACDB8', highway_major_subtle: 'rgba(218,205,184,0.6)',
    highway_motorway_inner: '#EFD9A8', highway_motorway_casing: '#D9C28F', highway_motorway_subtle: 'rgba(217,194,143,0.5)', highway_motorway_bridge_inner: '#EFD9A8', highway_motorway_bridge_casing: '#D9C28F',
    tunnel_motorway_inner: '#EEE3C6', tunnel_motorway_casing: '#E0D6BF', railway: '#D6CAB6', railway_dashline: '#F5EFE3', boundary: '#C9BBA6', highway_path: '#ECE4D5',
    label_city: ['#2F2A24', 'rgba(247,241,231,0.92)'], label_other: ['#5A5046', 'rgba(247,241,231,0.92)'], water_name: ['#4F6F7A', 'rgba(247,241,231,0.8)'], road_name: ['#938673', '#F1EADD'],
  },
  dark: {
    background: '#1E1913', park: '#2A2E1E', landcover_wood: '#262A1B', landuse_residential: '#241E17', water: '#22343A', waterway: '#2A3F46',
    building: ['#2A231B', '#332A20'], highway_minor: '#2E261D', highway_major_inner: '#3D3428', highway_major_casing: '#2A231B', highway_major_subtle: 'rgba(61,52,40,0.5)',
    highway_motorway_inner: '#5E4E30', highway_motorway_casing: '#40351F', highway_motorway_subtle: 'rgba(94,78,48,0.5)', highway_motorway_bridge_inner: '#5E4E30', highway_motorway_bridge_casing: '#40351F',
    tunnel_motorway_inner: '#463C2A', tunnel_motorway_casing: '#332A20', railway: '#3D3428', railway_dashline: '#1E1913', boundary: '#54483A', highway_path: '#2E261D',
    label_city: ['#EFE4D2', 'rgba(30,25,19,0.9)'], label_other: ['#B3A691', 'rgba(30,25,19,0.9)'], water_name: ['#8FB3BF', 'rgba(30,25,19,0.8)'], road_name: ['#85796A', '#1E1913'],
  },
};
const HIDE_LAYERS = new Set(['highway-name-path', 'highway-name-minor', 'highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us', 'airport', 'railway_service', 'railway_service_dashline', 'waterway_line_label']);
export function buildStyle(baseStyle, t) {
  const P = PALETTE[t] || PALETTE.light; const st = JSON.parse(JSON.stringify(baseStyle));
  const set = (l, k, v) => { l.paint = l.paint || {}; l.paint[k] = v; };
  for (const l of st.layers) {
    if (HIDE_LAYERS.has(l.id)) { l.layout = { ...(l.layout || {}), visibility: 'none' }; continue; }
    if (l.id === 'label_other') l.minzoom = Math.max(l.minzoom || 0, 12);
    // 지명은 한글 우선(name:ko → name). 시안처럼 한글 지명만 간결하게 보이도록 라틴/비라틴 2줄 표기를 없앤다.
    if (l.type === 'symbol' && l.layout && l.layout['text-field']) l.layout['text-field'] = ['coalesce', ['get', 'name:ko'], ['get', 'name']];
    if (l.id === 'highway-name-major') { l.minzoom = Math.max(l.minzoom || 0, 13.5); set(l, 'text-color', P.road_name[0]); set(l, 'text-halo-color', P.road_name[1]); }
    if (l.id === 'building') { set(l, 'fill-color', P.building[0]); set(l, 'fill-outline-color', P.building[1]); }
    else if (l.id in P && typeof P[l.id] === 'string') set(l, l.type === 'background' ? 'background-color' : l.type === 'fill' ? 'fill-color' : 'line-color', P[l.id]);
    else if (/^boundary/.test(l.id)) set(l, 'line-color', P.boundary);
    else if (/^railway/.test(l.id)) set(l, 'line-color', l.id.includes('dashline') ? P.railway_dashline : P.railway);
    else if (/^label_city|^label_country|^label_state/.test(l.id)) { set(l, 'text-color', P.label_city[0]); set(l, 'text-halo-color', P.label_city[1]); }
    else if (/^label_/.test(l.id)) { set(l, 'text-color', P.label_other[0]); set(l, 'text-halo-color', P.label_other[1]); }
    else if (/^water_name/.test(l.id)) { set(l, 'text-color', P.water_name[0]); set(l, 'text-halo-color', P.water_name[1]); }
    if (l.type === 'raster') set(l, 'raster-opacity', t === 'dark' ? 0.15 : 0.35);
  }
  return st;
}
const rasterStyle = () => ({ version: 8, sources: { osm: { type: 'raster', tiles: [S.META.map.fallbackRaster.tiles], tileSize: 256, attribution: S.META.map.fallbackRaster.attribution } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] });

let ML = null; // MapLibre GL JS(ESM)를 이 파일 기준 상대 경로에서 불러온다(내 PC·공개 사이트 양쪽에서 같은 경로).
async function loadMapLib() {
  if (ML) return ML;
  try { const mod = await import('../vendor/maplibre/maplibre-gl.mjs'); ML = mod.default || mod; } catch (e) { console.error('MapLibre 로드 실패', e); ML = null; }
  return ML;
}
// 지도 라이브러리와 테마에 맞춘 스타일. 벡터 스타일을 못 받으면 OpenStreetMap 래스터로 대신한다. restyle(t)는 다른 테마의 스타일을 만든다.
export async function getMapKit() {
  const lib = await loadMapLib(); if (!lib) return null;
  if (!baseStyle) { try { const r = await fetch(S.META.map.styleUrl); if (!r.ok) throw new Error(String(r.status)); baseStyle = await r.json(); } catch { baseStyle = null; } }
  const restyle = (t = theme()) => (baseStyle ? buildStyle(baseStyle, t) : rasterStyle());
  return { ML: lib, style: restyle(), vector: !!baseStyle, restyle };
}
