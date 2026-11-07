import type { Book } from '../db'
import { dimensions } from './bindings'
import { Quaternion } from 'three'
// Auto-scroll in shelf units per second; swap waits this long for the previous book to head home.
export const AUTO_SPEED = 0.12, SWAP_DELAY_MS = 420
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
  span = 1
  pixels = 1
  paused = true
  dragging = false
  manualUntil = 0
  inspection = { rotation:new Quaternion(), zoom:1 }
  invalidate: () => void = () => {}

  configure(span:number, width:number, length:number, invalidate:() => void) {
    this.span = span
    this.pixels = width / span
    this.max = Math.max(0,length - span)
    this.offset = Math.min(this.max,this.offset)
    this.invalidate = invalidate
    invalidate()
  }
  pause(paused:boolean) { this.paused = paused; this.invalidate() }
  capture(active:boolean) { this.dragging = active; this.invalidate() }
  advance(dt:number) {
    if (this.paused || this.dragging || this.offset >= this.max) return
    if (performance.now() >= this.manualUntil) this.offset = Math.min(this.max,this.offset + Math.min(dt,.05) * AUTO_SPEED)
    this.invalidate()
  }
  move(delta:number) {
    this.manualUntil = performance.now() + 380
    this.offset = Math.max(0,Math.min(this.max,this.offset + delta))
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
