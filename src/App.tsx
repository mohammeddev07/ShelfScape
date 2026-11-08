import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, errorMessage, type Book, type BookShelf } from './db'
import { samples } from './library/samples'
import { Shelf } from './Shelf'
import { setTheme, useTheme, type Theme } from './theme'
import { BooksIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, ChartBarIcon, MagnifyingGlassIcon, PlusIcon, SlidersHorizontalIcon, StackIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import styles from './App.module.css'

const Reader = lazy(() => import('./reader/Reader'))
const StatsView = lazy(() => import('./stats/StatsView'))
interface Result { name:string; message:string; failed?:boolean; id?:number; suggestion?:string }
type Sort = 'added' | 'title' | 'author'
/** All books, the sample shelf, or a custom shelf id. */
type View = 'all' | 'sample' | number
function BookMark() { return <span className={styles.brandMark} aria-hidden="true"><i/><i/><i/></span> }
const withBooks = (id: number, change: (books: number[]) => number[]) => db.shelves.where('id').equals(id).modify(s => { s.books = change(s.books) })

export default function App() {
  const [books,setBooks] = useState<Book[]>([]), [shelves,setShelves] = useState<BookShelf[]>([]), [loaded,setLoaded] = useState(false)
  const [view,setView] = useState<View>('all'), [query,setQuery] = useState(''), [sort,setSort] = useState<Sort>('added')
  const [reader,setReader] = useState<Book>(), [tools,setTools] = useState(false), [stats,setStats] = useState(false)
  const [results,setResults] = useState<Result[]>([]), [busy,setBusy] = useState(false), [note,setNote] = useState('')
  const [creating,setCreating] = useState(false), [shelfName,setShelfName] = useState('')
  const [managing,setManaging] = useState(false), [pickQuery,setPickQuery] = useState(''), [confirmDelete,setConfirmDelete] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null), restoreInput = useRef<HTMLInputElement>(null)
  const attach = useRef<number | undefined>(undefined), dialog = useRef<HTMLDialogElement>(null), manageDialog = useRef<HTMLDialogElement>(null)
  const [dragOver,setDragOver] = useState(false), importing = useRef(false)
  const [persisted,setPersisted] = useState(false), theme = useTheme()
  useEffect(() => {
    const sub = liveQuery(() => db.books.toArray()).subscribe({
      next: rows => { setBooks(rows); setLoaded(true) },error: e => { setNote(errorMessage(e)); setLoaded(true) },
    })
    const shelfSub = liveQuery(() => db.shelves.toArray()).subscribe({ next:setShelves,error: e => setNote(errorMessage(e)) })
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
    return () => { sub.unsubscribe(); shelfSub.unsubscribe() }
  },[])
  useEffect(() => {
    if (tools) dialog.current?.showModal(); else dialog.current?.close()
  },[tools])
  useEffect(() => {
    if (managing) manageDialog.current?.showModal(); else manageDialog.current?.close()
  },[managing])
  const active = typeof view === 'number' ? shelves.find(s => s.id === view) : undefined
  const shown: View = typeof view === 'number' && !active ? 'all' : view   // a deleted shelf falls back to All books
  const sample = shown === 'sample'
  const members = useMemo(() => new Set(active?.books),[active])
  const displayed = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return (sample ? samples : active ? books.filter(b => members.has(b.id)) : books).filter(b => (b.title + ' ' + b.author).toLocaleLowerCase().includes(term)).sort((a,b) =>
      sort === 'added' ? b.added - a.added : a[sort].localeCompare(b[sort]) || a.title.localeCompare(b.title))
  },[sample,active,members,books,sort,query])
  const changeShelf = (next: View) => { setView(next); setQuery('') }
  const choose = (id?:number) => { attach.current = id; fileInput.current?.click() }
  const persist = async () => {
    const granted = await navigator.storage?.persist?.()
    setPersisted(!!granted)
    return granted
  }
  const importFiles = async (files: File[],id?:number) => {
    if (importing.current || !files.length) return
    importing.current = true; setBusy(true); setNote('')
    const rows: Result[] = files.map(f => ({name:f.name,message:'Waiting'})), added: number[] = []
    setResults([...rows])
    persist().catch(() => {})
    try {
      const { importFile } = await import('./library/import')
      let success = false
      for (let i = 0; i < files.length; i++) {
        rows[i] = { name:files[i].name,message:'Importing…' }; setResults([...rows])
        try {
          const r = await importFile(files[i],id)
          rows[i] = { name:files[i].name,...r }; success = true
          if (r.id) added.push(r.id)
        } catch (e) { rows[i] = { name:files[i].name,message:errorMessage(e),failed:true } }
        setResults([...rows])
      }
      // Importing while a custom shelf is open puts the books on it too.
      if (active && added.length) await withBooks(active.id,list => [...new Set([...list,...added])])
      if (success && sample) changeShelf('all')
    } catch (e) { setNote(errorMessage(e)) }
    finally { setBusy(false); importing.current = false }
  }
  const applySuggestion = async (i: number) => {
    const { id,suggestion } = results[i]
    if (!id || !suggestion) return
    try {
      await db.books.update(id,{ title:suggestion })
      setResults(list => list.map((r,j) => j === i ? { ...r,message:'Renamed to “' + suggestion + '”',suggestion:undefined } : r))
    } catch (e) { setNote(errorMessage(e)) }
  }
  const cancelCreate = () => { setCreating(false); setShelfName('') }
  const createShelf = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = shelfName.trim()
    if (!name) return
    try {
      const existing = shelves.find(s => s.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      const id = existing?.id ?? await db.shelves.add({ name,books:[] as number[],created:Date.now() } as BookShelf)
      cancelCreate(); changeShelf(id)
      if (!existing && books.length) setManaging(true)
    } catch (error) { setNote(errorMessage(error)) }
  }
  const deleteShelf = async () => {
    if (!active) return
    try { await db.shelves.delete(active.id); setManaging(false); changeShelf('all') }
    catch (e) { setNote(errorMessage(e)) }
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
    try { const { restoreBackup } = await import('./library/backup'); await restoreBackup(file); if (sample) changeShelf('all'); setNote('Backup restored.') }
    catch (e) { setNote(errorMessage(e)) }
  }
  const tabs: [View,string][] = [['all','All books'],...shelves.map(s => [s.id,s.name] as [View,string])]
  const pickTerm = pickQuery.trim().toLocaleLowerCase()
  return <>
    <main hidden={!!reader || stats} className={styles.app} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); void importFiles([...e.dataTransfer.files]) }}>
      <header className={styles.mast}><div className={styles.wordmark}><BookMark/>ShelfScape</div>
        <div className={styles.mastTools}><button className={styles.ghost} onClick={() => setStats(true)}><ChartBarIcon size={20} aria-hidden="true"/><span>Reading stats</span></button>
        <button className={styles.ghost} onClick={() => setTools(true)}><SlidersHorizontalIcon size={20} aria-hidden="true"/><span>Library tools</span></button></div></header>
      <div className={styles.heading}><div className={styles.titleRow}><h1>{sample ? 'Sample shelf' : 'My library'}</h1>
        <button className={styles.outline} disabled={busy} onClick={() => choose()}><PlusIcon size={18} aria-hidden="true"/>Import</button></div>
        <div className={styles.shelfBar}>
          <nav className={styles.tabs} aria-label="Shelves">
            {tabs.map(([id,name]) => <button key={id} aria-current={shown === id ? 'page' : undefined} onClick={() => changeShelf(id)}>{name}</button>)}
          </nav>
          <label className={styles.shelfSelect}><StackIcon size={20} aria-hidden="true"/>
            <select aria-label="Shelf" value={String(shown)} onChange={e => {
              const v = e.target.value
              if (v === 'new') setCreating(true); else changeShelf(v === 'all' || v === 'sample' ? v : Number(v))
            }}>
              {tabs.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
              {sample && <option value="sample">Sample shelf</option>}
              <option value="new">+ New shelf</option>
            </select><CaretDownIcon size={14} aria-hidden="true"/></label>
          {creating ? <form className={styles.newShelfForm} onSubmit={createShelf} onKeyDown={e => { if (e.key === 'Escape') cancelCreate() }}>
            <input aria-label="Shelf name" placeholder="Shelf name" value={shelfName} maxLength={60} autoFocus onChange={e => setShelfName(e.target.value)}/>
            <button className={styles.primary} disabled={!shelfName.trim()}>Create</button>
            <button type="button" className={styles.ghost} onClick={cancelCreate}>Cancel</button>
          </form> : <button className={styles.newShelf} onClick={() => setCreating(true)}><PlusIcon size={16} aria-hidden="true"/>New shelf</button>}
        </div>
        <div className={styles.searchRow}><label className={styles.search}><MagnifyingGlassIcon size={18} aria-hidden="true"/>
          <input type="search" aria-label="Search by title or author" placeholder="Search your books" value={query} onChange={e => setQuery(e.target.value)}/></label>
          <label className={styles.sort}><span>Sort</span><select aria-label="Sort books" value={sort} onChange={e => setSort(e.target.value as Sort)}>
            <option value="added">Date added</option><option value="title">Title</option><option value="author">Author</option></select><CaretDownIcon size={14} aria-hidden="true"/></label>
          {active && <button className={styles.secondary} onClick={() => setManaging(true)}><BooksIcon size={18} aria-hidden="true"/><span>Edit shelf</span></button>}</div>
      </div>
      <Shelf books={displayed} view={String(shown)} filter={query + '\n' + sort} reading={!!reader || stats} paused={tools || managing || busy || creating} onOpen={book => book.format ? setReader(book) : choose(book.id)}
        label={sample ? 'Sample shelf' : active ? active.name : 'All books'}>
        {!displayed.length && <div className={styles.empty}>
          {!query && !active && <img src={import.meta.env.BASE_URL + 'art/bookplate.jpg'} alt="" className={styles.bookplate}/>}
          <div className={styles.invitation}><h2>{query ? 'No matching books' : !loaded ? 'Opening your library…' : active ? 'Nothing on ' + active.name + ' yet' : 'A place for your books'}</h2>
            <p>{query ? 'Try another title or author.' : active ? books.length ? 'Choose books from your library to keep here.' : 'Import PDFs and EPUBs to start this shelf.' : 'Bring your PDFs and EPUBs to the shelf.'}</p>
            {query ? <button className={styles.ghost} onClick={() => setQuery('')}>Clear search</button> :
            active ? books.length > 0 && <button className={styles.ghost} onClick={() => setManaging(true)}>Add books<CaretRightIcon size={16} aria-hidden="true"/></button> :
            <button className={styles.ghost} onClick={() => changeShelf('sample')}>Explore sample shelf<CaretRightIcon size={16} aria-hidden="true"/></button>}</div>
        </div>}
      </Shelf>
      <div className={styles.foot}><span><span>{displayed.length} {displayed.length === 1 ? 'volume' : 'volumes'}</span> · Stored on this device</span>
        {sample ? <button className={styles.ghost} onClick={() => changeShelf('all')}><CaretLeftIcon size={16} aria-hidden="true"/>My library</button> : books.length > 0 ? <button className={styles.ghost} onClick={() => changeShelf('sample')}>Explore sample shelf<CaretRightIcon size={16} aria-hidden="true"/></button> : <span>PDF &amp; EPUB</span>}</div>
      {results.length > 0 && <aside className={styles.results} aria-live="polite"><div><strong>{busy ? 'Importing books' : 'Import results'}</strong>
        {!busy && <button className={styles.icon} onClick={() => setResults([])} aria-label="Dismiss import results"><XIcon size={18} aria-hidden="true"/></button>}</div>
        {results.map((r,i) => <p key={i} className={r.failed ? styles.error : ''}>{r.name} · {r.message}
          {r.suggestion && <> · <button className={styles.inlineLink} onClick={() => void applySuggestion(i)}>Rename to “{r.suggestion}”</button></>}</p>)}</aside>}
      {note && !tools && <p role="status" className={styles.note}>{note}</p>}
      {dragOver && <div className={styles.drop}>Drop books to import</div>}
    </main>
    <input ref={fileInput} type="file" hidden multiple accept=".epub,.pdf" onChange={e => {
      const files = [...(e.target.files ?? [])]; e.target.value = ''; void importFiles(attach.current ? files.slice(0,1) : files,attach.current); attach.current = undefined
    }}/>
    <input ref={restoreInput} type="file" hidden accept=".zip" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }}/>
    <dialog ref={dialog} onClose={() => setTools(false)} className={styles.dialog}>
      <header><h2>Library tools</h2><button className={styles.icon} aria-label="Close library tools" onClick={() => setTools(false)}><XIcon size={20} aria-hidden="true"/></button></header>
      <h3>Library backup</h3><p>Save a copy of your books, shelves, reading positions, and bookmarks.</p>
      <div className={styles.actions}><button className={styles.secondary} onClick={exportFiles}>Export backup</button><button className={styles.secondary} onClick={() => restoreInput.current?.click()}>Restore backup</button></div>
      <h3>Appearance</h3><label className={styles.sort}><span>Theme</span><select aria-label="Theme" value={theme} onChange={e => { setTheme(e.target.value as Theme) }}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select><CaretDownIcon size={14} aria-hidden="true"/></label>
      <h3>Device storage</h3><p>{persisted ? 'Persistent storage is enabled.' : 'Your browser manages storage on this device.'}</p>
      {!persisted && <button className={styles.secondary} onClick={() => persist().then(ok => setNote(ok ? 'Storage protected.' : 'Your browser manages this permission. Keep a backup.')).catch(e => setNote(errorMessage(e)))}>Request persistent storage</button>}
      <h3>Install ShelfScape</h3><p>On iPhone, open Safari’s Share menu and choose Add to Home Screen. On Android or desktop, choose Install app from the browser menu.</p>
      <a href={import.meta.env.BASE_URL + 'samples/CREDITS.txt'} target="_blank" rel="noreferrer">Sample book credits</a>
      <p role="status">{note}</p>
    </dialog>
    <dialog ref={manageDialog} onClose={() => { setManaging(false); setConfirmDelete(false); setPickQuery('') }} className={styles.dialog} aria-label={active ? 'Edit ' + active.name : 'Edit shelf'}>
      {active && <>
        <header><h2>{active.name}</h2><button className={styles.icon} aria-label="Close shelf editor" onClick={() => setManaging(false)}><XIcon size={20} aria-hidden="true"/></button></header>
        <p>Choose the books on this shelf. They stay in All books either way.</p>
        {books.length > 8 && <label className={styles.search}><MagnifyingGlassIcon size={18} aria-hidden="true"/>
          <input type="search" aria-label="Filter books" placeholder="Filter books" value={pickQuery} onChange={e => setPickQuery(e.target.value)}/></label>}
        <ul className={styles.picks}>{books.filter(b => (b.title + ' ' + b.author).toLocaleLowerCase().includes(pickTerm)).sort((a,b) => a.title.localeCompare(b.title)).map(b =>
          // Uncontrolled: the box flips at once instead of waiting for the database round trip.
          <li key={active.id + ':' + b.id}><label><input type="checkbox" defaultChecked={members.has(b.id)} onChange={e => {
            const on = e.target.checked
            withBooks(active.id,list => on ? [...new Set([...list,b.id])] : list.filter(x => x !== b.id)).catch(error => setNote(errorMessage(error)))
          }}/><span>{b.title}{b.author && <> <small>{b.author}</small></>}</span></label></li>)}</ul>
        {!books.length && <p>Import books to add them here.</p>}
        <div className={styles.actions}>
          <button className={styles.ghost} onClick={() => confirmDelete ? void deleteShelf() : setConfirmDelete(true)}><TrashIcon size={18} aria-hidden="true"/>{confirmDelete ? 'Confirm delete' : 'Delete shelf'}</button>
          <button className={styles.primary} onClick={() => setManaging(false)}>Done</button>
        </div>
      </>}
    </dialog>
    {stats && <Suspense fallback={<p>Opening stats…</p>}><StatsView books={[...books,...samples]} back={() => setStats(false)}/></Suspense>}
    {reader && <Suspense fallback={<p>Opening reader…</p>}><Reader book={reader} back={() => setReader(undefined)}/></Suspense>}
  </>
}
