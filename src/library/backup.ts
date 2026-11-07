import JSZip from 'jszip'
import { db, type Book, type Location, type Mark } from '../db'
import { digest } from './import'

interface Manifest { version: 1; books: Book[]; positions: Mark[]; bookmarks: Mark[] }
export async function exportBackup() {
  const zip = new JSZip()
  const snapshot = await db.transaction('r', db.tables, async () => ({
    manifest: { version: 1, books: await db.books.toArray(), positions: await db.positions.toArray(), bookmarks: await db.bookmarks.toArray() },
    files: await db.files.toArray(), art: await db.art.toArray(),
  }))
  zip.file('library.json', JSON.stringify(snapshot.manifest))
  for (const key of ['files', 'art'] as const)
    for (const { id, blob } of snapshot[key]) zip.file(key + '/' + id, await blob.arrayBuffer())
  return zip.generateAsync({ type: 'blob' })
}
function validLocation(loc: Location) {
  return loc && (loc.format === 'pdf' ? Number.isInteger(loc.page) && loc.page > 0 && loc.fraction >= 0 && loc.fraction <= 1 :
    loc.format === 'epub' && typeof loc.cfi === 'string' && loc.cfi.startsWith('epubcfi('))
}
export async function restoreBackup(file: File) {
  const zip = await JSZip.loadAsync(file)
  const manifest: Manifest = JSON.parse(await zip.file('library.json')?.async('string') || 'null')
  if (!manifest || manifest.version !== 1 || ![manifest.books, manifest.positions, manifest.bookmarks].every(Array.isArray))
    throw new Error('Choose a version 1 ShelfScape backup.')
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
  })
}
