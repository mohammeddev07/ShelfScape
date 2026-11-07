import JSZip from 'jszip'
import { db, type Annotation, type Book, type Location, type Mark, type Progress, type Session } from '../db'
import { COLOR_ORDER } from '../annotations/core'
import { digest } from './import'

interface Manifest { version: 1 | 2; books: Book[]; positions: Mark[]; bookmarks: Mark[]; sessions: Session[]; progress: Progress[]; annotations: Annotation[] }
export async function exportBackup() {
  const zip = new JSZip()
  const snapshot = await db.transaction('r', db.tables, async () => ({
    manifest: { version: 2, books: await db.books.toArray(), positions: await db.positions.toArray(), bookmarks: await db.bookmarks.toArray(),
      sessions: await db.sessions.toArray(), progress: await db.progress.toArray(), annotations: await db.annotations.toArray() },
    files: await db.files.toArray(), art: await db.art.toArray(),
  }))
  zip.file('library.json', JSON.stringify(snapshot.manifest))
  for (const key of ['files', 'art'] as const)
    for (const { id, blob } of snapshot[key]) zip.file(key + '/' + id, await blob.arrayBuffer())
  return zip.generateAsync({ type: 'blob' })
}
function validLocation(loc: Location) {
  return loc && (loc.format === 'pdf' ? Number.isInteger(loc.page) && loc.page > 0 && loc.fraction >= 0 && loc.fraction <= 1 &&
    (loc.offset === undefined || Number.isInteger(loc.offset) && loc.offset >= 0) :
    loc.format === 'epub' && typeof loc.cfi === 'string' && loc.cfi.startsWith('epubcfi('))
}
const num = (v: unknown, lo = -Infinity, hi = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const earliest = (...times: (number | undefined)[]) => Math.min(...times.filter(Boolean) as number[])
export async function restoreBackup(file: File) {
  const zip = await JSZip.loadAsync(file)
  const manifest: Manifest = JSON.parse(await zip.file('library.json')?.async('string') || 'null')
  if (manifest?.version === 1) Object.assign(manifest, { sessions: [], progress: [], annotations: [] })
  if (!manifest || ![1, 2].includes(manifest.version) || ![manifest.books, manifest.positions, manifest.bookmarks, manifest.sessions, manifest.progress, manifest.annotations].every(Array.isArray))
    throw new Error('Choose a ShelfScape backup.')
  const ids = new Set<number>()
  const entries = await Promise.all(manifest.books.map(async book => {
    if (!Number.isSafeInteger(book.id) || book.id < 1 || ids.has(book.id) || typeof book.title !== 'string' ||
      typeof book.author !== 'string' || !/^#[0-9a-f]{6}$/i.test(book.color) || book.sample ||
      (book.format && !['pdf','epub'].includes(book.format))) throw new Error('Invalid book record in backup.')
    ids.add(book.id)
    const bytes = await zip.file('files/' + book.id)?.async('arraybuffer')
    if (book.format && (!bytes || await digest(bytes) !== book.hash)) throw new Error('A book in this backup is incomplete.')
    const art = await zip.file('art/' + book.id)?.async('blob')
    return { book, file: bytes && new Blob([bytes]), art }
  }))
  for (const mark of [...manifest.positions, ...manifest.bookmarks])
    if (!Number.isSafeInteger(mark.id) || (mark.id >= 0 && !ids.has(mark.id)) || !validLocation(mark.location))
      throw new Error('Invalid reading location in backup.')
  const known = (id: number) => Number.isSafeInteger(id) && (id < 0 || ids.has(id))
  const rows = <T extends object>(list: T[], valid: (r: T) => boolean) => {
    if (!list.every(r => r && typeof r === 'object' && valid(r))) throw new Error('Invalid reading data in backup.')
  }
  rows(manifest.sessions, (r: Session) => known(r.book) && num(r.start) && num(r.end) && r.start <= r.end && num(r.active, 0) &&
    num(r.from, 0, 1) && num(r.to, 0, 1) && num(r.advanced, 0))
  rows(manifest.progress, (r: Progress) => known(r.id) && num(r.fraction, 0, 1) && num(r.updated) &&
    (r.words === undefined || num(r.words, 0)) && (r.locations === undefined || typeof r.locations === 'string') &&
    (r.finished === undefined || num(r.finished)))
  rows(manifest.annotations, (r: Annotation) => known(r.book) && COLOR_ORDER.includes(r.color) && typeof r.note === 'string' &&
    typeof r.where === 'string' && validLocation(r.location) && typeof r.location.text === 'string' && !!r.location.text &&
    num(r.order, 0, 1) && num(r.created) && num(r.updated))
  await db.transaction('rw', db.tables, async () => {
    const map = new Map<number, number>()
    for (const { book, file, art } of entries) {
      const { id: oldId, ...meta } = book
      const existing = meta.hash ? await db.books.where({ hash: meta.hash }).first() : await db.books.where({ title: meta.title }).filter(b => !b.format).first()
      const id = existing?.id ?? await db.books.add(meta as Book)
      map.set(oldId, id)
      if (file) await db.files.put({ id, blob: file })
      if (art) await db.art.put({ id, blob: art })
    }
    for (const key of ['positions','bookmarks'] as const)
      for (const mark of manifest[key]) await db[key].put({ ...mark, id: map.get(mark.id) ?? mark.id })
    const remap = (id: number) => map.get(id) ?? id
    for (const incoming of manifest.sessions) {
      const row: Session = { ...incoming, book: remap(incoming.book) }; delete row.id
      if (!await db.sessions.where('[book+start]').equals([row.book, row.start]).count()) await db.sessions.add(row)
    }
    for (const incoming of manifest.annotations) {
      const row: Annotation = { ...incoming, book: remap(incoming.book) }; delete row.id
      if (!await db.annotations.where('[book+created]').equals([row.book, row.created]).count()) await db.annotations.add(row)
    }
    for (const incoming of manifest.progress) {
      const row: Progress = { ...incoming, id: remap(incoming.id) }
      const existing = await db.progress.get(row.id)
      const finished = row.finished || existing?.finished ? earliest(row.finished, existing?.finished) : undefined
      if (!existing || row.updated > existing.updated) await db.progress.put({ ...row, finished })
      else if (finished !== existing.finished) await db.progress.update(row.id, { finished })
    }
  })
}
