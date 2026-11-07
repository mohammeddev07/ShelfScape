import { useSyncExternalStore } from 'react'
export type Theme = 'system' | 'light' | 'dark'
const KEY = 'shelfscape-theme', DARK = '(prefers-color-scheme: dark)'
export function getTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system' } catch { return 'system' }
}
const resolve = (): 'light' | 'dark' => { const t = getTheme(); return t === 'system' ? (matchMedia(DARK).matches ? 'dark' : 'light') : t }
export function applyTheme(): 'light' | 'dark' {
  const mode = resolve()
  document.documentElement.dataset.theme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#1d1a16' : '#f7f2e8')
  return mode
}
export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t) } catch { /* storage blocked: choice is not saved */ }
  applyTheme(); dispatchEvent(new CustomEvent(KEY))
}
function subscribe(cb: () => void) {
  const mq = matchMedia(DARK)
  const change = () => { applyTheme(); cb() }
  addEventListener(KEY, cb); mq.addEventListener('change', change)
  return () => { removeEventListener(KEY, cb); mq.removeEventListener('change', change) }
}
export const useResolvedTheme = () => useSyncExternalStore(subscribe, resolve)
