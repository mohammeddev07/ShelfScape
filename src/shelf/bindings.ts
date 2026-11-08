import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Book } from '../db'
import { contrast, design, seed, type Design } from './design'
export { seed }

type Ctx = CanvasRenderingContext2D
type Side = 'spine' | 'front' | 'back'
interface Paint { ctx: Ctx; w: number; h: number; side: Side; book: Book; d: Design }
const SERIF = 'Georgia,"Times New Roman",serif', SANS = '"Avenir Next","Helvetica Neue",Arial,sans-serif'
const DECO = 'Futura,"Century Gothic","Avenir Next",sans-serif', INK = '#2b2119', PAPER = '#efe5c9'

function canvas(w: number, h: number) {
  const el = document.createElement('canvas')
  el.width = w; el.height = h
  return el.getContext('2d')!
}
function texture(ctx: Ctx) {
  const map = new CanvasTexture(ctx.canvas)
  map.colorSpace = SRGBColorSpace
  return map
}
export function dimensions(book: Book) {
  const n = seed(book.title)
  return { w: 0.35 + (n % 43) / 115, h: 1.46 + ((n >>> 7) % 50) / 100,
    d: 0.93 + ((n >>> 13) % 22) / 100, tilt: ((n % 13) - 6) / 275 }
}
const unspaced = (text: string) => !/\s/.test(text.trim()) && /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)
// Word wrap; CJK titles without spaces wrap between characters.
function lines(ctx: Ctx, text: string, width: number) {
  const cjk = unspaced(text), gap = cjk ? '' : ' '
  const result: string[] = []
  for (const word of cjk ? [...text] : text.trim().split(/\s+/)) {
    const index = result.length - 1
    if (index >= 0 && ctx.measureText(result[index] + gap + word).width <= width) result[index] += gap + word
    else result.push(word)
  }
  return result
}
// Largest size from `from` to `to` whose wrapped rows fit the box; otherwise the smallest size, cut short with an ellipsis.
function fit(ctx: Ctx, text: string, font: (px: number) => string, bw: number, bh: number, from: number, to: number, most: number) {
  for (let px = from; px >= to; px--) {
    ctx.font = font(px)
    const rows = lines(ctx, text, bw), lead = px * 1.18
    if (rows.length <= most && (rows.length - 1) * lead + px <= bh && rows.every(r => ctx.measureText(r).width <= bw)) return { rows, lead, fits: true }
  }
  ctx.font = font(to)
  const lead = to * 1.18, rows = lines(ctx, text, bw), keep = Math.max(1, Math.min(most, Math.floor((bh - to) / lead) + 1))
  if (rows.length > keep) { rows.length = keep; rows[keep - 1] += '…' }
  return { rows, lead, fits: false }
}
// Rows centred vertically on y; fillText's maxWidth squeezes any row that is still too wide rather than clipping it.
function set(ctx: Ctx, { rows, lead }: { rows: string[]; lead: number }, x: number, y: number, bw: number) {
  ctx.textBaseline = 'middle'
  rows.forEach((r, i) => ctx.fillText(r, x, y + (i - (rows.length - 1) / 2) * lead, bw))
}
// Spine title: horizontal in up to three lines from 34 to 18 px, else rotated −90° to read bottom to top.
// CJK spines are set as an upright column instead, as they are printed.
function spineTitle(ctx: Ctx, text: string, font: (px: number) => string, x: number, y: number, bw: number, bh: number) {
  ctx.textAlign = 'center'
  if (unspaced(text)) {
    const rows = [...text], px = Math.max(9, Math.min(34, bw, Math.floor(bh / rows.length / 1.08)))
    ctx.font = font(px); return set(ctx, { rows, lead: px * 1.08 }, x, y, bw)
  }
  const flat = fit(ctx, text, font, bw, bh, 34, 18, 3)
  if (flat.fits) return set(ctx, flat, x, y, bw)
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2)
  set(ctx, fit(ctx, text, font, bh, bw, 34, 11, 9), 0, 0, bh)
  ctx.restore()
}
function author(p: Paint, font: (px: number) => string, x: number, y: number, bw: number, bh: number, from: number) {
  if (!p.book.author.trim()) return
  p.ctx.textAlign = 'center'
  set(p.ctx, fit(p.ctx, p.book.author.toLocaleUpperCase(), font, bw, bh, from, 9, 2), x, y, bw)
}
// Stamped lettering: foil (or ink) with a slight relief shadow.
function stamp(ctx: Ctx, color: string) {
  const light = contrast(color, '#000000') > contrast(color, '#ffffff')
  ctx.fillStyle = ctx.strokeStyle = color
  ctx.shadowColor = light ? 'rgba(12,6,2,.5)' : 'rgba(255,240,214,.28)'; ctx.shadowOffsetY = 1.2; ctx.shadowBlur = 1.2
}
function shade(hex: string, t: number) {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('')
}
function cloth(ctx: Ctx, w: number, h: number, color: string, n: number) {
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(16,10,6,.06)'
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1)
  ctx.fillStyle = 'rgba(255,236,200,.05)'
  for (let x = 1; x < w; x += 3) ctx.fillRect(x, 0, 1, h)
  let rand = n
  for (let i = 0; i < w * h / 27; i++) {
    rand = (Math.imul(1664525, rand) + 1013904223) >>> 0
    ctx.fillStyle = i % 2 ? 'rgba(255,230,176,.11)' : 'rgba(16,10,6,.12)'
    ctx.fillRect(rand % w, (rand >>> 10) % h, i % 3 + 1, 1)
  }
}
// A foil-stamped sprig.
function sprig(ctx: Ctx, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size)
  ctx.lineWidth = 0.055; ctx.beginPath(); ctx.moveTo(0, 1); ctx.bezierCurveTo(-0.2, 0.2, 0.3, -0.4, 0.1, -1); ctx.stroke()
  for (let i = 0; i < 5; i++) {
    const yy = 0.65 - i * 0.33, s = i % 2 === 0 ? -1 : 1
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.quadraticCurveTo(s * 0.62, yy - 0.06, s * 0.68, yy - 0.48)
    ctx.quadraticCurveTo(s * 0.2, yy - 0.5, 0, yy); ctx.fill()
  }
  ctx.restore()
}
function leaf(ctx: Ctx, x: number, y: number, angle: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(size * 0.45, -size * 0.6, size, 0); ctx.quadraticCurveTo(size * 0.55, size * 0.6, 0, 0); ctx.fill()
  ctx.restore()
}
// A wavy stem from (x0,y0) to (x1,y1) with leaves alternating at each crest.
function vine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, amp: number, size: number) {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, waves = Math.max(1, Math.round(len / (size * 1.9)))
  const at = (t: number) => { const o = Math.sin(t * waves * Math.PI * 2) * amp; return [x0 + ux * len * t - uy * o, y0 + uy * len * t + ux * o] }
  ctx.lineWidth = Math.max(1.2, size / 9); ctx.beginPath()
  for (let t = 0; t <= 1.0001; t += 0.01) { const [x, y] = at(t); if (t) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
  ctx.stroke()
  for (let i = 0; i < waves * 2; i++) {
    const t = (i + 0.5) / (waves * 2), [x, y] = at(t), s = i % 2 ? 1 : -1
    leaf(ctx, x, y, Math.atan2(uy, ux) + Math.PI + s * 0.85, size)
  }
}
function fan(ctx: Ctx, x: number, y: number, r: number, rays: number) {
  for (let i = 0; i < rays; i++) {
    const a = Math.PI + (i + 0.5) * Math.PI / rays, da = Math.PI / rays * 0.28
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - da) * r, y + Math.sin(a - da) * r)
    ctx.lineTo(x + Math.cos(a + da) * r, y + Math.sin(a + da) * r); ctx.fill()
  }
  ctx.lineWidth = Math.max(1.2, r / 40)
  for (const k of [1.12, 1.22]) { ctx.beginPath(); ctx.arc(x, y, r * k, Math.PI, Math.PI * 2); ctx.stroke() }
  ctx.beginPath(); ctx.arc(x, y, r * 0.2, Math.PI, Math.PI * 2); ctx.fill()
}
// A rectangle whose corners step inward twice.
function stepped(ctx: Ctx, x: number, y: number, w: number, h: number, s: number) {
  const steps = [[0, 2], [1, 2], [1, 1], [2, 1], [2, 0]], corners = [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]]
  ctx.beginPath()
  corners.forEach(([cx, cy, sx, sy], i) => {
    for (const [a, b] of i % 2 ? [...steps].reverse() : steps) ctx.lineTo(cx + sx * a * s, cy + sy * b * s)
  })
  ctx.closePath(); ctx.stroke()
}
function paper(ctx: Ctx, x: number, y: number, w: number, h: number, accent?: string) {
  ctx.save()
  ctx.shadowColor = 'rgba(10,6,2,.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5
  ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h)
  ctx.restore()
  const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75)
  glow.addColorStop(0, 'rgba(255,250,235,0)'); glow.addColorStop(1, 'rgba(120,90,50,.22)')
  ctx.fillStyle = glow; ctx.fillRect(x, y, w, h)
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(x, y, w, Math.max(4, h * 0.035)) }
  ctx.strokeStyle = INK; ctx.lineWidth = 1
  const i = Math.min(6, w * 0.06)
  ctx.strokeRect(x + i, y + i + (accent ? h * 0.03 : 0), w - 2 * i, h - 2 * i - (accent ? h * 0.03 : 0))
}

const serif = (italic = '') => (px: number) => `${italic}${px}px ${SERIF}`
const caps = (face: string, weight = '') => (px: number) => `${weight} ${px}px ${face}`

const families: Record<Design['family'], (p: Paint) => void> = {
  gilt(p) {
    const { ctx, w, h, side, book, d } = p
    stamp(ctx, d.foil)
    if (side === 'spine') {
      for (const y of [86, 352, 448, 536]) {
        ctx.save(); ctx.shadowColor = 'transparent'
        const band = ctx.createLinearGradient(0, y, 0, y + 12)
        band.addColorStop(0, 'rgba(255,240,210,.22)'); band.addColorStop(0.5, 'rgba(0,0,0,0)'); band.addColorStop(1, 'rgba(10,5,2,.4)')
        ctx.fillStyle = band; ctx.fillRect(0, y, w, 12); ctx.restore()
        ctx.fillRect(0, y - 5, w, 1.5); ctx.fillRect(0, y + 16, w, 1.5)
      }
      for (const y of [22, 28, 566, 572]) ctx.fillRect(0, y, w, y % 2 ? 1.5 : 2.5)
      spineTitle(ctx, book.title, serif(), w / 2, 220, w * 0.82, 220)
      sprig(ctx, w / 2, 400, 26)
      author(p, serif(), w / 2, 492, w * 0.82, 70, 17)
      return
    }
    ctx.lineWidth = 1.7
    ctx.strokeRect(28, 26, w - 56, h - 52); ctx.strokeRect(36, 34, w - 72, h - 68)
    for (const [x, y] of [[36, 34], [w - 36, 34], [36, h - 34], [w - 36, h - 34]]) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    }
    if (side === 'back') return sprig(ctx, w / 2, h / 2, 50)
    ctx.textAlign = 'center'
    set(ctx, fit(ctx, book.title, serif('italic '), w - 130, 280, 64, 26, 5), w / 2, 270, w - 130)
    ctx.fillRect(w / 2 - 70, 440, 140, 1.5)
    sprig(ctx, w / 2, 530, 52)
    author(p, caps(SERIF), w / 2, 650, w - 140, 60, 21)
  },
  deco(p) {
    const { ctx, w, h, side, book, d } = p
    stamp(ctx, d.foil)
    const font = caps(DECO, '500')
    if (side === 'spine') {
      for (const [y, s] of [[26, 1], [h - 26, -1]]) {
        ctx.fillRect(0, y - 1.5, w, 3); ctx.fillRect(w * 0.15, y + s * 9 - 1, w * 0.7, 2); ctx.fillRect(w * 0.3, y + s * 17 - 1, w * 0.4, 2)
      }
      fan(ctx, w / 2, 128, Math.min(w * 0.34, 46), 9)
      ctx.letterSpacing = '1px'
      spineTitle(ctx, book.title.toLocaleUpperCase(), font, w / 2, 290, w * 0.8, 250)
      ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = d.accent; ctx.fillRect(0, 440, w, 22); ctx.restore()
      ctx.fillRect(0, 436, w, 2); ctx.fillRect(0, 464, w, 2)
      author(p, font, w / 2, 510, w * 0.8, 60, 15)
      ctx.letterSpacing = '0px'
      return
    }
    ctx.lineWidth = 2; stepped(ctx, 26, 26, w - 52, h - 52, 16)
    ctx.lineWidth = 1; stepped(ctx, 36, 36, w - 72, h - 72, 16)
    if (side === 'back') return fan(ctx, w / 2, h / 2 + 30, 70, 11)
    fan(ctx, w / 2, 250, 120, 13)
    ctx.letterSpacing = '3px'; ctx.textAlign = 'center'
    set(ctx, fit(ctx, book.title.toLocaleUpperCase(), font, w - 130, 200, 52, 22, 4), w / 2, 400, w - 130)
    ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = d.accent; ctx.fillRect(w / 2 - 90, 540, 180, 14); ctx.restore()
    author(p, font, w / 2, 610, w - 140, 60, 20)
    ctx.letterSpacing = '0px'
    for (let i = 0; i < 3; i++) ctx.fillRect(w / 2 - 60 + i * 20, 690 + i * 8, 120 - i * 40, 2)
  },
  modern(p) {
    const { ctx, w, h, side, book, d } = p
    const deep = shade(book.color, 0.35), font = caps(SANS, '700')
    ctx.fillStyle = deep
    if (side === 'spine') {
      ctx.fillRect(0, 0, w, 54)
      ctx.fillStyle = d.accent; ctx.fillRect(0, h * 0.74, w, h * 0.26)
      stamp(ctx, d.foil)
      spineTitle(ctx, book.title, font, w / 2, 250, w * 0.8, 330)
      author(p, caps(SANS, '600'), w / 2, 410, w * 0.8, 50, 14)
      return
    }
    if (side === 'back') { ctx.fillRect(0, h - 120, w, 120); ctx.fillStyle = d.accent; ctx.fillRect(0, h - 140, w * 0.4, 20); return }
    ctx.fillRect(w * 0.55, h * 0.5, w * 0.45, h * 0.24)
    ctx.fillStyle = d.accent; ctx.fillRect(0, h * 0.62, w, h * 0.24)
    stamp(ctx, d.foil); ctx.textAlign = 'left'
    const title = fit(ctx, book.title, font, w - 110, 250, 82, 26, 5)
    set(ctx, title, 56, 90 + ((title.rows.length - 1) * title.lead) / 2 + title.lead / 2, w - 110)
    if (book.author.trim()) {
      ctx.textAlign = 'left'
      set(ctx, fit(ctx, book.author, caps(SANS, '500'), w * 0.46, 60, 24, 12, 2), 56, h * 0.55, w * 0.46)
    }
    ctx.fillRect(56, h * 0.47, 60, 4)
  },
  botanical(p) {
    const { ctx, w, h, side, book, d } = p
    stamp(ctx, d.foil)
    if (side === 'spine') {
      ctx.fillRect(0, 18, w, 2); ctx.fillRect(0, h - 20, w, 2)
      vine(ctx, w / 2, 34, w / 2, 116, Math.min(4, w * 0.04), Math.min(22, w * 0.2))
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(w / 2, 268, w / 2 - 8, 138, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(w / 2, 268, w / 2 - 13, 132, 0, 0, Math.PI * 2); ctx.stroke()
      spineTitle(ctx, book.title, serif('italic '), w / 2, 268, w * 0.7, 170)
      vine(ctx, w / 2, 418, w / 2, 474, Math.min(4, w * 0.04), Math.min(20, w * 0.18))
      author(p, serif(), w / 2, 520, w * 0.82, 60, 16)
      return
    }
    const m = 34, leafSize = 20
    vine(ctx, m, m, w - m, m, 3, leafSize); vine(ctx, w - m, m, w - m, h - m, 3, leafSize)
    vine(ctx, w - m, h - m, m, h - m, 3, leafSize); vine(ctx, m, h - m, m, m, 3, leafSize)
    if (side === 'back') return sprig(ctx, w / 2, h / 2, 44)
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(w / 2, 330, 172, 220, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(w / 2, 330, 162, 210, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.textAlign = 'center'
    set(ctx, fit(ctx, book.title, serif('italic '), 250, 260, 56, 22, 6), w / 2, 330, 250)
    author(p, caps(SERIF), w / 2, 618, w - 150, 50, 20)
    for (const a of [-0.75, -1.57, -2.39]) leaf(ctx, w / 2, 708, a, a === -1.57 ? 38 : 30)
  },
  label(p) {
    const { ctx, w, h, side, book, d } = p
    stamp(ctx, d.foil)
    if (side === 'spine') {
      for (const y of [22, 28, h - 30, h - 24]) ctx.fillRect(0, y, w, 1.6)
      ctx.save(); ctx.shadowColor = 'transparent'
      const lx = Math.max(6, w * 0.08)
      paper(ctx, lx, 64, w - 2 * lx, 290, d.accent)
      ctx.fillStyle = INK
      spineTitle(ctx, book.title, serif(), w / 2, 215, w - 2 * lx - 16, 250)
      if (book.author.trim()) {
        paper(ctx, lx + 4, 410, w - 2 * lx - 8, 90)
        ctx.fillStyle = INK; author(p, caps(SERIF), w / 2, 455, w - 2 * lx - 22, 64, 15)
      }
      ctx.restore()
      return
    }
    ctx.save(); ctx.strokeStyle = 'rgba(10,5,2,.28)'; ctx.shadowColor = 'rgba(255,240,214,.16)'; ctx.lineWidth = 3
    ctx.strokeRect(30, 30, w - 60, h - 60); ctx.restore()
    if (side === 'back') return
    ctx.shadowColor = 'transparent'
    paper(ctx, 92, 150, w - 184, 340, d.accent)
    ctx.fillStyle = INK; ctx.textAlign = 'center'
    set(ctx, fit(ctx, book.title, serif(), w - 240, 200, 50, 20, 5), w / 2, 280, w - 240)
    ctx.fillRect(w / 2 - 40, 398, 80, 1.2)
    author(p, caps(SERIF), w / 2, 440, w - 250, 50, 17)
  },
}

export function binding(book: Book, side: Side, image?: HTMLImageElement) {
  const spine = side === 'spine', size = dimensions(book)
  const w = spine ? Math.round(600 * size.w / size.h) : 512, h = spine ? 600 : 800
  const ctx = canvas(w, h), d = design(book.title, book.color)
  cloth(ctx, w, h, book.color, seed(book.title))
  if (side === 'front' && image) ctx.drawImage(image, 6, 5, w - 12, h - 10)
  else { ctx.save(); families[d.family]({ ctx, w, h, side, book, d }); ctx.restore() }
  // Spines: rounded-back light. Covers: the hinge groove sits on the edge next to the spine (left of front, right of back).
  const light = ctx.createLinearGradient(0, 0, w, 0)
  if (spine) {
    light.addColorStop(0, 'rgba(15,9,5,.42)'); light.addColorStop(0.09, 'rgba(255,241,199,.14)')
    light.addColorStop(0.2, 'rgba(0,0,0,0)'); light.addColorStop(0.85, 'rgba(0,0,0,0)'); light.addColorStop(1, 'rgba(12,8,3,.36)')
  } else {
    const at = (x: number) => side === 'front' ? x : 1 - x
    for (const [x, c] of [[0, 'rgba(12,8,3,.35)'], [0.035, 'rgba(255,241,199,.10)'], [0.05, 'rgba(12,8,3,.22)'], [0.075, 'rgba(0,0,0,0)'],
      [0.93, 'rgba(0,0,0,0)'], [1, 'rgba(12,8,3,.25)']] as const) light.addColorStop(at(x), c)
  }
  ctx.fillStyle = light; ctx.fillRect(0, 0, w, h)
  return texture(ctx)
}
export function pageTexture() {
  const ctx = canvas(64, 256)
  ctx.fillStyle = '#e3d0a9'; ctx.fillRect(0, 0, 64, 256)
  for (let x = 0; x < 64; x += 2) {
    ctx.fillStyle = 'rgba(100,70,40,' + (0.06 + x % 7 / 48) + ')'; ctx.fillRect(x, 0, 1, 256)
  }
  return texture(ctx)
}
