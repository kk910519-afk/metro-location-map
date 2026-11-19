/* 라이트/다크 테마 전환. data-theme 속성과 localStorage로 유지한다. */
import { icon, local } from './util.js';

export function currentTheme() {
  return document.documentElement.dataset.theme || 'light';
}
export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  local.set('theme', t);
  const b = document.getElementById('theme-btn');
  if (b) { b.innerHTML = t === 'dark' ? icon('sun') : icon('moon'); b.setAttribute('aria-label', t === 'dark' ? '밝은 테마로 전환' : '어두운 테마로 전환'); b.title = b.getAttribute('aria-label'); }
  document.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}
export function initTheme() {
  const saved = local.get('theme', null) || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(saved);
  const b = document.getElementById('theme-btn');
  if (b) b.onclick = () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
