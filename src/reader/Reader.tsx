import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowBendDownRightIcon, BookmarkSimpleIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, DotsThreeIcon, HighlighterIcon, MagnifyingGlassIcon, MinusIcon, MoonIcon, NotePencilIcon, PlusIcon, SunIcon, TextAaIcon } from '@phosphor-icons/react'
import { liveQuery } from 'dexie'
import { db, original, errorMessage, type Annotation, type Book, type HighlightColor, type Location, type Progress } from '../db'
import type { ReaderAdapter, ReaderStatus } from './adapter'
import { DaySegments, FINISHED_AT, MIN_SESSION_MS, ProgressTrail, ReadingClock } from '../stats/core'
import Toolbar from '../annotations/Toolbar'
import NotesPanel from '../annotations/NotesPanel'
import { setTheme, useResolvedTheme } from '../theme'
import styles from '../App.module.css'

const percent = (progress: number) => Math.round(progress * 100) + '%'

export default function Reader({ book,back }: { book:Book; back:() => void }) {
  const host = useRef<HTMLDivElement>(null), adapter = useRef<ReaderAdapter | null>(null)
  const selectedPassage = useRef<Location | undefined>(undefined)
  const reading = useRef<ReadingClock | null>(null), jumping = useRef(false)
  const backButton = useRef<HTMLButtonElement>(null), notesButton = useRef<HTMLButtonElement>(null), pressed = useRef(0)
  const [status,setStatus] = useState<ReaderStatus>(), [ready,setReady] = useState(false)
  const [error,setError] = useState(''), [marks,setMarks] = useState<Location>(), [notice,setNoticeState] = useState({ text:'',n:0 })
  const [menu,setMenu] = useState(false), [page,setPage] = useState('')
  const [list,setList] = useState<Annotation[]>([]), [picked,setPicked] = useState<DOMRect>()
  const [panel,setPanel] = useState(false), [editing,setEditing] = useState<number>()
  const edit = (id?: number) => { if (id) { setEditing(id); setPanel(true) } }
  const closePanel = () => { setPanel(false); notesButton.current?.focus() }
  useEffect(() => {
    const sub = liveQuery(() => db.annotations.where({ book:book.id }).toArray()).subscribe({ next:setList,error:e => setError(errorMessage(e)) })
    return () => sub.unsubscribe()
  },[book])
  useEffect(() => {
    backButton.current?.focus()
    const controller = new AbortController()
    let pending: Location | undefined, timer = 0, fraction = 0, end = false
    const fail = (e: unknown) => { if (!controller.signal.aborted) setError(errorMessage(e)) }
    // Read-modify-write in one transaction so progress saves and the measurement never overwrite each other.
    const progress = (patch: (p?: Progress) => Partial<Progress>) => db.transaction('rw',db.progress,async () => {
      const p = await db.progress.get(book.id)
      await db.progress.put({ fraction:0,...p,...patch(p),id:book.id,updated:Date.now() })
    })
    const opened = Date.now(), clock = new ReadingClock(opened), days = new DaySegments(opened)
    let trail: ProgressTrail | undefined, session: number | undefined, saving = Promise.resolve(), here = ''
    reading.current = clock
    // Saves are chained so the first put's id is known before the next one, keeping one row per visit and day.
    const record = () => {
      if (!trail) return
      const { fresh, row } = days.next(Date.now(),clock.active,trail)
      // Reset inside the chain so a put still in flight cannot hand the old day's id to the new row.
      if (fresh) saving = saving.then(() => { session = undefined })
      if (row.active < MIN_SESSION_MS) return
      const full = { book:book.id,...row }
      saving = saving.then(async () => { session = await db.sessions.put(session ? { ...full,id:session } : full) }).catch(fail)
    }
    const flush = () => {
      window.clearTimeout(timer); record()
      if (!pending) return
      const location = pending; pending = undefined
      db.positions.put({ id:book.id,location }).catch(fail)
      progress(p => ({ fraction,finished:p?.finished ?? (fraction >= FINISHED_AT || end ? Date.now() : undefined) })).catch(fail)
    }
    const hide = () => { if (document.hidden) { clock.pause(Date.now()); flush() } else clock.touch(Date.now()) }
    document.addEventListener('visibilitychange',hide); window.addEventListener('pagehide',flush)
    async function start() {
      const [file,saved,bookmark,known] = await Promise.all([original(book),db.positions.get(book.id),db.bookmarks.get(book.id),db.progress.get(book.id)])
      controller.signal.throwIfAborted(); setMarks(bookmark?.location)
      const open = book.format === 'epub' ? (await import('./epub')).openEpub : (await import('./pdf')).openPdf
      controller.signal.throwIfAborted()
      const reader = await open({ file,element:host.current!,saved:saved?.location,locations:known?.locations,signal:controller.signal,error:fail,
        // Keep the passage too: on touch, tapping the toolbar can clear the selection before the click lands.
        // A selection cleared any other way is forgotten, so keyboard actions never reach a stale passage.
        select(active) {
          if (active) selectedPassage.current = adapter.current?.location(true)
          else if (Date.now() - pressed.current > 1000) selectedPassage.current = undefined
          setPicked(active ? adapter.current?.selectionRect() : undefined)
        },
        activate(key) { if (key !== 'bookmark') edit(Number(key)) },
        change(location,state) {
          if (controller.signal.aborted) return
          pending = location; fraction = state.progress; end = state.last
          // A re-report of the same spot (EPUB progress after measuring) is neither reading nor movement: re-baseline only.
          const key = JSON.stringify(location)
          if (key === here) trail?.jump(fraction)
          else {
            here = key; clock.touch(Date.now()); selectedPassage.current = undefined
            if (!trail) trail = new ProgressTrail(fraction)
            else if (jumping.current) trail.jump(fraction)
            else trail.move(fraction)
          }
          jumping.current = false
          // Scrolling reports continuously; re-render only when something shown changes.
          setStatus(old => old && old.label === state.label && old.first === state.first && old.last === state.last && old.where === state.where &&
            percent(old.progress) === percent(state.progress) ? old : state)
          window.clearTimeout(timer); timer = window.setTimeout(flush,250)
        },
      })
      controller.signal.throwIfAborted(); adapter.current = reader; setReady(true)
      // Best effort: a book that reads fine but cannot be measured shows no error, and words stay unset so a later open retries.
      if (known?.words === undefined) reader.measure(controller.signal)
        .then(measured => { controller.signal.throwIfAborted(); return progress(() => measured) }).catch(() => {})
    }
    start().catch(fail)
    return () => {
      flush(); controller.abort(); adapter.current = null; reading.current = null
      document.removeEventListener('visibilitychange',hide); window.removeEventListener('pagehide',flush)
    }
  },[book])
  const run = (promise?: Promise<unknown>) => { promise?.catch(e => setError(errorMessage(e))) }
  // Jumps and reflows move the position without reading, so the next change is not forward progress.
  // The flag clears on the change the adapter reports; a rejected call reports none, so clear it there too.
  // Not in finally: epub.js emits relocated a frame after display() resolves.
  const leap = (act: (reader: ReaderAdapter) => Promise<void>) => {
    const reader = adapter.current
    if (!reader) return
    jumping.current = true
    run(act(reader).catch(e => { jumping.current = false; throw e }))
  }
  const jump = (to: Location | string) => leap(reader => reader.jump(to))
  const resize = (n: number) => leap(reader => reader.resizeText(n))
  const touch = () => reading.current?.touch(Date.now())
  // Each notice remounts its pill (keyed by count) and clears after the 4s fade, so a repeated message shows and is announced again.
  const setNotice = (text: string) => setNoticeState(old => ({ text,n:old.n + 1 }))
  useEffect(() => {
    if (!notice.text) return
    const timer = window.setTimeout(() => setNoticeState(old => ({ ...old,text:'' })),4300)
    return () => window.clearTimeout(timer)
  },[notice])
  const night = useResolvedTheme()
  useEffect(() => { if (ready) adapter.current?.theme(night) },[ready,night])
  useEffect(() => {
    if (ready) adapter.current?.paint([...list.map(a => ({ key:String(a.id),location:a.location,style:a.color })),
      ...marks?.text ? [{ key:'bookmark',location:marks,style:'bookmark' as const }] : []])
  },[ready,list,marks])
  const highlight = async (color: HighlightColor) => {
    const location = [adapter.current?.location(true),selectedPassage.current].find(l => l?.text)
    if (!location || !status) { setNotice('Select text to highlight it.'); return }
    const now = Date.now()
    const id = await db.annotations.add({ book:book.id,location,color,note:'',where:status.where,order:status.progress,created:now,updated:now })
    getSelection()?.removeAllRanges(); host.current?.querySelectorAll('iframe').forEach(f => f.contentWindow?.getSelection()?.removeAllRanges())
    selectedPassage.current = undefined; setPicked(undefined)
    return id
  }
  const bookmark = async () => {
    const now = adapter.current?.location(true)
    const location = now?.text ? now : selectedPassage.current ?? now
    if (location) {
      await db.bookmarks.put({ id:book.id,location }); setMarks(location)
      setNotice(location.text ? 'Passage bookmarked.' : 'Reading position bookmarked.')
    }
  }
  return <main className={styles.reader} onPointerDownCapture={e => {
    if ((e.target as Element).closest('[role=toolbar],.' + styles.readerMenu)) pressed.current = Date.now()
  }} onPointerDown={touch} onWheel={touch} onKeyDown={e => {
    touch()
    if (e.key === 'Escape') { if (menu) setMenu(false); else if (panel) closePanel(); else back() }
    if (e.target === host.current && ['ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault(); run(adapter.current?.step(e.key === 'ArrowLeft' ? -1 : 1))
    }
  }}>
    <header className={styles.readerHeader}>
      <button ref={backButton} className={styles.ghost} onClick={back}><CaretLeftIcon size={18} aria-hidden="true"/>Library</button><h1>{book.title}</h1>
      <div><button ref={notesButton} className={styles.icon} aria-label="Notes & highlights" aria-expanded={panel} onClick={() => { setEditing(undefined); setPanel(!panel) }}><NotePencilIcon size={20} aria-hidden="true"/></button>
      <button className={styles.icon} onPointerDown={() => { selectedPassage.current = adapter.current?.location(true) }} aria-label="Reading options" aria-expanded={menu} onClick={() => setMenu(!menu)}><DotsThreeIcon size={20} weight="bold" aria-hidden="true"/></button></div></header>
    {menu && <aside className={styles.readerMenu}>
      <button className={styles.ghost} disabled={!ready} onPointerDown={e => e.preventDefault()} onClick={() => run(bookmark())}><BookmarkSimpleIcon size={18} aria-hidden="true"/>Bookmark this passage</button>
      <button className={styles.ghost} disabled={!ready} onPointerDown={e => e.preventDefault()} onClick={() => { run(highlight('yellow')); setMenu(false) }}><HighlighterIcon size={18} aria-hidden="true"/>Highlight selection</button>
      <button className={styles.ghost} disabled={!marks || !ready} onClick={() => { if (marks) jump(marks); setMenu(false) }}><ArrowBendDownRightIcon size={18} aria-hidden="true"/>Go to bookmark</button>
      {status && status.contents.length > 0 && <label>Contents<span className={styles.select}><select defaultValue="" onChange={e => { jump(e.target.value); setMenu(false) }}>
        <option value="" disabled>Choose a chapter</option>{status.contents.map((c,i) => <option key={i} value={c.target}>{c.title}</option>)}</select><CaretDownIcon size={14} aria-hidden="true"/></span></label>}
      {book.format === 'pdf' && <form onSubmit={e => { e.preventDefault(); jump(page); setMenu(false) }}>
        <label>Go to page <input type="number" min="1" required value={page} onChange={e => setPage(e.target.value)}/></label><button className={styles.secondary}>Go</button></form>}
    </aside>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!ready && !error && <p className={styles.readerLoading}>Opening your book…</p>}
    <div ref={host} className={styles.document} tabIndex={0} aria-label={book.title + ' reading area'}
      onScroll={() => { if (picked) setPicked(adapter.current?.selectionRect()) }}/>
    {picked && <Toolbar rect={picked} touch={matchMedia('(pointer: coarse)').matches} onColor={c => run(highlight(c))} onNote={() => run(highlight('yellow').then(edit))}/>}
    {panel && <NotesPanel book={book} list={list} editing={editing} onClose={closePanel}
      onJump={a => jump({ ...a.location,text:undefined })}/>}
    <p role="status" className={styles.readerNotice}>{notice.text && <span key={notice.n}>{notice.text}</span>}</p>
    <footer className={styles.readerFooter} style={{ '--read':status ? percent(status.progress) : '0%' } as CSSProperties}>
      <div><div className={styles.group}>
        <button className={styles.icon} aria-label={book.format === 'pdf' ? 'Zoom out' : 'Decrease font size'} disabled={!ready} onClick={() => resize(-1)}><MinusIcon size={16} aria-hidden="true"/></button>
        {book.format === 'pdf' ? <MagnifyingGlassIcon size={16} aria-hidden="true"/> : <TextAaIcon size={18} aria-hidden="true"/>}
        <button className={styles.icon} aria-label={book.format === 'pdf' ? 'Zoom in' : 'Increase font size'} disabled={!ready} onClick={() => resize(1)}><PlusIcon size={16} aria-hidden="true"/></button></div>
        <button className={styles.icon} aria-label="Night mode" aria-pressed={night === 'dark'} onClick={() => setTheme(night === 'dark' ? 'light' : 'dark')}>
          {night === 'dark' ? <SunIcon size={20} aria-hidden="true"/> : <MoonIcon size={20} aria-hidden="true"/>}</button></div>
      <div><button className={styles.icon} aria-label="Previous page" disabled={!ready || status?.first} onClick={() => run(adapter.current?.step(-1))}><CaretLeftIcon size={20} aria-hidden="true"/></button>
        <span>{status ? status.label + ' · ' + percent(status.progress) : 'Opening…'}</span>
        <button className={styles.icon} aria-label="Next page" disabled={!ready || status?.last} onClick={() => run(adapter.current?.step(1))}><CaretRightIcon size={20} aria-hidden="true"/></button></div>
    </footer>
  </main>
}
