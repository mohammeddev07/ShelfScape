import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type Book, type Session, type Progress } from '../db'
import { formatDuration, summarize } from './core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import styles from '../App.module.css'

const useLive = <T,>(query: () => Promise<T[]>) => {
  const [rows, setRows] = useState<T[]>([])
  useEffect(() => { const sub = liveQuery(query).subscribe({ next: setRows, error: () => {} }); return () => sub.unsubscribe() }, [query])
  return rows
}
const loadSessions = () => db.sessions.toArray(), loadProgress = () => db.progress.toArray()
const short = (day: string) => new Date(day + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function StatsView({ books, back }: { books: Book[]; back: () => void }) {
  const sessions: Session[] = useLive(loadSessions), progress: Progress[] = useLive(loadProgress)
  const [now] = useState(Date.now), s = useMemo(() => summarize(sessions, progress, now), [sessions, progress, now])
  const titles = useMemo(() => new Map(books.map(b => [b.id, b.title])), [books])
  const max = Math.max(...s.dailyMs.map(d => d.ms), 1)
  const figures: [string, string][] = [
    ['This week', formatDuration(s.weekMs)], ['Reading speed', s.wpm === null ? '—' : `${s.wpm} wpm`],
    ['Streak', `${s.streakDays} ${s.streakDays === 1 ? 'day' : 'days'}`], ['Completed', s.started ? `${s.finished} of ${s.started} ${s.started === 1 ? 'book' : 'books'}` : '—'],
  ]
  return <section className={styles.stats}>
    <header className={styles.statsHeader}><button className={styles.ghost} autoFocus onClick={back}><CaretLeftIcon size={18} aria-hidden="true"/>Library</button></header>
    <h1>Reading stats</h1>
    <dl className={styles.figures}>{figures.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <h2>Last 14 days</h2>
    <div className={styles.chart} role="img" aria-label={`Reading time per day over the last 14 days, ${formatDuration(s.dailyMs.reduce((a, d) => a + d.ms, 0))} in total`}>
      <span className={styles.chartMax} aria-hidden="true">{formatDuration(max)}</span>
      <div className={styles.bars}>{s.dailyMs.map(d =>
        <i key={d.day} data-tip={`${short(d.day)} · ${formatDuration(d.ms)}`} aria-label={`${d.day}: ${formatDuration(d.ms)}`}>
          <b style={{ height: d.ms ? `${Math.max(d.ms / max * 100, 3)}%` : 0 }}/></i>)}</div>
      <div className={styles.chartDays} aria-hidden="true"><span>{short(s.dailyMs[0].day)}</span><span>Today</span></div>
    </div>
    <ul className={styles.srOnly} aria-label="Reading time per day">{s.dailyMs.map(d => <li key={d.day}>{short(d.day)} · {formatDuration(d.ms)}</li>)}</ul>
    <h2>Books</h2>
    {!s.books.length ? <p className={styles.statsEmpty}>Open a book to start tracking your reading.</p> :
      <ul className={styles.statBooks}>{s.books.map(b => <li key={b.id}>
        <strong>{titles.get(b.id) ?? 'Removed book'}</strong>
        <progress value={b.fraction} max={1} aria-label="Progress"/><span>{Math.round(b.fraction * 100)}%</span>
        <small>{formatDuration(b.ms)} · {b.wpm === null ? '—' : `${b.wpm} wpm`}{b.finished && <em> · Finished</em>}</small></li>)}</ul>}
  </section>
}
