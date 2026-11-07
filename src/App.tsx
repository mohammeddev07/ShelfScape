import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, errorMessage, type Book } from './db'
import { samples } from './library/samples'
import { Shelf } from './Shelf'
import { getTheme, setTheme, type Theme } from './theme'
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, ChartBarIcon, MagnifyingGlassIcon, PlusIcon, SlidersHorizontalIcon, XIcon } from '@phosphor-icons/react'
import styles from './App.module.css'

const Reader = lazy(() => import('./reader/Reader'))
const StatsView = lazy(() => import('./stats/StatsView'))
interface Result { name:string; message:string; failed?:boolean }
type Sort = 'added' | 'title' | 'author'
function BookMark() { return <span className={styles.brandMark} aria-hidden="true"><i/><i/><i/></span> }

export default function App() {
  const [books,setBooks] = useState<Book[]>([]), [loaded,setLoaded] = useState(false)
  const [sample,setSample] = useState(false), [query,setQuery] = useState(''), [sort,setSort] = useState<Sort>('added')
  const [reader,setReader] = useState<Book>(), [tools,setTools] = useState(false), [stats,setStats] = useState(false)
  const [results,setResults] = useState<Result[]>([]), [busy,setBusy] = useState(false), [note,setNote] = useState('')
  const fileInput = useRef<HTMLInputElement>(null), restoreInput = useRef<HTMLInputElement>(null)
  const attach = useRef<number | undefined>(undefined), dialog = useRef<HTMLDialogElement>(null)
  const [editing,setEditing] = useState(false)
  const [dragOver,setDragOver] = useState(false), importing = useRef(false)
  const [persisted,setPersisted] = useState(false), [theme,setThemeState] = useState(getTheme)
  useEffect(() => {
    const sub = liveQuery(() => db.books.toArray()).subscribe({
      next: rows => { setBooks(rows); setLoaded(true) },error: e => { setNote(errorMessage(e)); setLoaded(true) },
    })
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
    return () => sub.unsubscribe()
  },[])
  useEffect(() => {
    if (tools) dialog.current?.showModal(); else dialog.current?.close()
  },[tools])
  const displayed = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return (sample ? samples : books).filter(b => (b.title + ' ' + b.author).toLocaleLowerCase().includes(term)).sort((a,b) =>
      sort === 'added' ? b.added - a.added : a[sort].localeCompare(b[sort]) || a.title.localeCompare(b.title))
  },[sample,books,sort,query])
  const changeShelf = (next: boolean) => { setSample(next); setQuery('') }
  const choose = (id?:number) => { attach.current = id; fileInput.current?.click() }
  const persist = async () => {
    const granted = await navigator.storage?.persist?.()
    setPersisted(!!granted)
    return granted
  }
  const importFiles = async (files: File[],id?:number) => {
    if (importing.current || !files.length) return
    importing.current = true; setBusy(true); setNote('')
    const rows = files.map(f => ({name:f.name,message:'Waiting'}))
    setResults([...rows])
    persist().catch(() => {})
    try {
      const { importFile } = await import('./library/import')
      let success = false
      for (let i = 0; i < files.length; i++) {
        rows[i] = { name:files[i].name,message:'Importing…' }; setResults([...rows])
        try { rows[i].message = await importFile(files[i],id); success = true }
        catch (e) { rows[i] = { name:files[i].name,message:errorMessage(e),failed:true } as Result }
        setResults([...rows])
      }
      if (success) changeShelf(false)
    } catch (e) { setNote(errorMessage(e)) }
    finally { setBusy(false); importing.current = false }
  }
  const exportFiles = async () => {
    setNote('Preparing backup…')
    try {
      const { exportBackup } = await import('./library/backup')
      const url = URL.createObjectURL(await exportBackup())
      const a = document.createElement('a'); a.href = url; a.download = 'shelfscape-backup.zip'; a.click()
      window.setTimeout(() => URL.revokeObjectURL(url),60000); setNote('Backup ready to save.')
    } catch (e) { setNote(errorMessage(e)) }
  }
  const restore = async (file: File) => {
    try { const { restoreBackup } = await import('./library/backup'); await restoreBackup(file); changeShelf(false); setNote('Backup restored.') }
    catch (e) { setNote(errorMessage(e)) }
  }
  return <>
    <main hidden={!!reader || stats} className={styles.app} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); void importFiles([...e.dataTransfer.files]) }}>
      <header className={styles.mast}><div className={styles.wordmark}><BookMark/>ShelfScape</div>
        <div className={styles.mastTools}><button className={styles.ghost} onClick={() => setStats(true)}><ChartBarIcon size={20} aria-hidden="true"/><span>Reading stats</span></button>
        <button className={styles.ghost} onClick={() => setTools(true)}><SlidersHorizontalIcon size={20} aria-hidden="true"/><span>Library tools</span></button></div></header>
      <div className={styles.heading}><div className={styles.titleRow}><h1>{sample ? 'Sample shelf' : 'My library'}</h1>
        <button className={styles.primary} disabled={busy} onClick={() => choose()}><PlusIcon size={18} aria-hidden="true"/>Import</button></div>
        <div className={styles.searchRow} onFocus={() => setEditing(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setEditing(false) }}><label className={styles.search}><MagnifyingGlassIcon size={18} aria-hidden="true"/>
          <input type="search" aria-label="Search by title or author" placeholder="Search your books" value={query} onChange={e => setQuery(e.target.value)}/></label>
          <label className={styles.sort}><span>Sort</span><select aria-label="Sort books" value={sort} onChange={e => setSort(e.target.value as Sort)}>
            <option value="added">Date added</option><option value="title">Title</option><option value="author">Author</option></select><CaretDownIcon size={14} aria-hidden="true"/></label></div>
      </div>
      <Shelf paused={editing || tools || busy} books={displayed} reading={!!reader || stats} onOpen={book => book.format ? setReader(book) : choose(book.id)} label={sample ? 'Sample bookshelf' : 'Personal bookshelf'}>
        {!displayed.length && <div className={styles.empty}>
          {!query && <img src={import.meta.env.BASE_URL + 'art/bookplate.jpg'} alt="" className={styles.bookplate}/>}
          <div className={styles.invitation}><h2>{query ? 'No matching books' : loaded ? 'A place for your books' : 'Opening your library…'}</h2>
            <p>{query ? 'Try another title or author.' : 'Bring your PDFs and EPUBs to the shelf.'}</p>
            {query ? <button className={styles.ghost} onClick={() => setQuery('')}>Clear search</button> :
            <button className={styles.ghost} onClick={() => changeShelf(true)}>Explore sample shelf<CaretRightIcon size={16} aria-hidden="true"/></button>}</div>
        </div>}
      </Shelf>
      <div className={styles.foot}><span>Stored on this device</span>
        {sample ? <button className={styles.ghost} onClick={() => changeShelf(false)}><CaretLeftIcon size={16} aria-hidden="true"/>My library</button> : books.length > 0 ? <button className={styles.ghost} onClick={() => changeShelf(true)}>Explore sample shelf<CaretRightIcon size={16} aria-hidden="true"/></button> : <span>PDF &amp; EPUB</span>}</div>
      {results.length > 0 && <aside className={styles.results} aria-live="polite"><div><strong>{busy ? 'Importing books' : 'Import results'}</strong>
        {!busy && <button className={styles.icon} onClick={() => setResults([])} aria-label="Dismiss import results"><XIcon size={18} aria-hidden="true"/></button>}</div>
        {results.map((r,i) => <p key={i} className={r.failed ? styles.error : ''}>{r.name} · {r.message}</p>)}</aside>}
      {note && !tools && <p role="status" className={styles.note}>{note}</p>}
      {dragOver && <div className={styles.drop}>Drop books to import</div>}
    </main>
    <input ref={fileInput} type="file" hidden multiple accept=".epub,.pdf" onChange={e => {
      const files = [...(e.target.files ?? [])]; e.target.value = ''; void importFiles(attach.current ? files.slice(0,1) : files,attach.current); attach.current = undefined
    }}/>
    <input ref={restoreInput} type="file" hidden accept=".zip" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }}/>
    <dialog ref={dialog} onClose={() => setTools(false)} className={styles.dialog}>
      <header><h2>Library tools</h2><button className={styles.icon} aria-label="Close library tools" onClick={() => setTools(false)}><XIcon size={20} aria-hidden="true"/></button></header>
      <h3>Library backup</h3><p>Save a copy of your books, reading positions, and bookmarks.</p>
      <div className={styles.actions}><button className={styles.secondary} onClick={exportFiles}>Export backup</button><button className={styles.secondary} onClick={() => restoreInput.current?.click()}>Restore backup</button></div>
      <h3>Appearance</h3><label className={styles.sort}><span>Theme</span><select aria-label="Theme" value={theme} onChange={e => { setTheme(e.target.value as Theme); setThemeState(getTheme()) }}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select><CaretDownIcon size={14} aria-hidden="true"/></label>
      <h3>Device storage</h3><p>{persisted ? 'Persistent storage is enabled.' : 'Your browser manages storage on this device.'}</p>
      {!persisted && <button className={styles.secondary} onClick={() => persist().then(ok => setNote(ok ? 'Storage protected.' : 'Your browser manages this permission. Keep a backup.')).catch(e => setNote(errorMessage(e)))}>Request persistent storage</button>}
      <h3>Install ShelfScape</h3><p>On iPhone, open Safari’s Share menu and choose Add to Home Screen. On Android or desktop, choose Install app from the browser menu.</p>
      <a href={import.meta.env.BASE_URL + 'samples/CREDITS.txt'} target="_blank" rel="noreferrer">Sample book credits</a>
      <p role="status">{note}</p>
    </dialog>
    {stats && <Suspense fallback={<p>Opening stats…</p>}><StatsView books={[...books,...samples]} back={() => setStats(false)}/></Suspense>}
    {reader && <Suspense fallback={<p>Opening reader…</p>}><Reader book={reader} back={() => setReader(undefined)}/></Suspense>}
  </>
}
