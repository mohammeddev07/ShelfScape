import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGLRenderer } from 'three'
import { Scene } from './shelf/Scene'
import { layout, Motion, SWAP_DELAY_MS } from './shelf/layout'
import { rotateBy, rotateDrag, type PointerTrack } from './shelf/interaction'
import { liveQuery } from 'dexie'
import { db, type Book } from './db'
import { formatDuration } from './stats/core'
import { ArrowCounterClockwiseIcon, CaretLeftIcon, CaretRightIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, PauseIcon, PlayIcon, XIcon } from '@phosphor-icons/react'
import styles from './App.module.css'

class GraphicsBoundary extends Component<{ children: ReactNode; fail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.fail() }
  render() { return this.state.failed ? null : this.props.children }
}
interface Reading { id: number; fraction: number; finished: boolean; ms: number }
/** Progress and time for one book; undefined until it has been opened. Re-queried only when that book's rows change. */
function useReading(id?: number) {
  const [reading,setReading] = useState<Reading>()
  useEffect(() => {
    if (id === undefined) return
    const sub = liveQuery(async () => {
      const [p,list] = await Promise.all([db.progress.get(id),db.sessions.where('book').equals(id).toArray()])
      return p || list.length ? { id, fraction:p?.fraction ?? 0, finished:!!p?.finished, ms:list.reduce((a,s) => a + s.active,0) } : undefined
    }).subscribe({ next:setReading,error:() => setReading(undefined) })
    return () => sub.unsubscribe()
  },[id])
  return reading?.id === id ? reading : undefined
}
interface Props { paused: boolean; books: Book[]; reading: boolean; onOpen: (b: Book) => void; children?: ReactNode; label: string }
export function Shelf({ books, paused, reading, onOpen, children, label }: Props) {
  const shelf = useMemo(() => layout(books),[books])
  const [selected,setSelected] = useState<number>(), [labelled,setLabel] = useState<number>()
  const [reduced,setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [playing,setPlaying] = useState(!reduced), [hovered,setHover] = useState(false), [focused,setFocus] = useState(false)
  const [visible,setVisible] = useState(!document.hidden), [failed,setFailed] = useState(false)
  const [index,setIndex] = useState(0)
  const section = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null), browse = useRef<HTMLButtonElement>(null)
  const openButton = useRef<HTMLButtonElement>(null), skipFocus = useRef(false), labelEl = useRef<HTMLDivElement>(null)
  const tracks = useRef(new Map<number,PointerTrack>()), pinch = useRef(0)
  const [motion] = useState(() => new Motion())
  const swap = useRef(0), focusNext = useRef(false)
  const previous = useRef(books)
  useEffect(() => {
    if (previous.current !== books) {
      motion.move(-motion.offset)
      previous.current = books
    }
    return () => { clearTimeout(swap.current); swap.current = 0 }
  },[books,motion])
  const current = books.find(b => b.id === selected), labelBook = books.find(b => b.id === labelled)
  const labelRead = useReading(labelBook?.id), currentRead = useReading(current?.id)
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
  const currentId = current?.id
  // Only a pick moves focus; a book reappearing (e.g. a search filter undone) must not steal it.
  useEffect(() => { if (currentId !== undefined && focusNext.current) { focusNext.current = false; openButton.current?.focus({ preventScroll: true }) } },[currentId])
  const dismiss = (restore = true) => {
    clearTimeout(swap.current); swap.current = 0
    setSelected(undefined)
    if (restore) {
      skipFocus.current = true
      browse.current?.focus({ preventScroll: true })
      queueMicrotask(() => { skipFocus.current = false })
    }
  }
  const wasReading = useRef(reading)
  useEffect(() => {
    if (wasReading.current && !reading) {
      setSelected(undefined)
      skipFocus.current = true; browse.current?.focus({ preventScroll: true }); skipFocus.current = false
    }
    wasReading.current = reading
  },[reading])
  // A book already out (or still heading home) goes back first; the newest click wins.
  const pick = (id: number) => {
    const busy = swap.current || (selected !== undefined && selected !== id)
    clearTimeout(swap.current); swap.current = 0
    setIndex(books.findIndex(b => b.id === id)); setLabel(undefined)
    const select = () => { swap.current = 0; if (selected !== id) { reset(); focusNext.current = true } setSelected(id) }
    if (!busy) return select()
    setSelected(undefined)
    swap.current = window.setTimeout(select,reduced ? 0 : SWAP_DELAY_MS)
  }
  const browseTo = (i: number) => {
    const next = Math.max(0,Math.min(books.length - 1,i)), slot = shelf.slots[next]
    if (!slot) return
    const pos = motion.place(slot.x)
    if (pos < .5 || pos > motion.span - 1) motion.move(pos - motion.span / 2)
    setIndex(next); setLabel(slot.book.id)
  }
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const wheel = (e: WheelEvent) => {
      if (!books.length || (e.target as HTMLElement).closest('button')) return
      if (current) { e.preventDefault(); motion.zoomBy(-e.deltaY * .002); return }
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) && !e.shiftKey && motion.max === 0) return
      e.preventDefault()
      motion.move((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / motion.pixels)
    }
    node.addEventListener('wheel',wheel,{ passive:false })
    return () => node.removeEventListener('wheel',wheel)
  },[current,books.length,motion])
  const begin = (e: PointerEvent,id?: number,cover = false, inspect = false) => {
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
      motion.zoomBy((dist - pinch.current) / 240); pinch.current = dist
    } else if (p.inspect && current) {
      rotateDrag(motion.inspection,p,e.clientX,e.clientY,e.currentTarget.getBoundingClientRect()); motion.invalidate()
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
    if (p.id === undefined) { if (current) dismiss(false); return }
    if (p.inspect && p.cover && current) onOpen(current)
    else pick(p.id)
  }
  const key = (e: React.KeyboardEvent) => {
    const axes = { ArrowLeft: ['y',-1],ArrowRight: ['y',1],ArrowUp: ['x',-1],ArrowDown: ['x',1],q: ['z',-1],e: ['z',1] } as const
    if (e.key === 'Escape' && (current || swap.current)) { dismiss(); e.preventDefault() }
    else if (current && e.key in axes) {
      const [axis,sign] = axes[e.key as keyof typeof axes]
      rotateBy(motion.inspection,axis,sign * Math.PI / 12); motion.invalidate(); e.preventDefault()
    } else if (!current && ['ArrowLeft','ArrowRight'].includes(e.key)) {
      browseTo(index + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault()
    }
  }
  return <section ref={section} className={styles.shelfSection} aria-label={label} hidden={reading} onKeyDown={key}
    onFocusCapture={() => setFocus(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false) }}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    <div className={styles.stage} ref={stage} onPointerDown={e => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') begin(e.nativeEvent)
    }} onPointerMove={drag} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={e => { tracks.current.delete(e.pointerId); motion.capture(tracks.current.size > 0) }}>
      <div className={styles.shelfShadow}/>
      {!failed && !reading && visible && <GraphicsBoundary fail={fail}><Canvas frameloop="demand" dpr={[1,1.5]}
        gl={props => {
          try { return new WebGLRenderer({ ...props, canvas:props.canvas as HTMLCanvasElement,alpha:true,antialias:true,powerPreference:'low-power' }) }
          catch (error) { fail(); throw error }
        }}>
        <Scene shelf={shelf} selected={current?.id} motion={motion} reduced={reduced} label={{ id:labelled,el:labelEl }} hits={{ down:begin,hover: id => {
          if (stage.current) stage.current.style.cursor = id === undefined ? '' : 'pointer'
          setLabel(id)
        } }} onLose={fail}/>
      </Canvas></GraphicsBoundary>}
      {labelBook && !failed && <div ref={labelEl} role="tooltip" className={styles.label}>{labelBook.title}{labelBook.author && <small>{labelBook.author}</small>}{labelRead && <small>{Math.round(labelRead.fraction * 100)}% read</small>}</div>}
      {failed && <div className={styles.fallback}>
        {books.length > 0 && <><p>Book list</p><ul>{books.map(book => <li key={book.id}><button onClick={() => onOpen(book)}>{book.title} <small>{book.author}</small></button></li>)}</ul></>}
      </div>}
      {children}
    </div>
    <div className={styles.dock}>
    {current && !failed && <div className={styles.preview} role="group" aria-label={'Inspect ' + current.title}>
      <div><h2>{current.title}</h2>{current.author && <p>{current.author}</p>}
        {currentRead && <p className={styles.meta}>{currentRead.finished ? 'Finished' : Math.round(currentRead.fraction * 100) + '% read'} · {formatDuration(currentRead.ms)}</p>}</div>
      <div className={styles.actions}>
        <button className={styles.primary} ref={openButton} onClick={() => onOpen(current)}>{current.format ? 'Open book' : 'Attach file'}</button>
        <div className={styles.group}>
          <button className={styles.icon} aria-label="Zoom out" onClick={() => motion.zoomBy(-.12)}><MagnifyingGlassMinusIcon size={18} aria-hidden="true"/></button>
          <button className={styles.icon} aria-label="Zoom in" onClick={() => motion.zoomBy(.12)}><MagnifyingGlassPlusIcon size={18} aria-hidden="true"/></button>
          <button className={styles.icon} aria-label="Reset view" onClick={reset}><ArrowCounterClockwiseIcon size={18} aria-hidden="true"/></button>
        </div>
        <button className={styles.ghost} onClick={() => dismiss()}><XIcon size={18} aria-hidden="true"/><span>Back to shelf</span></button>
      </div>
      <small>Drag to rotate, arrow keys to turn, Q and E to roll</small>
    </div>}
    <div className={styles.rail}>
      <span>{books.length} {books.length === 1 ? 'volume' : 'volumes'}</span>
      {books.length > 0 && !failed && <div className={styles.group}>
        <button ref={browse} className={`${styles.ghost} ${styles.railTitle}`} onFocus={() => { if (!skipFocus.current && !current) browseTo(index) }}
          onClick={() => { const book = books[activeIndex]; if (book) pick(book.id) }}
          aria-label={'Inspect ' + (books[activeIndex]?.title ?? 'book')}>{books[activeIndex]?.title}</button>
        <button className={styles.icon} aria-label="Previous spine" onClick={() => browseTo(index-1)}><CaretLeftIcon size={18} aria-hidden="true"/></button>
        <button className={styles.icon} aria-label="Next spine" onClick={() => browseTo(index+1)}><CaretRightIcon size={18} aria-hidden="true"/></button>
        <button className={styles.icon} aria-label={playing ? 'Pause shelf motion' : 'Play shelf motion'} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? <PauseIcon size={18} aria-hidden="true"/> : <PlayIcon size={18} aria-hidden="true"/>}</button>
      </div>}
    </div>
    </div>
  </section>
}
