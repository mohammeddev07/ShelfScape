import { useEffect, useRef, useState } from 'react'
import { db, original, errorMessage, type Book, type Location, type Progress } from '../db'
import type { ReaderAdapter, ReaderStatus } from './adapter'
import { FINISHED_AT } from '../stats/core'
import styles from '../App.module.css'

const percent = (progress: number) => Math.floor(progress * 100) + '%'

export default function Reader({ book,back }: { book:Book; back:() => void }) {
  const host = useRef<HTMLDivElement>(null), adapter = useRef<ReaderAdapter | null>(null)
  const selectedPassage = useRef<Location | undefined>(undefined)
  const backButton = useRef<HTMLButtonElement>(null)
  const [status,setStatus] = useState<ReaderStatus>(), [ready,setReady] = useState(false)
  const [error,setError] = useState(''), [marks,setMarks] = useState<Location>(), [notice,setNotice] = useState('')
  const [menu,setMenu] = useState(false), [page,setPage] = useState('')
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
    const flush = () => {
      window.clearTimeout(timer)
      if (!pending) return
      const location = pending; pending = undefined
      db.positions.put({ id:book.id,location }).catch(fail)
      progress(p => ({ fraction,finished:p?.finished ?? (fraction >= FINISHED_AT || end ? Date.now() : undefined) })).catch(fail)
    }
    const hide = () => { if (document.hidden) flush() }
    document.addEventListener('visibilitychange',hide); window.addEventListener('pagehide',flush)
    async function start() {
      const [file,saved,bookmark,known] = await Promise.all([original(book),db.positions.get(book.id),db.bookmarks.get(book.id),db.progress.get(book.id)])
      controller.signal.throwIfAborted(); setMarks(bookmark?.location)
      const open = book.format === 'epub' ? (await import('./epub')).openEpub : (await import('./pdf')).openPdf
      controller.signal.throwIfAborted()
      const reader = await open({ file,element:host.current!,saved:saved?.location,locations:known?.locations,signal:controller.signal,error:fail,
        change(location,state) {
          if (controller.signal.aborted) return
          pending = location; fraction = state.progress; end = state.last
          // Scrolling reports continuously; re-render only when something shown changes.
          setStatus(old => old && old.label === state.label && old.first === state.first && old.last === state.last && old.where === state.where &&
            percent(old.progress) === percent(state.progress) ? old : state)
          window.clearTimeout(timer); timer = window.setTimeout(flush,250)
        },
      })
      controller.signal.throwIfAborted(); adapter.current = reader; setReady(true)
      if (known?.words === undefined) {
        const measured = await reader.measure(controller.signal)
        await progress(() => measured)
      }
    }
    start().catch(fail)
    return () => {
      flush(); controller.abort(); adapter.current = null
      document.removeEventListener('visibilitychange',hide); window.removeEventListener('pagehide',flush)
    }
  },[book])
  const run = (promise?: Promise<void>) => { promise?.catch(e => setError(errorMessage(e))) }
  const bookmark = async () => {
    const now = adapter.current?.location(true)
    const location = now?.text ? now : selectedPassage.current ?? now
    if (location) {
      await db.bookmarks.put({ id:book.id,location }); setMarks(location)
      setNotice(location.text ? 'Passage bookmarked.' : 'Reading position bookmarked.')
    }
  }
  return <main className={styles.reader} onKeyDown={e => {
    if (e.key === 'Escape') { if (menu) setMenu(false); else back() }
    if (e.target === host.current && ['ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault(); run(adapter.current?.step(e.key === 'ArrowLeft' ? -1 : 1))
    }
  }}>
    <header className={styles.readerHeader}><button ref={backButton} onClick={back}>‹ Library</button><h1>{book.title}</h1>
      <button onPointerDown={() => { selectedPassage.current = adapter.current?.location(true) }} aria-label="Reading options" aria-expanded={menu} onClick={() => setMenu(!menu)}>•••</button></header>
    {menu && <aside className={styles.readerMenu}>
      <button disabled={!ready} onPointerDown={e => e.preventDefault()} onClick={() => run(bookmark())}>Bookmark this passage</button>
      <button disabled={!marks || !ready} onClick={() => { if (marks) run(adapter.current?.jump(marks)); setMenu(false) }}>Go to bookmark</button>
      {status && status.contents.length > 0 && <label>Contents<select defaultValue="" onChange={e => { run(adapter.current?.jump(e.target.value)); setMenu(false) }}>
        <option value="" disabled>Choose a chapter</option>{status.contents.map((c,i) => <option key={i} value={c.target}>{c.title}</option>)}</select></label>}
      {book.format === 'pdf' && <form onSubmit={e => { e.preventDefault(); run(adapter.current?.jump(page)); setMenu(false) }}>
        <label>Go to page <input type="number" min="1" required value={page} onChange={e => setPage(e.target.value)}/></label><button>Go</button></form>}
    </aside>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!ready && !error && <p className={styles.readerLoading}>Opening your book…</p>}
    <div ref={host} className={styles.document} tabIndex={0} aria-label={book.title + ' reading area'}/>
    <p role="status" className={styles.readerNotice}>{notice}</p>
    <footer className={styles.readerFooter}>
      <div><button aria-label={book.format === 'pdf' ? 'Zoom out' : 'Decrease font size'} disabled={!ready} onClick={() => run(adapter.current?.resizeText(-1))}>A−</button>
        <button aria-label={book.format === 'pdf' ? 'Zoom in' : 'Increase font size'} disabled={!ready} onClick={() => run(adapter.current?.resizeText(1))}>A+</button></div>
      <button aria-label="Previous page" disabled={!ready || status?.first} onClick={() => run(adapter.current?.step(-1))}>‹</button>
      <span>{status ? status.label + ' · ' + percent(status.progress) : 'Opening…'}</span><button aria-label="Next page" disabled={!ready || status?.last} onClick={() => run(adapter.current?.step(1))}>›</button>
    </footer>
  </main>
}
