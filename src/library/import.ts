import { db, type Format, type Book } from '../db'
import JSZip from 'jszip'
import { cleanTitle } from './title'

export async function digest(data: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
type Metadata = { title?: string; author?: string; cover?: Blob }
function xml(source: string) {
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('The EPUB package contains unreadable XML.')
  return doc
}
async function epubMetadata(data: ArrayBuffer): Promise<Metadata> {
  const zip = await JSZip.loadAsync(data)
  const container = await zip.file('META-INF/container.xml')?.async('string')
  const path = container && xml(container).querySelector('rootfile')?.getAttribute('full-path')
  const opf = path && await zip.file(path)?.async('string')
  if (!opf || !path) throw new Error('The EPUB is missing its book package.')
  const doc = xml(opf)
  const spine = [...doc.getElementsByTagNameNS('*', 'itemref')]
  if (!spine.length) throw new Error('The EPUB contains no readable chapters.')
  const field = (name: string) => doc.getElementsByTagNameNS('*', name)[0]?.textContent?.trim()
  const items = Array.from(doc.getElementsByTagNameNS('*', 'item'))
  const packageUrl = new URL(path,'https://book.local/')
  const manifest = new Map(items.map(item => [item.id,item.getAttribute('href')]))
  for (const item of spine) {
    const href = manifest.get(item.getAttribute('idref') || '')
    const chapter = href && new URL(href,packageUrl)
    if (!chapter || chapter.origin !== packageUrl.origin || !zip.file(decodeURIComponent(chapter.pathname.slice(1))))
      throw new Error('The EPUB is missing a chapter listed in its contents.')
  }
  const coverId = doc.querySelector('meta[name="cover"]')?.getAttribute('content')
  const coverItem = items.find(i => i.getAttribute('properties')?.split(/\s+/).includes('cover-image') || i.id === coverId)
  const href = coverItem?.getAttribute('href')
  let cover: Blob | undefined
  if (href && /^image\/(png|jpeg|webp|gif)$/i.test(coverItem!.getAttribute('media-type') || '')) {
    const url = new URL(href, new URL(path, 'https://book.local/'))
    const entry = url.origin === 'https://book.local' && zip.file(decodeURIComponent(url.pathname.slice(1)))
    if (entry) cover = new Blob([await entry.async('arraybuffer')], { type: coverItem!.getAttribute('media-type')! })
  }
  return { title: field('title'), author: field('creator'), cover }
}
async function pdfMetadata(data: ArrayBuffer): Promise<Metadata> {
  const { loadPdf } = await import('../reader/pdfDocument')
  const task = loadPdf(data)
  try {
    const doc = await task.promise
    const metadata = await doc.getMetadata()
    const info = metadata.info as { Title?: string; Author?: string }
    const page = await doc.getPage(1)
    const size = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(384 / size.width,640 / size.height) })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    const cover = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84))
    return { title: info.Title, author: info.Author, cover: cover ?? undefined }
  } finally { await task.destroy() }
}
const colors = ['#394f40', '#8b523b', '#344958', '#76505a', '#79603b', '#41625a', '#715240']
/** id is the book now holding the file (also for a duplicate); suggestion is a cleaner title to offer, the original filename is kept either way. */
export interface Imported { message: string; id?: number; suggestion?: string }
export async function importFile(file: File, attachId?: number): Promise<Imported> {
  const format = file.name.split('.').pop()?.toLowerCase() as Format
  if (format !== 'pdf' && format !== 'epub') throw new Error('Choose a PDF or EPUB file.')
  const data = await file.arrayBuffer()
  const head = new TextDecoder().decode(data.slice(0, 1024))
  if (format === 'pdf' ? !head.includes('%PDF-') : !head.startsWith('PK')) throw new Error('The contents do not match the file extension.')
  const hash = await digest(data)
  const duplicate = async () => { const book = await db.books.where({ hash }).first(); return book && { message: 'Already on your shelf', id: book.id } }
  const early = await duplicate()
  if (early) return early
  const metadata = await (format === 'pdf' ? pdfMetadata(data) : epubMetadata(data))
  const title = metadata.title?.trim() || file.name.replace(/\.[^.]+$/, '')
  const record = { title, author: metadata.author?.trim() || '', color: colors[parseInt(hash.slice(0, 2), 16) % colors.length],
    format, filename: file.name, added: Date.now(), hash }
  return db.transaction('rw', db.books, db.files, db.art, async () => {
    const late = await duplicate()
    if (late) return late
    const legacy = attachId && await db.books.get(attachId)
    if (attachId && (!legacy || legacy.format)) throw new Error('This shelf entry already has a file.')
    const id = attachId || await db.books.add(record as Book)
    if (attachId) await db.books.update(id, record)
    await db.files.put({ id, blob: file })
    if (metadata.cover) await db.art.put({ id, blob: metadata.cover })
    return { message: metadata.title && metadata.author ? 'Imported' : 'Imported with available metadata', id, suggestion: cleanTitle(title) }
  })
}
