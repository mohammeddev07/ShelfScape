import Dexie, { type Table } from 'dexie'

export type Format = 'pdf' | 'epub'
export interface Book {
  id: number
  title: string
  author: string
  color: string
  format?: Format
  filename?: string
  hash?: string
  added: number
  sample?: string
}
export type Location = { format: 'pdf'; page: number; fraction: number; text?: string } |
  { format: 'epub'; cfi: string; text?: string }
export interface Mark { id: number; location: Location }
export interface Asset { id: number; blob: Blob }

const seeds = new Map([['Dune', '#c2703d'], ['Neuromancer', '#3d7ac2'], ['Hyperion', '#6aa84f'], ['Foundation', '#a64d79']])
class Library extends Dexie {
  books!: Table<Book, number>
  files!: Table<Asset, number>
  art!: Table<Asset, number>
  positions!: Table<Mark, number>
  bookmarks!: Table<Mark, number>
  constructor() {
    super('shelfscape')
    this.version(1).stores({ books: '++id, title' })
    this.version(2).stores({
      books: '++id,title,author,&hash,added', files: 'id', art: 'id', positions: 'id', bookmarks: 'id',
    }).upgrade(async tx => {
      const books = tx.table<Book>('books')
      for (const book of await books.toArray()) {
        if (seeds.get(book.title) === book.color) await books.delete(book.id)
        else await books.update(book.id, { author: '', added: 0 })
      }
    })
  }
}
export const db = new Library()
export async function original(book: Book) {
  if (book.sample) {
    const response = await fetch(book.sample)
    if (!response.ok) throw new Error('This sample is unavailable. Reload online to cache it.')
    return response.blob()
  }
  const file = await db.files.get(book.id)
  if (!file) throw new Error('Attach the original file to read this book.')
  return file.blob
}
export function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === 'QuotaExceededError') return 'Device storage is full. Free space and try again.'
  return error instanceof Error ? error.message : 'The file could not be opened.'
}
