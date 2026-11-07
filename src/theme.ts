import { useSyncExternalStore } from 'react'
export type Theme = 'system' | 'light' | 'dark'
const KEY = 'shelfscape-theme', DARK = '(prefers-color-scheme: dark)'
let memory: Theme = 'system'   // used when storage is blocked
export function getTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system' } catch { return memory }
}
const resolve = (): 'light' | 'dark' => { const t = getTheme(); return t === 'system' ? (matchMedia(DARK).matches ? 'dark' : 'light') : t }
export function applyTheme(): 'light' | 'dark' {
  const mode = resolve()
  document.documentElement.dataset.theme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#111113' : '#f5f5f3')
  return mode
}
export function setTheme(t: Theme) {
  memory = t
  try { localStorage.setItem(KEY, t) } catch { /* storage blocked: choice is not saved */ }
  applyTheme(); dispatchEvent(new CustomEvent(KEY))
}
function subscribe(cb: () => void) {
  const mq = matchMedia(DARK)
  const change = () => { applyTheme(); cb() }
  addEventListener(KEY, cb); mq.addEventListener('change', change)
  return () => { removeEventListener(KEY, cb); mq.removeEventListener('change', change) }
}
export const useTheme = () => useSyncExternalStore(subscribe, getTheme)
export const useResolvedTheme = () => useSyncExternalStore(subscribe, resolve)
