import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGLRenderer } from 'three'
import { Scene } from './shelf/Scene'
import { layout, Motion } from './shelf/layout'
import { rotateBy, rotateDrag, type PointerTrack } from './shelf/interaction'
import type { Book } from './db'
import styles from './App.module.css'

class GraphicsBoundary extends Component<{ children: ReactNode; fail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.fail() }
  render() { return this.state.failed ? null : this.props.children }
}
interface Props { paused: boolean; books: Book[]; reading: boolean; onOpen: (b: Book) => void; children?: ReactNode; label: string }
export function Shelf({ books, paused, reading, onOpen, children, label }: Props) {
  const shelf = useMemo(() => layout(books),[books])
  const [selected,setSelected] = useState<number>(), [committed,commit] = useState(false)
  const [reduced,setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [playing,setPlaying] = useState(!reduced), [hovered,setHover] = useState(false), [focused,setFocus] = useState(false)
  const [visible,setVisible] = useState(!document.hidden), [failed,setFailed] = useState(false)
  const [index,setIndex] = useState(0)
  const section = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null), browse = useRef<HTMLButtonElement>(null)
  const openButton = useRef<HTMLButtonElement>(null), skipFocus = useRef(false)
  const tracks = useRef(new Map<number,PointerTrack>()), pinch = useRef(0)
  const [motion] = useState(() => new Motion())
  const hoverTimer = useRef(0)
  const previous = useRef(books)
  useEffect(() => {
    if (previous.current !== books) {
      motion.move(-motion.offset)
      previous.current = books
    }
    return () => clearTimeout(hoverTimer.current)
  },[books,motion])
  const current = books.find(b => b.id === selected)
  const activeIndex = Math.max(0,Math.min(index,books.length - 1))
  const fail = useCallback(() => setFailed(true),[])
  useEffect(() => {
    const pref = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { setReduced(pref.matches); if (pref.matches) setPlaying(false) }
    const visibility = () => setVisible(!document.hidden)
    pref.addEventListener('change',change); document.addEventListener('visibilitychange',visibility)
    return () => { pref.removeEventListener('change',change); document.removeEventListener('visibilitychange',visibility) }
  },[])
  // Removing a focused element fires no blur, so re-derive focus after each render.
  useEffect(() => { setFocus(!!section.current?.contains(document.activeElement)) },[books,current,reading])
  useEffect(() => {
    motion.pause(paused || !playing || !visible || reading || hovered || focused || !!current)
  },[paused,playing,visible,reading,hovered,focused,current,motion])
  const reset = () => motion.reset()
  const dismiss = (restore = true) => {
    clearTimeout(hoverTimer.current)
    setSelected(undefined); commit(false)
    if (restore) {
      skipFocus.current = true
      browse.current?.focus({ preventScroll: true })
      queueMicrotask(() => { skipFocus.current = false })
    }
  }
  const wasReading = useRef(reading)
  useEffect(() => {
    if (wasReading.current && !reading) {
      setSelected(undefined); commit(false)
      skipFocus.current = true; browse.current?.focus({ preventScroll: true }); skipFocus.current = false
    }
    wasReading.current = reading
  },[reading])
  const pick = (id: number, pin: boolean) => {
    if (selected !== id) reset()
    setSelected(id); commit(pin); setIndex(books.findIndex(b => b.id === id))
  }
  const browseTo = (i: number) => {
    const next = Math.max(0,Math.min(books.length - 1,i)), slot = shelf.slots[next]
    if (!slot) return
    const pos = slot.x - motion.offset
    if (pos < .5 || pos > motion.span - 1) motion.move(slot.x - motion.span / 2 - motion.offset)
    pick(slot.book.id,false)
  }
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const wheel = (e: WheelEvent) => {
      if (!books.length || (e.target as HTMLElement).closest('button')) return
      if (current && (e.ctrlKey || committed)) { e.preventDefault(); motion.zoomBy(-e.deltaY * .002); return }
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) && !e.shiftKey && motion.max === 0) return
      e.preventDefault()
      if (current) { setSelected(undefined); commit(false) }
      motion.move((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / motion.pixels)
    }
    node.addEventListener('wheel',wheel,{ passive:false })
    return () => node.removeEventListener('wheel',wheel)
  },[current,committed,books.length,motion])
  const begin = (e: PointerEvent,id?: number,cover = false, inspect = false) => {
    clearTimeout(hoverTimer.current)
    if (tracks.current.has(e.pointerId) || e.button !== 0) return
    motion.capture(true); stage.current?.setPointerCapture(e.pointerId)
    tracks.current.set(e.pointerId,{ x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,id,cover,inspect,moved:false })
    if (tracks.current.size > 1) {
      const [a,b] = [...tracks.current.values()]; pinch.current = Math.hypot(a.x-b.x,a.y-b.y)
      for (const p of tracks.current.values()) p.moved = true
    }
  }
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = tracks.current.get(e.pointerId)
    if (!p) return
    if (Math.hypot(e.clientX-p.startX,e.clientY-p.startY) > 6) p.moved = true
    if (!p.moved) return
    if (tracks.current.size > 1 && current) {
      const other = [...tracks.current.values()].find(t => t !== p)!
      const dist = Math.hypot(e.clientX-other.x,e.clientY-other.y)
      motion.zoomBy((dist - pinch.current) / 240); pinch.current = dist; commit(true)
    } else if (p.inspect && current) {
      rotateDrag(motion.inspection,p,e.clientX,e.clientY,e.currentTarget.getBoundingClientRect()); commit(true); motion.invalidate()
    } else {
      if (current) dismiss(false)
      motion.move((p.x - e.clientX) / motion.pixels)
    }
    p.x = e.clientX; p.y = e.clientY
  }
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = tracks.current.get(e.pointerId)
    tracks.current.delete(e.pointerId); motion.capture(tracks.current.size > 0); motion.invalidate()
    if (!p || p.moved || e.type !== 'pointerup' || Math.hypot(e.clientX-p.startX,e.clientY-p.startY) > 6) return
    if (p.id === undefined) { if (committed) dismiss(false); return }
    if (p.inspect && p.cover && current) onOpen(current)
    else pick(p.id,true)
  }
  const key = (e: React.KeyboardEvent) => {
    const axes = { ArrowLeft: ['y',-1],ArrowRight: ['y',1],ArrowUp: ['x',-1],ArrowDown: ['x',1],q: ['z',-1],e: ['z',1] } as const
    if (e.key === 'Escape' && current) { dismiss(); e.preventDefault() }
    else if (committed && e.key in axes) {
      const [axis,sign] = axes[e.key as keyof typeof axes]
      rotateBy(motion.inspection,axis,sign * Math.PI / 12); motion.invalidate(); e.preventDefault()
    } else if (!committed && ['ArrowLeft','ArrowRight'].includes(e.key)) {
      browseTo(index + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault()
    }
  }
  return <section ref={section} className={styles.shelfSection} aria-label={label} hidden={reading} onKeyDown={key}
    onFocusCapture={() => setFocus(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false) }}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); if (!committed && !focused && !tracks.current.size) dismiss(false) }}>
    <div className={styles.stage} ref={stage} onPointerDown={e => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') begin(e.nativeEvent)
    }} onPointerMove={drag} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={e => { tracks.current.delete(e.pointerId); motion.capture(tracks.current.size > 0) }}>
      <div className={styles.shelfShadow}/>
      {!failed && !reading && visible && <GraphicsBoundary fail={fail}><Canvas frameloop="demand" dpr={[1,1.5]}
        gl={props => {
          try { return new WebGLRenderer({ ...props, canvas:props.canvas as HTMLCanvasElement,alpha:true,antialias:true,powerPreference:'low-power' }) }
          catch (error) { fail(); throw error }
        }}>
        <Scene shelf={shelf} selected={current?.id} motion={motion} reduced={reduced} hits={{ down:begin,leave:() => clearTimeout(hoverTimer.current),hover: id => {
          clearTimeout(hoverTimer.current)
          if (committed || current?.id === id || tracks.current.size || performance.now() < motion.manualUntil) return
          if (current) hoverTimer.current = window.setTimeout(() => pick(id,false),280)
          else pick(id,false)
        } }} onLose={fail}/>
      </Canvas></GraphicsBoundary>}
      {failed && <div className={styles.fallback}>
        {books.length > 0 && <><p>Book list</p><ul>{books.map(book => <li key={book.id}><button onClick={() => onOpen(book)}>{book.title} <small>{book.author}</small></button></li>)}</ul></>}
      </div>}
      {children}
    </div>
    <div className={styles.rail}>
      <span>{books.length} {books.length === 1 ? 'volume' : 'volumes'}</span>
      {books.length > 0 && !failed && <div className={styles.railButtons}>
        <button ref={browse} onFocus={() => { if (!skipFocus.current && !committed && !current) browseTo(index) }}
          onClick={() => { const book = books[activeIndex]; if (book) { pick(book.id,true); openButton.current?.focus({preventScroll:true}) } }}
          aria-label={'Inspect ' + (books[activeIndex]?.title ?? 'book')}>{books[activeIndex]?.title}</button>
        <button aria-label="Previous spine" onClick={() => browseTo(index-1)}>←</button>
        <button aria-label="Next spine" onClick={() => browseTo(index+1)}>→</button>
        <button aria-label={playing ? 'Pause shelf motion' : 'Play shelf motion'} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ Pause' : '▷ Play'}</button>
      </div>}
    </div>
    {current && !failed && <div className={styles.preview} aria-label={'Inspect ' + current.title}>
      <div><h2>{current.title}</h2><p>{current.author || 'Author unknown'}</p></div>
      <div className={styles.actions}>
        <button className={styles.primary} ref={openButton} onClick={() => onOpen(current)}>{current.format ? 'Open book' : 'Attach file'}</button>
        <button aria-label="Zoom out" onClick={() => motion.zoomBy(-.12)}>−</button><button aria-label="Zoom in" onClick={() => motion.zoomBy(.12)}>+</button>
        <button onClick={reset}>Reset view</button><button onClick={() => dismiss()}>Back to shelf</button>
      </div>
      <small>Drag to rotate · Arrow keys to turn · Q / E to roll</small>
    </div>}
  </section>
}
