import { Component, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGLRenderer } from 'three'
import { Scene } from './shelf/Scene'
import { CAMERA, EDGE, FLOOR, layout, Motion, project, SETTLED, SWAP_DELAY_MS, VIEW, type Transition } from './shelf/layout'
import { rotateBy, rotateDrag, type PointerTrack } from './shelf/interaction'
import { liveQuery } from 'dexie'
import { db, errorMessage, type Book } from './db'
import { cleanTitle } from './library/title'
import { formatDuration } from './stats/core'
import { PencilSimpleIcon } from '@phosphor-icons/react'
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
const TAPER = .07   // share of the shelf's width, at each end, over which its lip thins and fades
/** The walnut oval in stage pixels, placed with the scene camera so the books' bases sit on it. Its lip is 2 px, thinning to 0.5 px and fading out over the outer 7%. */
function ShelfArt({ w, h }: { w: number; h: number }) {
  const k = h / VIEW, [cx,rowY] = project(0,FLOOR,0,w,h)
  // Deeper than the camera's true foreshortening so the walnut reads; the lip stays in front of the row's arc all the way out.
  const rx = w / 2 * .985, ry = Math.max(14,h * .075), cy = rowY - ry * .15, band = .075 * Math.cos(CAMERA.pitch) * k
  const lip = useMemo(() => {
    const top: string[] = [], under: string[] = []
    for (let i = 0; i <= 160; i++) {
      const t = Math.PI * (1 - i / 160), f = (1 - Math.cos(t)) / 2, e = Math.min(f,1 - f)
      const x = (cx + rx * Math.cos(t)).toFixed(2), y = cy + ry * Math.sin(t)
      top.push(x + ',' + y.toFixed(2)); under.unshift(x + ',' + (y + (e >= TAPER ? 2 : .5 + 1.5 * e / TAPER)).toFixed(2))
    }
    return 'M' + top.join('L') + 'L' + under.join('L') + 'Z'
  },[cx,cy,rx,ry])
  const edge = `M${cx - rx},${cy}A${rx},${ry} 0 0 0 ${cx + rx},${cy}L${cx + rx},${cy + band}A${rx},${ry} 0 0 1 ${cx - rx},${cy + band}Z`
  const fade = (id: string, color: string, peak: number) => <linearGradient id={id}>
    <stop offset="0" stopColor={color} stopOpacity="0"/><stop offset={TAPER} stopColor={color} stopOpacity={peak}/>
    <stop offset={1 - TAPER} stopColor={color} stopOpacity={peak}/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient>
  return <svg className={styles.shelfArt} width={w} height={h} aria-hidden="true">
    <defs>
      {fade('shelf-fade','#fff',1)}{fade('shelf-lip','#e9b56a',.95)}
      <mask id="shelf-mask" maskUnits="userSpaceOnUse"><rect x={cx - rx} y="0" width={rx * 2} height={h} fill="url(#shelf-fade)"/></mask>
      <radialGradient id="shelf-top" cx=".5" cy=".9" r=".75"><stop offset="0" stopColor="#8a5534"/><stop offset=".55" stopColor="#5b3520"/><stop offset="1" stopColor="#2f1b10"/></radialGradient>
      <linearGradient id="shelf-band" x2="0" y2="1"><stop offset="0" stopColor="#4a2a17"/><stop offset="1" stopColor="#1c100a"/></linearGradient>
      <radialGradient id="shelf-shade"><stop offset="0" stopColor="#000" className={styles.shade}/><stop offset="1" stopColor="#000" stopOpacity="0"/></radialGradient>
      <filter id="shelf-grain" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency=".0025 .2" numOctaves="2" seed="7"/>
        <feColorMatrix values="0 0 0 0 .09  0 0 0 0 .05  0 0 0 0 .02  1.5 0 0 0 -.62"/>
        <feComposite in2="SourceGraphic" operator="in" result="grain"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grain"/></feMerge>
      </filter>
    </defs>
    <ellipse cx={cx} cy={cy + band + ry * .5} rx={rx * .94} ry={ry * 1.6 + band} fill="url(#shelf-shade)" mask="url(#shelf-mask)"/>
    <g mask="url(#shelf-mask)" filter="url(#shelf-grain)">
      <path d={edge} fill="url(#shelf-band)"/>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#shelf-top)"/>
    </g>
    <ellipse cx={cx} cy={rowY} rx={rx * .86} ry={ry * .62} fill="url(#shelf-shade)" mask="url(#shelf-mask)"/>
    <path d={lip} fill="url(#shelf-lip)"/>
  </svg>
}
interface Props { books: Book[]; view: string; filter: string; reading: boolean; paused: boolean; onOpen: (b: Book) => void; children?: ReactNode; label: string }
export function Shelf({ books, view, filter, reading, paused, onOpen, children, label }: Props) {
  const shelf = useMemo(() => layout(books),[books])
  const [selected,setSelected] = useState<number>(), [lit,setLit] = useState<number>()
  const [reduced,setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [visible,setVisible] = useState(!document.hidden), [failed,setFailed] = useState(false)
  const [index,setIndex] = useState(0), [size,setSize] = useState({ w:0,h:0 })
  const [hovered,setHovered] = useState(false), [keyboard,setKeyboard] = useState(false)
  const [editing,setEditing] = useState<number>(), [draft,setDraft] = useState(''), [renameError,setRenameError] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const editor = useRef<HTMLFormElement>(null), openButton = useRef<HTMLButtonElement>(null), pencil = useRef<HTMLButtonElement>(null), refocus = useRef(false)
  const tracks = useRef(new Map<number,PointerTrack>()), pinch = useRef(0)
  const [motion] = useState(() => new Motion())
  const swap = useRef(0), focusNext = useRef(false)
  const positions = useRef(new Map<string,number>()), seen = useRef({ view,filter }), outgoing = useRef(shelf), settle = useRef(0)
  const [transition,setTransition] = useState<Transition>()
  const hint = useId()
  useEffect(() => () => { clearTimeout(swap.current); swap.current = 0; clearTimeout(settle.current) },[])
  useEffect(() => { outgoing.current = shelf })   // after the switch below has read the outgoing layout
  // Switching shelves: remember where this one was browsed to and restore the next. Books not on the new shelf tip off and fall,
  // books on both slide together, newcomers drop in (instant with reduced motion).
  useLayoutEffect(() => {
    const was = seen.current
    seen.current = { view,filter }
    if (was.view === view) { if (was.filter !== filter) { motion.glide(0,true); setIndex(0) } return }
    // Where each book on screen stands now, read before the offset changes. Motion is still configured for the outgoing shelf.
    const staying = new Set(books.map(b => b.id)), from = new Map<number,number>(), leaving: Transition['leaving'] = [], edge = motion.span / 2 + 1
    for (const slot of outgoing.current.slots) {
      const x = motion.at(slot.x)
      if (Math.abs(x) > edge) continue
      if (staying.has(slot.book.id)) from.set(slot.book.id,x); else leaving.push({ slot,x })
    }
    positions.current.set(was.view,motion.offset)
    motion.glide(positions.current.get(view) ?? 0,true)
    clearTimeout(swap.current); swap.current = 0; clearTimeout(settle.current)
    setSelected(undefined); setLit(undefined); setEditing(undefined); setIndex(0)
    // Read live rather than from state, which can lag a settings change by a render.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { settle.current = window.setTimeout(() => setTransition(undefined)); return }
    const since = performance.now()
    motion.hold(since + SETTLED)   // no auto-spin until the books have landed
    // Before paint, or the new row flashes in for a frame before its books drop: the one setState this layout effect exists for.
    // oxlint-disable-next-line react/set-state-in-effect
    setTransition({ since,from,leaving })
    settle.current = window.setTimeout(() => setTransition(undefined),SETTLED)
  },[view,filter,motion,books])
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setSize({ w:entry.contentRect.width,h:entry.contentRect.height }))
    observer.observe(node)
    return () => observer.disconnect()
  },[])
  const current = books.find(b => b.id === selected), editBook = books.find(b => b.id === editing)
  const shown = editBook ?? current ?? books.find(b => b.id === lit)
  const read = useReading(shown?.id)
  const activeIndex = Math.max(0,Math.min(index,books.length - 1))
  const fail = useCallback(() => setFailed(true),[])
  useEffect(() => {
    const pref = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(pref.matches)
    const visibility = () => setVisible(!document.hidden)
    pref.addEventListener('change',change); document.addEventListener('visibilitychange',visibility)
    return () => { pref.removeEventListener('change',change); document.removeEventListener('visibilitychange',visibility) }
  },[])
  // The shelf spins on its own and holds still while someone is looking: pointer over it, keyboard browsing, a book out, renaming, a dialog open.
  useEffect(() => {
    motion.pause(paused || reduced || !visible || reading || hovered || keyboard || selected !== undefined || editing !== undefined)
  },[motion,paused,reduced,visible,reading,hovered,keyboard,selected,editing])
  const reset = () => motion.reset()
  const currentId = current?.id
  // Only a pick moves focus; a book reappearing (e.g. a search filter undone) must not steal it.
  useEffect(() => { if (currentId !== undefined && focusNext.current) { focusNext.current = false; openButton.current?.focus({ preventScroll: true }) } },[currentId])
  // Bring Save and Cancel into view on short screens.
  useEffect(() => { if (editing !== undefined) editor.current?.scrollIntoView({ block:'nearest' }) },[editing])
  useEffect(() => { if (editing === undefined && refocus.current) { refocus.current = false; pencil.current?.focus({ preventScroll:true }) } },[editing])
  const dismiss = (restore = true) => {
    clearTimeout(swap.current); swap.current = 0
    setSelected(undefined)
    if (restore) stage.current?.focus({ preventScroll: true })
  }
  // Opening puts the book back first, so the first key press on returning browses instead of reopening it.
  const open = (book: Book) => { clearTimeout(swap.current); swap.current = 0; setSelected(undefined); onOpen(book) }
  const wasReading = useRef(reading)
  useEffect(() => {
    if (wasReading.current && !reading) stage.current?.focus({ preventScroll: true })
    wasReading.current = reading
  },[reading])
  // A book already out (or still heading home) goes back first; the newest click wins.
  const pick = (id: number) => {
    const busy = swap.current || (selected !== undefined && selected !== id)
    clearTimeout(swap.current); swap.current = 0
    setIndex(books.findIndex(b => b.id === id))
    const select = () => { swap.current = 0; if (selected !== id) { reset(); focusNext.current = true } setSelected(id) }
    if (!busy) return select()
    setSelected(undefined)
    swap.current = window.setTimeout(select,reduced ? 0 : SWAP_DELAY_MS)
  }
  // Clear of the faded edges, with room for the book itself.
  const inView = (i: number) => { const s = shelf.slots[i]; return !!s && Math.abs(motion.at(s.x)) < motion.span / 2 * (1 - 2 * EDGE) - s.w }
  const browseTo = (i: number) => {
    if (!books.length) return
    const next = motion.period ? (i % books.length + books.length) % books.length : Math.max(0,Math.min(books.length - 1,i))
    const slot = shelf.slots[next]
    if (!inView(next)) motion.glide(motion.clamp(motion.offset + motion.at(slot.x)),reduced)
    setIndex(next); setLit(slot.book.id)
  }
  const nearest = () => shelf.slots.reduce((best,s,i) => Math.abs(motion.at(s.x)) < Math.abs(motion.at(shelf.slots[best].x)) ? i : best,0)
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
    if (p.inspect && p.cover && current) open(current)
    else pick(p.id)
  }
  const key = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('input,textarea,select')) return
    const axes = { ArrowLeft: ['y',-1],ArrowRight: ['y',1],ArrowUp: ['x',-1],ArrowDown: ['x',1],q: ['z',-1],e: ['z',1] } as const
    const steps: Record<string,number> = { ArrowLeft:activeIndex - 1,ArrowRight:activeIndex + 1,Home:0,End:books.length - 1 }
    if (e.key === 'Escape' && (current || swap.current)) { dismiss(); e.preventDefault() }
    else if (current && e.key in axes) {
      const [axis,sign] = axes[e.key as keyof typeof axes]
      rotateBy(motion.inspection,axis,sign * Math.PI / 12); motion.invalidate(); e.preventDefault()
    } else if (target === stage.current && e.key in steps) { browseTo(steps[e.key]); e.preventDefault() }
    else if (target === stage.current && (e.key === 'Enter' || e.key === ' ') && books[activeIndex]) {
      if (current) open(current); else pick(books[activeIndex].id)
      e.preventDefault()
    }
  }
  const startEdit = (book: Book) => { setEditing(book.id); setDraft(book.title); setRenameError('') }
  const stopEdit = () => { refocus.current = true; setEditing(undefined) }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title || editing === undefined) return
    try { await db.books.update(editing,{ title }); stopEdit() }
    catch (error) { setRenameError(errorMessage(error)) }
  }
  const suggestion = cleanTitle(draft)
  return <section className={styles.shelfSection} hidden={reading} onKeyDown={key}
    onFocusCapture={e => setKeyboard((e.target as HTMLElement).matches(':focus-visible'))}
    onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setKeyboard(false); if (!hovered) setLit(undefined) } }}
    onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true) }}
    onPointerLeave={e => { if (e.pointerType !== 'mouse') return; setHovered(false); if (!e.currentTarget.contains(document.activeElement)) setLit(undefined) }}>
    <div className={styles.stage} ref={stage} role="group" aria-roledescription="bookshelf" aria-describedby={hint} tabIndex={books.length && !failed ? 0 : undefined}
      aria-label={`${label}, ${books.length} ${books.length === 1 ? 'book' : 'books'}`}
      onFocus={e => {
        if (e.target !== e.currentTarget || !e.currentTarget.matches(':focus-visible') || !books.length) return
        const i = books.findIndex(b => b.id === lit)
        browseTo(i >= 0 ? i : inView(activeIndex) ? activeIndex : nearest())
      }}
      onPointerDown={e => { if ((e.target as HTMLElement).tagName === 'CANVAS') begin(e.nativeEvent) }}
      onPointerMove={drag} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={e => { tracks.current.delete(e.pointerId); motion.capture(tracks.current.size > 0) }}>
      {size.w > 0 && size.h > 0 && <ShelfArt w={size.w} h={size.h}/>}
      {!failed && !reading && visible && <div className={styles.row}><GraphicsBoundary fail={fail}><Canvas frameloop="demand" dpr={[1,1.5]}
        gl={props => {
          try { return new WebGLRenderer({ ...props, canvas:props.canvas as HTMLCanvasElement,alpha:true,antialias:true,powerPreference:'low-power' }) }
          catch (error) { fail(); throw error }
        }}>
        <Scene shelf={shelf} transition={transition} selected={current?.id} lit={shown?.id} motion={motion} reduced={reduced} hits={{ down:begin,hover: id => {
          if (stage.current) stage.current.style.cursor = id === undefined ? '' : 'pointer'
          // The caption stays on the last book hovered, so the pointer can travel down to its actions.
          if (id !== undefined) { setLit(id); setIndex(books.findIndex(b => b.id === id)) }
        } }} onLose={fail}/>
      </Canvas></GraphicsBoundary></div>}
      {failed && <div className={styles.fallback}>
        {books.length > 0 && <><p>Book list</p><ul>{books.map(book => <li key={book.id}><button onClick={() => open(book)}>{book.title} <small>{book.author}</small></button></li>)}</ul></>}
      </div>}
      {children}
    </div>
    <p id={hint} hidden>Left and right arrow keys browse the books, Enter takes one out.</p>
    <div className={styles.caption}>
      <span className={styles.srOnly} aria-live="polite">{shown && !editBook ? shown.title + (shown.author ? ', ' + shown.author : '') : ''}</span>
      {editBook ? <form ref={editor} className={styles.rename} onSubmit={save} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); stopEdit() } }}>
        <label htmlFor={hint + 'title'}>Book title</label>
        <input id={hint + 'title'} value={draft} maxLength={300} autoFocus onFocus={e => e.target.select()} onChange={e => setDraft(e.target.value)}/>
        {suggestion && <button type="button" className={styles.link} onClick={() => setDraft(suggestion)}>Use “{suggestion}”</button>}
        {editBook.author && <p className={styles.byline}>{editBook.author}</p>}
        {renameError && <p role="alert" className={styles.error}>{renameError}</p>}
        <div className={styles.actions}><button className={styles.primary} disabled={!draft.trim()}>Save</button>
          <button type="button" className={styles.outline} onClick={stopEdit}>Cancel</button></div>
        {editBook.filename && <p className={styles.meta}>Original file: {editBook.filename}</p>}
      </form> : shown ? <div key={shown.id} className={styles.captionBody}>
        <div className={styles.captionTitle}><h2>{shown.title}</h2>
          {!shown.sample && <button ref={pencil} className={styles.icon} aria-label={'Rename ' + shown.title} onClick={() => startEdit(shown)}><PencilSimpleIcon size={22} aria-hidden="true"/></button>}</div>
        {shown.author && <p className={styles.byline}>{shown.author}</p>}
        {read && <p className={styles.meta}>{read.finished ? 'Finished' : Math.round(read.fraction * 100) + '% read'} · {formatDuration(read.ms)}</p>}
        <button ref={openButton} className={styles.link} onClick={() => open(shown)}>{shown.format ? 'Open book' : 'Attach file'}</button>
        {current && <small className={styles.hint}>Drag to rotate, arrow keys to turn, Q and E to roll</small>}
      </div> : books.length > 0 && !failed && <p className={styles.hint}>Point at, tap or tab to a book to see its title</p>}
    </div>
  </section>
}
