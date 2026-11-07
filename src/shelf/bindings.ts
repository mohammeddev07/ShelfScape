import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from 'three'
import type { Book } from '../db'

function canvas(w: number, h: number) {
  const el = document.createElement('canvas')
  el.width = w; el.height = h
  return el.getContext('2d')!
}
function texture(ctx: CanvasRenderingContext2D) {
  const map = new CanvasTexture(ctx.canvas)
  map.colorSpace = SRGBColorSpace
  return map
}
export function seed(text: string) {
  let n = 2166136261
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
export function dimensions(book: Book) {
  const n = seed(book.title)
  return { w: 0.35 + (n % 43) / 115, h: 1.46 + ((n >>> 7) % 50) / 100,
    d: 0.93 + ((n >>> 13) % 22) / 100, tilt: ((n % 13) - 6) / 275 }
}
function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = []
  for (const word of text.split(/\s+/)) {
    const index = result.length - 1
    if (index >= 0 && ctx.measureText(result[index] + ' ' + word).width <= width) result[index] += ' ' + word
    else result.push(word)
  }
  return result
}
// A foil-stamped sprig, drawn in the same ink as the lettering.
function sprig(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size)
  ctx.lineWidth = 0.055; ctx.beginPath(); ctx.moveTo(0, 1); ctx.bezierCurveTo(-0.2, 0.2, 0.3, -0.4, 0.1, -1); ctx.stroke()
  for (let i = 0; i < 5; i++) {
    const yy = 0.65 - i * 0.33, s = i % 2 === 0 ? -1 : 1
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.quadraticCurveTo(s * 0.62, yy - 0.06, s * 0.68, yy - 0.48)
    ctx.quadraticCurveTo(s * 0.2, yy - 0.5, 0, yy); ctx.fill()
  }
  ctx.restore()
}
export function binding(book: Book, side: 'spine' | 'front' | 'back', image?: HTMLImageElement) {
  const spine = side === 'spine', w = spine ? Math.round(600 * dimensions(book).w / dimensions(book).h) : 384, h = 600
  const ctx = canvas(w, h)
  ctx.fillStyle = book.color; ctx.fillRect(0, 0, w, h)
  let rand = seed(book.title)
  for (let i = 0; i < 8500; i++) {
    rand = (Math.imul(1664525, rand) + 1013904223) >>> 0
    const x = rand % w, y = (rand >>> 10) % h
    ctx.fillStyle = i % 2 ? 'rgba(255,230,176,.12)' : 'rgba(16,10,6,.12)'
    ctx.fillRect(x, y, i % 3 + 1, 1)
  }
  if (side === 'front' && image) ctx.drawImage(image, 6, 5, w - 12, h - 10)
  else {
    ctx.strokeStyle = '#d4ac68'; ctx.fillStyle = '#e8c58a'; ctx.lineWidth = 1.7
    if (!spine) {
      ctx.strokeRect(16, 15, w - 32, h - 30); ctx.strokeRect(22, 21, w - 44, h - 42)
    }
    for (const y of [22, 28, 66, 538, 571, 578]) {
      ctx.fillRect(spine ? 0 : 31, y, spine ? w : w - 62, y % 2 ? 1.5 : 3)
    }
    ctx.textAlign = 'center'
    if (side !== 'back') {
      ctx.font = (spine ? '30px' : 'italic 44px') + ' Georgia,serif'
      const title = lines(ctx, book.title, w * 0.85)
      title.forEach((s, i) => ctx.fillText(s, w / 2, 237 + (i - title.length / 2) * (spine ? 34 : 48), w * 0.87))
      ctx.fillStyle = '#d5b473'; sprig(ctx, w / 2, 372, spine ? 26 : 51)
      ctx.font = (spine ? '17px' : '19px') + ' Georgia,serif'
      lines(ctx, book.author.toLocaleUpperCase(), w * 0.84).forEach((s,i) => ctx.fillText(s, w / 2, 468 + 22 * i, w * 0.9))
    } else sprig(ctx, w / 2, h / 2, 53)
  }
  const shade = ctx.createLinearGradient(0, 0, w, 0)
  shade.addColorStop(0, 'rgba(15,9,5,.42)'); shade.addColorStop(0.09, 'rgba(255,241,199,.14)')
  shade.addColorStop(0.2, 'rgba(0,0,0,0)'); shade.addColorStop(0.85, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(12,8,3,.36)')
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h)
  return texture(ctx)
}
export function woodTexture() {
  const ctx = canvas(1024, 160)
  ctx.fillStyle = '#9c6947'; ctx.fillRect(0, 0, 1024, 160)
  for (let i = 0; i < 480; i++) {
    const y = (i * 37) % 161
    ctx.strokeStyle = i % 3 ? 'rgba(70,36,17,.15)' : 'rgba(246,205,146,.18)'
    ctx.lineWidth = i % 7 === 0 ? 1.7 : 0.65
    ctx.beginPath()
    for (let x = 0; x <= 1024; x += 8) {
      const v = y + Math.sin(x * Math.PI * 2 / 1024 + i * 0.022) * (3 + i % 9) + Math.sin(x * Math.PI / 128 + i) * 0.7
      if (!x) ctx.moveTo(x, v); else ctx.lineTo(x, v)
    }
    ctx.stroke()
  }
  const map = texture(ctx); map.wrapS = RepeatWrapping; map.repeat.x = 4
  return map
}
export function pageTexture() {
  const ctx = canvas(64, 256)
  ctx.fillStyle = '#e3d0a9'; ctx.fillRect(0, 0, 64, 256)
  for (let x = 0; x < 64; x += 2) {
    ctx.fillStyle = 'rgba(100,70,40,' + (0.06 + x % 7 / 48) + ')'; ctx.fillRect(x, 0, 1, 256)
  }
  return texture(ctx)
}

export function shadowTexture() {
  const ctx = canvas(128,64)
  ctx.scale(1,.5)
  const shadow = ctx.createRadialGradient(64,64,1,64,64,62)
  shadow.addColorStop(0,'rgba(48,30,15,.65)'); shadow.addColorStop(.5,'rgba(48,30,15,.24)'); shadow.addColorStop(1,'rgba(48,30,15,0)')
  ctx.fillStyle = shadow; ctx.fillRect(0,0,128,128)
  return texture(ctx)
}
