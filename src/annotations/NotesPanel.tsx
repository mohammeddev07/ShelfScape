import { useEffect, useRef, useState } from 'react'
import { BookmarkSimpleIcon, ExportIcon, NotePencilIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import { db, errorMessage, type Annotation, type Book, type Bookmark, type HighlightColor } from '../db'
import { COLORS, COLOR_ORDER, sortAnnotations, toMarkdown } from './core'
import styles from '../App.module.css'

const Swatch = ({ color }: { color: HighlightColor }) => <i className={styles.swatch} style={{ background:COLORS[color].fill }}/>

// Saves 400 ms after typing stops, on blur, and on unmount so closing the panel never drops a note.
function Note({ a,fail }: { a: Annotation; fail: (e: unknown) => void }) {
  const [note,setNote] = useState(a.note), latest = useRef(a.note), saved = useRef(a.note), timer = useRef(0)
  const save = () => {
    window.clearTimeout(timer.current)
    if (latest.current === saved.current) return
    saved.current = latest.current
    db.annotations.update(a.id!,{ note:latest.current,updated:Date.now() }).catch(fail)
  }
  // save reads only refs and stable values, so the first render's copy is current at unmount.
  useEffect(() => save,[]) // eslint-disable-line react-hooks/exhaustive-deps
  return <textarea aria-label="Note" autoFocus rows={3} value={note} onBlur={save} onChange={e => {
    setNote(latest.current = e.target.value); window.clearTimeout(timer.current); timer.current = window.setTimeout(save,400)
  }}/>
}

type View = 'highlights' | 'bookmarks'
export default function NotesPanel({ book,list,marks,view,onView,editing,onJump,onJumpMark,onClose }: { book: Book; list: Annotation[]; marks: Bookmark[]
  view: View; onView: (v: View) => void; editing?: number; onJump: (a: Annotation) => void; onJumpMark: (m: Bookmark) => void; onClose: () => void }) {
  const [shown,setShown] = useState<HighlightColor[]>([]), [open,setOpen] = useState(editing), [error,setError] = useState('')
  const [seen,setSeen] = useState(editing), panel = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null)
  if (seen !== editing) { setSeen(editing); setOpen(editing) }   // a mark clicked on the page opens its item
  const fail = (e: unknown) => setError(errorMessage(e))
  const share = async () => {
    // oxlint-disable-next-line no-control-regex -- control chars are illegal in file names
    const file = new File([toMarkdown(book,list,Date.now(),marks)],`${book.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').slice(0,120)} – highlights.md`,{ type:'text/markdown' })
    if (navigator.canShare?.({ files:[file] })) {
      try { await navigator.share({ files:[file],title:book.title }) } catch (e) { if ((e as Error).name !== 'AbortError') fail(e) }
      return
    }
    const url = URL.createObjectURL(file), a = document.createElement('a')
    a.href = url; a.download = file.name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url),60000)
  }
  const items = sortAnnotations(list).filter(a => !shown.length || shown.includes(a.color))
  // The panel stays open: focus moves to the next item, or the heading when there is none.
  const remove = async (a: Annotation) => {
    const next = items[items.indexOf(a) + 1]
    try { await db.annotations.delete(a.id!) } catch (e) { fail(e); return }
    setError('')
    ;(next ? panel.current?.querySelector<HTMLElement>(`[data-id="${next.id}"] button`) : heading.current)?.focus()
  }
  const saved = sortAnnotations(marks)
  const unmark = async (m: Bookmark) => {
    const next = saved[saved.indexOf(m) + 1]
    try { await db.marks.delete(m.id!) } catch (e) { fail(e); return }
    setError('')
    ;(next ? panel.current?.querySelector<HTMLElement>(`[data-mark="${next.id}"] button`) : heading.current)?.focus()
  }
  return <aside ref={panel} className={styles.notes} aria-label="Notes & highlights">
    <header><h2 ref={heading} tabIndex={-1}>Notes & highlights</h2>
      <button className={styles.icon} aria-label="Close notes" autoFocus={editing === undefined} onClick={onClose}><XIcon size={18} aria-hidden="true"/></button></header>
    <div className={styles.views} role="group" aria-label="Show">
      <button aria-pressed={view === 'highlights'} onClick={() => onView('highlights')}>Highlights <span>{list.length}</span></button>
      <button aria-pressed={view === 'bookmarks'} onClick={() => onView('bookmarks')}>Bookmarks <span>{marks.length}</span></button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {view === 'bookmarks' ? saved.length ? <ol>{saved.map(m => <li key={m.id} data-mark={m.id}>
      <span className={styles.noteMeta}><BookmarkSimpleIcon size={13} weight="fill" className={styles.markIcon} aria-hidden="true"/>{m.where}
        {m.created > 0 && <> · {new Date(m.created).toLocaleDateString(undefined,{ month:'short',day:'numeric' })}</>}</span>
      <button className={styles.quote} onClick={() => onJumpMark(m)}>{m.excerpt || 'Go to ' + m.where}</button>
      <button className={styles.ghost} aria-label={'Delete bookmark, ' + m.where} onClick={() => unmark(m)}><TrashIcon size={16} aria-hidden="true"/></button>
    </li>)}</ol> : <p className={styles.noteEmpty}>Tap the bookmark button at the top to mark a page, or select text and choose Bookmark this passage.</p> : <>
    <div className={styles.filters} role="group" aria-label="Show colors">{COLOR_ORDER.map(c =>
      <button key={c} aria-pressed={shown.includes(c)} onClick={() => setShown(shown.includes(c) ? shown.filter(s => s !== c) : [...shown,c])}>
        <Swatch color={c}/>{COLORS[c].label}</button>)}</div>
    {list.length ? <ol>{items.map(a => <li key={a.id} data-id={a.id}>
      <span className={styles.noteMeta}><Swatch color={a.color}/>{COLORS[a.color].label} · {a.where}</span>
      <button className={styles.quote} onClick={() => onJump(a)}>{a.location.text}</button>
      {open === a.id ? <div className={styles.noteEdit}>
        <div role="group" aria-label="Color">{COLOR_ORDER.map(c => <button key={c} aria-label={'Change to ' + COLORS[c].label} aria-pressed={a.color === c}
          onClick={() => db.annotations.update(a.id!,{ color:c,updated:Date.now() }).catch(fail)}><Swatch color={c}/></button>)}</div>
        <Note a={a} fail={fail}/>
        <button className={styles.ghost} onClick={() => remove(a)}><TrashIcon size={16} aria-hidden="true"/>Delete highlight</button>
      </div> : a.note && <p>{a.note}</p>}
      <button className={open === a.id ? styles.secondary : styles.ghost} aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? undefined : a.id)}>
        {open === a.id ? 'Done' : <><NotePencilIcon size={16} aria-hidden="true"/>Edit</>}</button>
    </li>)}</ol> : <p className={styles.noteEmpty}>Select text and choose a color to highlight it.</p>}</>}
    <button className={`${styles.secondary} ${styles.export}`} disabled={!list.length && !marks.length} onClick={() => share().catch(fail)}><ExportIcon size={16} aria-hidden="true"/>Export</button>
  </aside>
}
