import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReadingClock, ProgressTrail, summarize, countWords, formatDuration } from '../../src/stats/core.ts'

test('clock caps idle gaps and ignores paused time', () => {
  const c = new ReadingClock(0)
  c.touch(30_000); assert.equal(c.active, 30_000)
  c.touch(1_830_000); assert.equal(c.active, 150_000)      // 30 min away → +IDLE_MS
  c.pause(1_840_000); assert.equal(c.active, 160_000)
  c.touch(5_000_000); assert.equal(c.active, 160_000)      // paused gap not credited
  c.touch(5_060_000); assert.equal(c.active, 220_000)
})
test('trail counts forward reading but not jumps', () => {
  const t = new ProgressTrail(.10)
  t.move(.12); t.move(.11); t.move(.15); t.jump(.60); t.move(.61)
  assert.ok(Math.abs(t.advanced - .07) < 1e-9)
  assert.equal(t.from, .10); assert.equal(t.to, .61)
})
test('words and durations', () => {
  assert.equal(countWords('  The quick\nbrown  fox '), 4); assert.equal(countWords(''), 0)
  assert.equal(formatDuration(0), '0 min'); assert.equal(formatDuration(59_000), '1 min')
  assert.equal(formatDuration(3_600_000), '1 h'); assert.equal(formatDuration(7_500_000), '2 h 5 min')
})
const at = (d: number, h: number) => Date.UTC(2026, 10, d, h)
const s = (book: number, start: number, active: number, advanced: number) =>
  ({ book, start, end: start + active, active, from: 0, to: advanced, advanced })
const sessions = [
  s(1, at(7, 9), 1_800_000, .15),              // 9000 words / 30 min = 300 wpm
  s(1, at(6, 21), 1_200_000, .04),             // 2400 / 20 = 120 wpm
  s(2, at(5, 8), 600_000, .5),                 // scanned PDF, no words
  s(1, Date.UTC(2026, 9, 20, 8), 600_000, .9), // 5400 wpm skim → excluded
]
const progress = [
  { id: 1, fraction: .30, words: 60_000, updated: at(7, 10) },
  { id: 2, fraction: 1, words: 0, finished: at(5, 9), updated: at(5, 9) },
]
test('summary totals, speed, streak and completion', () => {
  const sum = summarize(sessions, progress, at(7, 12))
  assert.equal(sum.totalMs, 4_200_000); assert.equal(sum.weekMs, 3_600_000)
  assert.equal(sum.wpm, 228); assert.equal(sum.streakDays, 3)
  assert.equal(sum.started, 2); assert.equal(sum.finished, 1); assert.equal(sum.completionRate, .5)
  assert.equal(sum.dailyMs.length, 14)
  assert.deepEqual(sum.dailyMs.at(-1), { day: '2026-11-07', ms: 1_800_000 })
  assert.deepEqual(sum.dailyMs.at(-2), { day: '2026-11-06', ms: 1_200_000 })
  assert.deepEqual(sum.books.map(b => [b.id, b.ms, b.wpm, b.finished]), [[1, 3_600_000, 228, false], [2, 600_000, null, true]])
})
test('streak survives a day without reading yet; re-reading keeps completion', () => {
  assert.equal(summarize(sessions, progress, at(8, 12)).streakDays, 3)
  const reread = summarize([s(1, at(7, 9), 60_000, 0)], [{ id: 1, fraction: .05, finished: 1, updated: 2 }], at(7, 12))
  assert.equal(reread.finished, 1); assert.equal(reread.completionRate, 1); assert.equal(reread.wpm, null)
})
test('empty history', () => {
  const sum = summarize([], [], at(7, 12))
  assert.equal(sum.wpm, null); assert.equal(sum.completionRate, null); assert.equal(sum.streakDays, 0); assert.equal(sum.totalMs, 0)
})
