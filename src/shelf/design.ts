// Pure cover design choices; no runtime imports so Node can run it directly in unit tests.
export type Family = 'gilt' | 'deco' | 'modern' | 'botanical' | 'label'
export interface Design { family: Family; foil: string; accent: string }
export const FAMILIES: Family[] = ['gilt', 'deco', 'modern', 'botanical', 'label']
const FOILS = ['#e8c58a', '#f3e6c4', '#2b2119', '#1f2a2e']
const ACCENTS = ['#a8432c', '#c99a2e', '#2d5560', '#6e2433', '#d8c9a7', '#3c4a2b', '#b8714a']

export function seed(text: string) {
  let n = 2166136261
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function mix(hex: string, pole: number, t: number) {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + pole * t).toString(16).padStart(2, '0')).join('')
}
export function design(title: string, color: string): Design {
  const n = seed(title)
  const best = FOILS.find(f => contrast(f, color) >= 4.5) ??
    FOILS.reduce((best, f) => contrast(f, color) > contrast(best, color) ? f : best)
  // No candidate reaches 4.5 on mid-tone cloth (e.g. #9b6b38), so lift the best one toward white or black until it does.
  const pole = contrast('#ffffff', color) > contrast('#000000', color) ? 255 : 0
  let foil = best
  for (let t = 0.1; contrast(foil, color) < 4.5 && t <= 1.01; t += 0.1) foil = mix(best, pole, t)
  // A seeded accent among those distinct enough from the cloth to read as a separate band.
  const ok = ACCENTS.filter(a => contrast(a, color) >= 1.6)
  return { family: FAMILIES[n % FAMILIES.length], foil, accent: ok.length ? ok[(n >>> 8) % ok.length] : ACCENTS[0] }
}
