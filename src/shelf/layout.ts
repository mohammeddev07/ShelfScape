import type { Book } from '../db'
import { dimensions } from './bindings'
import { Quaternion } from 'three'
// Auto-spin in shelf units per second; swap waits this long for the previous book to head home.
export const AUTO_SPEED = 0.3, SWAP_DELAY_MS = 420
// Orthographic camera: VIEW world units fill the stage height; it sits at (0, y, z) pitched down by `pitch` radians.
export const VIEW = 2.72, CAMERA = { y: 1.05, z: 8, pitch: .13 }
// Books stand at FLOOR; the row bows back by BOW at the view's edges. EDGE is the faded share of the view on each side.
export const FLOOR = -0.94, BOW = 0.6, EDGE = 0.09
export interface Slot { book: Book; x: number; w: number; h: number; d: number; tilt: number }
export function layout(books: Book[]) {
  let length = 0
  const slots = books.map(book => {
    const size = dimensions(book)
    const x = length + size.w / 2
    length += size.w + Math.abs(size.tilt) * size.h + 0.012
    return { book, x, ...size }
  })
  return { slots, length }
}
/** Depth offset and yaw for a book at x (0 = centre) on a view `half` wide each side: a gentle parabola, spines turned toward the middle. */
export function arc(x: number, half: number) {
  const k = BOW / (half * half)
  return { z: -k * x * x, yaw: Math.atan(2 * k * x) }
}
/** Stage pixel position of a world point, for a w × h stage; matches the scene camera. */
export function project(x: number, y: number, z: number, w: number, h: number) {
  const k = h / VIEW, yv = (y - CAMERA.y) * Math.cos(CAMERA.pitch) - (z - CAMERA.z) * Math.sin(CAMERA.pitch)
  return [w / 2 + x * k, h / 2 - yv * k]
}
// Continuous scene values are owned here, outside React's render cycle.
export class Motion {
  offset = 0
  max = 0
  /** Shelf length when it loops (last book sits beside the first), else 0. */
  period = 0
  span = 1
  pixels = 1
  /** World x of the shelf's left edge (0 is the view's centre). */
  left = 0
  dragging = false
  /** Auto-spin is held (hover, keyboard browsing, a book out, reduced motion...). */
  paused = true
  running = false
  manualUntil = 0
  /** Offset being eased toward (keyboard browsing), if any. */
  target: number | undefined
  inspection = { rotation:new Quaternion(), zoom:1 }
  invalidate: () => void = () => {}

  configure(span:number, width:number, length:number, margin:number, invalidate:() => void) {
    this.span = span
    this.pixels = width / span
    // Loop whenever the shelf is wider than the view; a shelf that fits stays still and centred.
    this.period = length + margin * 2 > span ? length : 0
    this.max = this.period ? Infinity : 0
    this.left = this.period ? -span / 2 + margin : -length / 2
    this.offset = this.clamp(this.offset)
    if (this.target !== undefined) this.target = this.clamp(this.target)
    this.invalidate = invalidate
    invalidate()
  }
  clamp(offset:number) {
    return this.period ? ((offset % this.period) + this.period) % this.period : Math.max(0,Math.min(this.max,offset))
  }
  /** Where a book at layout x sits from the shelf's left edge right now. */
  place(x:number) {
    return this.period ? this.clamp(x - this.offset + 1) - 1 : x - this.offset
  }
  /** World x of a book at layout x right now. */
  at(x:number) { return this.left + this.place(x) }
  capture(active:boolean) { this.dragging = active; if (active) this.target = undefined; this.invalidate() }
  pause(paused:boolean) { this.paused = paused; this.invalidate() }
  /** No auto-spin until `until` (performance.now() ms). */
  hold(until:number) { this.manualUntil = Math.max(this.manualUntil,until) }
  advance(dt:number) {
    if (this.target === undefined) return this.spin(dt)
    let gap = this.target - this.offset
    if (this.period) gap -= Math.round(gap / this.period) * this.period   // the short way round a loop
    if (Math.abs(gap) < 1e-3) { this.offset = this.target; this.target = undefined }
    else this.offset = this.clamp(this.offset + gap * (1 - .0001 ** Math.min(dt,.05)))
    this.invalidate()
  }
  /** Only a looping shelf spins; one that fits stays still. */
  private spin(dt:number) {
    if (this.paused || this.dragging || !this.period) { this.running = false; return }
    // The demand frameloop sleeps while paused, so the first frame back carries the whole gap: skip it. A drag or wheel holds it briefly.
    if (this.running && performance.now() >= this.manualUntil) this.offset = this.clamp(this.offset + Math.min(dt,.5) * AUTO_SPEED)
    this.running = true
    this.invalidate()
  }
  move(delta:number) {
    this.manualUntil = performance.now() + 380
    this.target = undefined
    this.offset = this.clamp(this.offset + delta)
    this.invalidate()
  }
  /** Ease to an offset, or jump there when `instant` (reduced motion, restoring a shelf). */
  glide(to:number, instant = false) {
    this.target = instant ? undefined : this.clamp(to)
    // Unclamped: a restored shelf's offset must outlive the previous shelf's limits; configure() clamps it to the new one.
    if (instant) this.offset = to
    this.invalidate()
  }
  zoomBy(amount:number) {
    this.inspection.zoom = Math.max(.65,Math.min(1.6,this.inspection.zoom + amount))
    this.invalidate()
  }
  reset() {
    this.inspection.rotation.identity()
    this.inspection.zoom = 1
    this.invalidate()
  }
}
export interface Hits {
  down: (event: PointerEvent, id?: number, cover?: boolean, inspect?: boolean) => void
  hover: (id: number | undefined) => void
}
/** A shelf switch: where each book on screen stood (world x) and which ones are leaving. Books that stay slide over, new ones drop in. */
export interface Transition { since: number; from: Map<number,number>; leaving: { slot: Slot; x: number }[] }
export { SETTLED } from './tween'
