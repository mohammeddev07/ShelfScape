import type { Session, Progress } from '../db'

export const IDLE_MS = 120_000
export const MIN_SESSION_MS = 10_000
export const FINISHED_AT = 0.985
export const MAX_WPM = 1500
export const CHART_DAYS = 14
export const STREAK_MIN_MS = 60_000

/** Active reading time: gaps longer than IDLE_MS are capped, paused gaps are not credited. */
export class ReadingClock {
  #last: number
  #running = true
  #active = 0
  constructor(now: number) { this.#last = now }
  get active() { return this.#active }
  #credit(now: number) {
    if (this.#running) this.#active += Math.max(0, Math.min(now - this.#last, IDLE_MS))
    this.#last = now
  }
  touch(now: number) { this.#credit(now); this.#running = true }
  pause(now: number) { this.#credit(now); this.#running = false }
}

/** Forward progress only: backwards moves and jumps add nothing. */
export class ProgressTrail {
  #from: number
  #to: number
  #advanced = 0
  constructor(start: number) { this.#from = this.#to = start }
  get from() { return this.#from }
  get to() { return this.#to }
  get advanced() { return this.#advanced }
  move(to: number) { this.#advanced += Math.max(0, to - this.#to); this.#to = to }
  jump(to: number) { this.#to = to }
}

/**
 * One visit as one row per local day: a save on a new day starts a row at midnight that carries
 * everything since the previous save, so time after midnight counts for the new day.
 */
export class DaySegments {
  #start: number
  #base: { active: number; advanced: number; from?: number } = { active: 0, advanced: 0 }
  #last = this.#base
  constructor(opened: number) { this.#start = opened }
  next(now: number, active: number, trail: ProgressTrail) {
    const fresh = dayKey(new Date(now)) !== dayKey(new Date(this.#start))
    if (fresh) { this.#start = new Date(now).setHours(0, 0, 0, 0); this.#base = this.#last }
    this.#last = { active, advanced: trail.advanced, from: trail.to }
    return { fresh, row: { start: this.#start, end: now, active: active - this.#base.active,
      from: this.#base.from ?? trail.from, to: trail.to, advanced: trail.advanced - this.#base.advanced } }
  }
}

// ponytail: whitespace words; CJK undercounts, use Intl.Segmenter if needed
export const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000), h = Math.floor(min / 60), m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

export interface BookSummary { id: number; ms: number; fraction: number; wpm: number | null; finished: boolean; last: number }
export interface Summary {
  totalMs: number; weekMs: number; dailyMs: { day: string; ms: number }[]
  wpm: number | null; streakDays: number; started: number; finished: number
  completionRate: number | null; books: BookSummary[]
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** wpm over the sessions that have words, forward progress and a plausible speed; null if none qualify. */
function speed(list: Session[], words: (book: number) => number): number | null {
  let read = 0, minutes = 0
  for (const s of list) {
    const w = words(s.book) * s.advanced, m = s.active / 60_000
    if (words(s.book) > 0 && s.advanced > 0 && m > 0 && w / m <= MAX_WPM) { read += w; minutes += m }
  }
  return minutes > 0 ? Math.round(read / minutes) : null
}

export function summarize(sessions: Session[], progress: Progress[], now: number): Summary {
  const info = new Map(progress.map(p => [p.id, p]))
  const words = (book: number) => info.get(book)?.words ?? 0
  const perDay = new Map<string, number>()
  const perBook = new Map<number, Session[]>()
  let totalMs = 0
  for (const s of sessions) {
    totalMs += s.active
    const k = dayKey(new Date(s.start))
    perDay.set(k, (perDay.get(k) ?? 0) + s.active)
    const list = perBook.get(s.book)
    if (list) list.push(s); else perBook.set(s.book, [s])
  }

  const t = new Date(now)
  const dayAgo = (n: number) => dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n))
  const dailyMs = Array.from({ length: CHART_DAYS }, (_, i) => {
    const day = dayAgo(CHART_DAYS - 1 - i)
    return { day, ms: perDay.get(day) ?? 0 }
  })
  const weekMs = dailyMs.slice(-7).reduce((a, d) => a + d.ms, 0)

  const reads = (n: number) => (perDay.get(dayAgo(n)) ?? 0) >= STREAK_MIN_MS
  let streakDays = 0
  for (let n = reads(0) ? 0 : 1; reads(n); n++) streakDays++

  const books: BookSummary[] = [...perBook].map(([id, list]) => ({
    id, ms: list.reduce((a, s) => a + s.active, 0), fraction: info.get(id)?.fraction ?? 0,
    wpm: speed(list, words), finished: !!info.get(id)?.finished, last: Math.max(...list.map(s => s.end)),
  })).sort((a, b) => b.last - a.last)

  const started = books.length, finished = books.filter(b => b.finished).length
  return {
    totalMs, weekMs, dailyMs, wpm: speed(sessions, words), streakDays, started, finished,
    completionRate: started ? finished / started : null, books,
  }
}
