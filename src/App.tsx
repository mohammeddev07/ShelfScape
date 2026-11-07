import { useEffect, useState } from 'react'
import { db, seedBooks, type Book } from './db'
import { Shelf } from './Shelf'
import styles from './App.module.css'

export default function App() {
  const [books, setBooks] = useState<Book[]>([])

  useEffect(() => {
    seedBooks().then(() => db.books.toArray()).then(setBooks)
  }, [])

  return (
    <main className={styles.app}>
      <h1 className={styles.title}>ShelfScape</h1>
      <div className={styles.stage}>
        <Shelf books={books} />
      </div>
    </main>
  )
}
