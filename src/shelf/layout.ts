import type { Book } from '../db'
import { dimensions } from './bindings'
import { Quaternion } from 'three'
// Auto-scroll in shelf units per second; swap waits this long for the previous book to head home.
export const AUTO_SPEED = 0.3, SWAP_DELAY_MS = 420
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
// Continuous scene values are owned here, outside React's render cycle.
export class Motion {
  offset = 0
  max = 0
  /** Shelf length when it loops (last book sits beside the first), else 0. */
  period = 0
  span = 1
  pixels = 1
  paused = true
  dragging = false
  running = false
  manualUntil = 0
  inspection = { rotation:new Quaternion(), zoom:1 }
  invalidate: () => void = () => {}

  configure(span:number, width:number, length:number, margin:number, invalidate:() => void) {
    this.span = span
    this.pixels = width / span
    // Loop whenever the shelf is wider than the view; a shelf that fits stays still.
    this.period = length + margin * 2 > span ? length : 0
    this.max = this.period ? Infinity : Math.max(0,length + margin * 2 - span)
    this.offset = this.clamp(this.offset)
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
  pause(paused:boolean) { this.paused = paused; this.invalidate() }
  capture(active:boolean) { this.dragging = active; this.invalidate() }
  advance(dt:number) {
    if (this.paused || this.dragging || this.offset >= this.max) { this.running = false; return }
    // The demand frameloop sleeps while paused, so the first frame back carries the whole gap: skip it.
    if (this.running && performance.now() >= this.manualUntil) this.offset = this.clamp(this.offset + Math.min(dt,.5) * AUTO_SPEED)
    this.running = true
    this.invalidate()
  }
  move(delta:number) {
    this.manualUntil = performance.now() + 380
    this.offset = this.clamp(this.offset + delta)
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
