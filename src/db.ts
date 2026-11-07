import Dexie, { type EntityTable } from 'dexie'

export interface Book {
  id: number
  title: string
  color: string
}

export const db = new Dexie('shelfscape') as Dexie & {
  books: EntityTable<Book, 'id'>
}

db.version(1).stores({ books: '++id, title' })

// Seed a few sample books on first run.
export async function seedBooks() {
  if ((await db.books.count()) > 0) return
  await db.books.bulkAdd([
    { title: 'Dune', color: '#c2703d' },
    { title: 'Neuromancer', color: '#3d7ac2' },
    { title: 'Hyperion', color: '#6aa84f' },
    { title: 'Foundation', color: '#a64d79' },
  ] as Book[])
}
