# ShelfScape: Shelf Polish, Reading Statistics, Annotations, and Night Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve shelf browsing: hover shows a book's title, a click pulls the book out, switching books returns the previous one to the shelf, browsing is faster, and generated covers look better. Add on-device reading statistics, color-coded highlights with notes and export, bookmark highlighting, completion percentages, and night mode.

**Architecture:** Pure, dependency-free modules (`src/stats/core.ts`, `src/annotations/core.ts`, `src/shelf/design.ts`) own the calculations and formats. Node's built-in test runner exercises them directly. The reader adapters (`pdf.ts`, `epub.ts`) gain progress, measurement, selection, and painting capabilities behind the existing `ReaderAdapter` interface. `Reader.tsx` records sessions and manages annotations. New Dexie tables hold sessions, progress, and annotations. The stats view loads lazily. Night mode uses CSS custom properties toggled by `data-theme`.

**Tech Stack:** React 19, TypeScript (`erasableSyntaxOnly`), React Three Fiber, React Spring, Dexie 4, pdf.js, epub.js (built-in annotations API), `node:test` (Node 24 strips types natively), Playwright browser suite.

**Spec:** These are the user's requests, verbatim:
1. “Track your reading progress and understand your habits with detailed statistics. Monitor your reading speed, time spent, and completion rates to improve your reading habits.”
2. “Easily mark important points and review key insights. Create color-coded highlights, add detailed notes, and export your annotations for reference or sharing. Highlight the bookmarked text. Add Night mode. Add the percent of book completed. Hovering over a book should give us a name of the book and not pull out the book. When we click on the book then it should come up for the 3D view. Increase the scroll speed a little. Create good covers. When we click on another book while one book is already in the 3D mode, it should go back to the bookshelf like we are keeping it in the bookshelf animation and the other book should get pulled out of the shelf into the 3D mode.”

Product constraints come from the original brief summarized in `README.md`: local-first operation, preservation of the approved shelf design without dashboards, accessibility, offline support, and mobile performance.

**Execution order:** Phase A (Tasks 1–2), then B (3–6), C (7–9), and D (10), followed by Task 11. Each phase can ship by itself.

## Global Constraints

- Node 24 (`.nvmrc`). Do not add runtime or development dependencies. That excludes chart, color, and test libraries.
- Statistics, progress, and annotations remain in IndexedDB on the device. Do not make network requests or use analytics. Annotations leave the device only through explicit **Export** or **Share** actions, or through a backup.
- The theme preference is the only value stored in `localStorage`, under the key `shelfscape-theme`. Wrap every read and write in `try/catch`.
- Do not add a dashboard to the shelf view. The new shelf UI consists of the hover or keyboard label, a single **Reading stats** button in the masthead before **Library tools**, and one progress line in the inspection preview.
- **Hovering or keyboard browsing never moves a book.** A book leaves the shelf only through a click or tap on it, or through **Enter** or a click on the rail's **Inspect** button.
- Load the stats view lazily with `lazy(() => import(...))`, as `Reader` is loaded.
- Pure modules (`src/stats/core.ts`, `src/annotations/core.ts`, `src/shelf/design.ts`) have **no runtime imports**. Only `import type` is allowed.
- Constants and their exact values:
  - Stats (`stats/core.ts`): `IDLE_MS = 120_000`, `MIN_SESSION_MS = 10_000`, `FINISHED_AT = 0.985`, `MAX_WPM = 1500`, `CHART_DAYS = 14`, `STREAK_MIN_MS = 60_000`
  - Shelf (`shelf/layout.ts`): `AUTO_SPEED = 0.12`, up from `0.09`, in shelf units per second; `SWAP_DELAY_MS = 420`, or `0` with reduced motion
- Highlight colors (`annotations/core.ts`), in this order: `yellow` labeled **Important** (`#f2c94c`), `green` labeled **Idea** (`#8fbf7a`), `blue` labeled **Question** (`#7fa7d9`), and `pink` labeled **Quote** (`#e39ab0`). Paint highlights at an opacity of `0.4` with `mix-blend-mode: multiply` in light mode and `screen` in dark mode. Show a bookmark as a 2px underline in `var(--rust)`.
- Day buckets use `new Date(ms).toLocaleDateString('en-CA')`, which produces `YYYY-MM-DD`. A session belongs to the day on which it started.
- Display every duration with `formatDuration`. Show **—** for unknown values, never `NaN` or `0 wpm`. Percentages are `Math.round(fraction * 100) + '%'`.
- Accessibility:
  - Every new control is reachable by keyboard.
  - The highlight toolbar has `role="toolbar"`, and each color button has an `aria-label` such as “Highlight yellow, Important”.
  - The hover label has `role="tooltip"`.
  - Each chart has a text alternative.
  - Text in both themes meets a contrast ratio of at least 4.5:1.
  - Reduced motion disables the book-swap delay and the bar animation.
- Before writing chart code in Task 6, load the `dataviz` skill.

## Review Focus

1. **Rapid clicks on several spines while a swap is in progress.** Only the last book clicked ends up out of the shelf, and every other book returns to its slot. Task 1 has a browser check for this.
2. **The reader is left open while the person walks away or the laptop sleeps.** Each gap counts for at most `IDLE_MS`, and hidden time counts as zero. Task 3 has a clock test, and Task 5 checks a hidden tab.
3. **Jumping through Contents, Go to page, a bookmark, or a font-size change.** The jump does not count as reading, so speed is not inflated. Tasks 3 and 5 cover this.
4. **The same phrase appears twice on a PDF page, or the page re-renders at another zoom level.** The highlight stays on the occurrence the person selected. Task 7's `findQuote` test and Task 8's zoom check cover this.
5. **The same backup is restored twice, or an older v1 backup is restored.** Sessions and annotations are not duplicated, and v1 backups still restore. Task 11 covers this.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/Shelf.tsx`, `src/shelf/Scene.tsx`, `src/shelf/layout.ts` | Click-to-select, hover label, swap sequencing, eased return, and auto speed |
| `src/shelf/design.ts` (new) | Pure cover design: family and palette choice, plus WCAG `contrast` |
| `src/shelf/bindings.ts` | Canvas painters for the five cover families |
| `src/stats/core.ts` (new) | `ReadingClock`, `ProgressTrail`, `summarize`, `countWords`, and `formatDuration` |
| `src/stats/StatsView.tsx` (new) | Stats screen |
| `src/annotations/core.ts` (new) | `COLORS`, `findQuote`, `sortAnnotations`, and `toMarkdown` |
| `src/annotations/Toolbar.tsx`, `src/annotations/NotesPanel.tsx` (new) | Selection toolbar, edit popover, and the panel listing notes and highlights |
| `src/db.ts` | Types, plus Dexie `version(3)` (sessions and progress) and `version(4)` (annotations) |
| `src/reader/adapter.ts`, `pdf.ts`, `epub.ts`, `pdf.css`, `Reader.tsx` | Progress, measurement, selection, painting, sessions, and theme |
| `src/theme.ts` (new) | `getTheme`, `setTheme`, and `applyTheme` |
| `src/index.css`, `src/App.module.css`, `src/App.tsx` | Dark tokens, view switching, and entry points |
| `src/library/backup.ts` | Manifest v2 containing sessions, progress, and annotations |
| `tests/unit/*.test.ts` (new), `tests/browser.mjs` | Verification |
| `package.json`, `.github/workflows/verify.yml`, `README.md` | Scripts, CI, and documentation |

### Data shapes (`src/db.ts`)

```ts
export type Location = { format: 'pdf'; page: number; fraction: number; text?: string; offset?: number } |  // offset: new, char index of text in page text layer
  { format: 'epub'; cfi: string; text?: string }
export interface Session {
  id?: number; book: number      // Book.id (negative for samples)
  start: number; end: number      // epoch ms
  active: number                  // idle-capped ms
  from: number; to: number        // progress 0..1
  advanced: number                // forward progress excluding jumps, 0..1
}
export interface Progress {
  id: number; fraction: number    // Book.id; 0..1
  words?: number                  // 0 = no extractable text
  locations?: string              // epub.js locations.save() cache
  finished?: number               // epoch ms first finished; never cleared
  updated: number
}
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'
export interface Annotation {
  id?: number; book: number
  location: Location              // always has text; EPUB cfi is a range CFI
  color: HighlightColor
  note: string                    // '' when none
  where: string                   // human label: "Page 12" or chapter title
  order: number                   // book progress 0..1 at creation, for sorting
  created: number; updated: number
}
```

Schemas:
- `version(3)` adds `sessions: '++id, book, start, [book+start]'` and `progress: 'id'`.
- `version(4)` adds `annotations: '++id, book, created, [book+created]'`.

Add one helper to `tests/browser.mjs`, which later tasks use:

```js
async function waitForRows(page,table,test) {
  await page.waitForFunction(async ([table,test]) => {
    const db = await new Promise(r => { const q = indexedDB.open('shelfscape'); q.onsuccess = () => r(q.result) })
    if (!db.objectStoreNames.contains(table)) { db.close(); return false }
    const rows = await new Promise(r => { const g = db.transaction(table).objectStore(table).getAll(); g.onsuccess = () => r(g.result) })
    db.close(); return new Function('rows','return ' + test)(rows)
  },[table,test],{timeout:30_000})
}
```

---

# Phase A: Shelf

### Task 1: Hover label, click to pull out, swap animation, faster browsing

**Files:**
- Modify: `src/Shelf.tsx`, `src/shelf/Scene.tsx`, `src/shelf/layout.ts`, `src/App.module.css`
- Test: `tests/browser.mjs` (motion block)

**Interfaces:**
- `Hits.hover` becomes `(id: number | undefined) => void`. `Hits.leave` is removed, so `hover(undefined)` takes its place.
- `Scene` gains the prop `label: { id?: number; el: RefObject<HTMLDivElement | null> }`. In `useFrame`, it projects the labelled book's spine top to screen coordinates and writes `el.style.transform` directly, with no React state per frame.
- `layout.ts` exports `AUTO_SPEED` and `SWAP_DELAY_MS`. `Motion.advance` uses `AUTO_SPEED`.

**Behavior:**
- **Mouse hover:**
  - Hovering a spine sets the labelled ID. The label appears above the spine as a `<div role="tooltip">` containing the title and the author's name on a second line.
  - The book does not move.
  - The canvas cursor becomes `pointer`.
  - Pointer-out clears the label, and the label also hides while the shelf is being dragged.
- **Keyboard:**
  - The rail's spine button and the arrow keys move the label, not a selection. This changes `browseTo` to set the labelled ID instead of calling `pick`.
  - **Enter** or a click on the rail's **Inspect** button pulls the labelled book out.
- **Click or tap:** a pointer-up on a spine without dragging calls `pick(id)`, which pulls the book out, starts inspection, and moves focus to **Open book**. Touch behaves as it does now.
- **Swap:** when a book is out and another spine is clicked:
  1. Clear the selection so the current book returns.
  2. Start `window.setTimeout(SWAP_DELAY_MS)` to select the new book and call `motion.reset()`.
  3. A newer `pick` clears any pending timeout, so the last click wins.
- **Eased return:** in `BookModel`, when the book is inactive, ease `twist.quaternion` toward identity with `slerp(IDENTITY, 1 - 0.0005 ** dt)`. Ease a per-book `zoom` ref toward 1 in the same way. Call `invalidate()` until the angle is below `1e-3`. When reduced motion is on, snap instead. This lets a rotated book turn back as it slides home. Read `motion.inspection.zoom` only while the book is active.
- **Remove hover-preview state:** delete `hoverTimer`, the `pick(id,false)` path, and `committed`. A selected book is always committed. Wheel zoom and arrow-key rotation now apply whenever a book is `current`.
- **Pause:** auto-scroll still pauses on hover, focus, drag, selection, and reading.

- [ ] **Step 1: Rewrite the motion block in `tests/browser.mjs`** (currently lines 225–256).
  - Keep the existing auto-movement check.
  - Hover check: `mouse.move` to the `-2` spine, then wait for `getByRole('tooltip')` to contain `Alice`. Assert `Open book` has count `0`, and that the `z` value of `Book -2` stays `0` after 500 ms.
  - Click check: click the `-2` spine, then wait for `Open book`.
  - Swap check: click the `-3` spine.
    - Within 150 ms, assert that the `z` value of `Book -3` is below `0.05`, which means it has not left the shelf yet. Also assert that `Book -2` is still out, with `z` above `0.05`.
    - After 1500 ms, assert that the `z` value of `Book -2` is below `0.01`, that `Book -3` has a `z` value above `1.5`, and that the preview heading is `Pride and Prejudice`.
  - Rapid-click check: click `-4` and `-5` within 100 ms. After 1500 ms, assert that only `Book -5` has a `z` value above `0.05`.
  - Speed check: dismiss, move the mouse to `(0,0)`, then sample the `x` value of `Book -1` 1000 ms apart. Assert a decrease between `0.08` and `0.16`.
  - Keyboard check: replace `ArrowRight` + `Enter` with focus on the rail, press `ArrowRight`, assert the tooltip is visible and `Open book` has count `0`, then press `Enter` and continue with the existing rotation checks.
- [ ] **Step 2: Confirm the checks fail.** Run `npm run build`, start `npm run preview`, and run `npm run test:browser`. Expected: the motion block fails waiting for `tooltip`.
- [ ] **Step 3: Implement the behavior described above.** Style the tooltip with `.label` in `App.module.css` using `position:absolute; pointer-events:none`, paper background, ink text, 13px sans author line, and `max-width: 220px`.
- [ ] **Step 4: Confirm the full suite passes.** Expected: every `PASS` line appears, including the touch block, where a tap still selects.
- [ ] **Step 5: Commit.** Run `git commit -am "feat(shelf): hover label, click to inspect, sequenced swap, faster browse"`

### Task 2: Generated covers and spines

**Files:**
- Create: `src/shelf/design.ts`, `tests/unit/design.test.ts`
- Modify: `src/shelf/bindings.ts`, `package.json`
- Test: `tests/browser.mjs`

**Interfaces:**
- `export type Family = 'gilt' | 'deco' | 'modern' | 'botanical' | 'label'`
- `export interface Design { family: Family; foil: string; accent: string }`. `foil` is the color of title lettering and ornaments, and `accent` is the color of a secondary band or label.
- `export function design(title: string, color: string): Design` is deterministic and uses FNV-1a `seed` moved here from `bindings.ts`. `bindings.ts` re-exports `seed`.
- `export function contrast(a: string, b: string): number` returns the WCAG 2 contrast ratio of two `#rrggbb` colors.
- `binding(book, side, image?)` keeps its signature. Front and back covers render at **512×800**, and spines remain 600 pixels tall.

**Design rules:**
- Choose `foil` from the candidates `['#e8c58a', '#f3e6c4', '#2b2119', '#1f2a2e']`. Use the first one with `contrast(foil, color) >= 4.5`, or else the candidate with the highest contrast.
- Choose `family` as `FAMILIES[seed % 5]`.
- Families:
  - **Gilt:** raised bands, a double rule border, and the sprig. This is the existing design, refined.
  - **Deco:** a stepped frame and a sunburst fan above the title.
  - **Modern:** large sans-serif title, two colored blocks, and no ornament.
  - **Botanical:** a vine border and an oval cartouche containing the title.
  - **Label:** a cream paper label pasted on cloth, with ink lettering.
- Spine titles:
  - Fit the title to its box, from 34 px down to 18 px, in at most three lines.
  - If it still does not fit, set the text vertically, rotated −90° and reading bottom to top.
  - Omit the author when the field is empty. Never print “Author unknown”.
- Artwork: an embedded or sample image keeps its full-bleed front. The spine and back still use the family design.

- [ ] **Step 1: Write the failing unit tests** in `tests/unit/design.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { design, contrast, FAMILIES } from '../../src/shelf/design.ts'
const cloth = ['#394f40','#8b523b','#344958','#76505a','#79603b','#41625a','#715240','#3f5638','#9b6b38','#9b6745']
test('contrast matches WCAG', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21); assert.equal(contrast('#777777', '#777777'), 1)
})
test('lettering is legible on every cloth', () => {
  for (const c of cloth) for (let i = 0; i < 50; i++) assert.ok(contrast(design('Book ' + i, c).foil, c) >= 4.5, c)
})
test('deterministic and varied', () => {
  assert.deepEqual(design('Emma', '#42645f'), design('Emma', '#42645f'))
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => design('Book ' + i, '#394f40').family)).size, FAMILIES.length)
})
```

  Add `tests/unit/*.test.ts` to the `test:unit` script, as Task 3 does. If Task 3 has not run yet, create the script now with `"test:unit": "TZ=UTC node --test 'tests/unit/*.test.ts'"`, and add `- run: npm run test:unit` after lint in `verify.yml`.
- [ ] **Step 2: Confirm the tests fail.** Run `npm run test:unit`. Expected: FAIL because the module cannot be found.
- [ ] **Step 3: Implement `design.ts`, then the family painters in `bindings.ts`.**
- [ ] **Step 4: Add a cover gallery block to `tests/browser.mjs`.** Seed IndexedDB using the 1,000-book pattern with these titles and authors:
  - `A` by `Ann Lee`
  - `War and Peace` by `Leo Tolstoy`
  - a title of 120 characters with no author
  - `Анна Каренина` by `Лев Толстой`
  - `東京物語` by `小津安二郎`
  - `The Left Hand of Darkness` by `Ursula K. Le Guin`
  - `Notes` with no author
  - `Middlemarch` by `George Eliot`
  - `Beloved` by `Toni Morrison`
  - `The Name of the Rose` by `Umberto Eco`
  - `If on a winter's night a traveler` by `Italo Calvino`
  - `Dune` by `Frank Herbert`

  Each book uses a cloth color from the list. The block then performs these checks:
  - Reload, then save `covers-shelf.png` to `outs`.
  - Inspect three books and save `cover-<n>.png` for each.
  - Assert that the page reports no errors.
- [ ] **Step 5: Run the suite and review the screenshots.** Run `npm run test:unit` and the browser suite. Open the PNG files and confirm that no spine text is clipped and that the long title is vertical. Show the screenshots to the user before committing.
- [ ] **Step 6: Commit.** Run `git commit -am "feat(covers): five generated cover families with legible foil"`

---

# Phase B: Reading Statistics

### Task 3: Pure statistics core

**Files:**
- Create: `src/stats/core.ts`, `tests/unit/stats.test.ts`
- Modify: `src/db.ts`, adding `Session` and `Progress` types only; `package.json`, adding the `test:unit` script if Task 2 did not; and `.github/workflows/verify.yml`, if Task 2 did not

**Interfaces:**
- Produces:
  - `class ReadingClock { constructor(now: number); touch(now: number): void; pause(now: number): void; readonly active: number }`. When the clock is running, `touch` credits `min(now - last, IDLE_MS)` and starts it again if paused. `pause` credits in the same way and stops the clock, so the paused gap is never credited.
  - `class ProgressTrail { constructor(start: number); move(to: number): void; jump(to: number): void; readonly from: number; readonly to: number; readonly advanced: number }`. `move` adds `max(0, to - current)`. `jump` changes the current value without adding progress.
  - `countWords(text: string): number`, which counts `/\S+/g` matches. Mark it with `// ponytail: whitespace words; CJK undercounts, use Intl.Segmenter if needed`.
  - `formatDuration(ms: number): string`, which rounds to whole minutes.
  - `summarize(sessions: Session[], progress: Progress[], now: number): Summary`
  - `interface Summary { totalMs; weekMs; dailyMs: { day: string; ms: number }[]; wpm: number | null; streakDays; started; finished; completionRate: number | null; books: BookSummary[] }`
  - `interface BookSummary { id; ms; fraction; wpm: number | null; finished: boolean; last: number }`, sorted by `last` in descending order

**Calculation rules for `summarize`:**
- Speed: `wpm = round(Σ advanced × words ÷ Σ active minutes)`. Include only sessions where the book's `words > 0`, `advanced > 0`, and the session's own words per minute is at most `MAX_WPM`. Return `null` when no session qualifies. Apply the same rule to each book.
- Streak: count consecutive local days with at least `STREAK_MIN_MS`. Start today; if today has no qualifying time, start yesterday.
- `started` is the number of distinct books that have a session. `finished` is the number of those books whose `Progress.finished` is set. `completionRate` is `finished / started`, or `null` when `started` is 0.
- `dailyMs` contains exactly `CHART_DAYS` entries from oldest to newest, ending today. “This week” means the last seven local days, including today.

- [ ] **Step 1: Write the failing tests** in `tests/unit/stats.test.ts`:

```ts
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
```

- [ ] **Step 2: Confirm the tests fail.** Run `npm run test:unit`. Expected: FAIL because the module cannot be found.
- [ ] **Step 3: Implement `src/stats/core.ts`** using the interfaces and rules above. Add the types to `db.ts`.
- [ ] **Step 4: Confirm the tests pass.** Run `npm run test:unit && npm run lint && npm run build`. Expected: all tests pass and the build is clean.
- [ ] **Step 5: Commit.** Run `git commit -am "feat(stats): pure reading statistics core"` after `git add src/stats tests/unit`.

### Task 4: Progress and word measurement in the reader adapters

**Files:**
- Modify: `src/db.ts` for `version(3)` and the tables; `src/reader/adapter.ts`, `pdf.ts`, `epub.ts`, and `Reader.tsx`
- Test: `tests/browser.mjs`, adding the `waitForRows` helper from Data Shapes

**Interfaces:**
- `ReaderStatus` gains `progress: number` in the range 0–1 and `where: string`. `where` is “Page N” for PDFs, or the current EPUB TOC entry title, falling back to “Section N”.
- `ReaderInput` gains `locations?: string`.
- `ReaderAdapter` gains `measure: (signal: AbortSignal) => Promise<{ words: number; locations?: string }>`.

- [ ] **Step 1: Write the failing browser checks** in the block `PASS mixed import…`.
  - After the Blake PDF reaches “The Lamb” for the first time, add `await waitForRows(page,'progress','rows.some(p => p.words > 0 && p.words < 10000 && !p.locations)')`.
  - After the Secret Garden iframe has content, add `await waitForRows(page,'progress','rows.some(p => p.words > 10000 && p.locations && p.fraction > 0)')` and `await page.getByText(/\d+%/).first().waitFor()`.
- [ ] **Step 2: Confirm the checks fail.** Run the build, preview, and browser suite. Expected: a `waitForFunction` timeout.
- [ ] **Step 3: Add PDF progress and measurement.**
  - Progress: `(page - 1 + fraction) / numPages`.
  - `measure` iterates through the pages with `getTextContent()`, sums `countWords` over the item strings, calls `page.cleanup()`, and yields between pages with `await new Promise(r => setTimeout(r))`.
  - It stops when the signal aborts.
  - A scanned PDF returns `{ words: 0 }`.
- [ ] **Step 4: Add EPUB progress and measurement.**
  - Locations: when `input.locations` is present, call `book.locations.load(input.locations)` before the first display.
  - Progress: `percentageFromCfi(cfi)` once locations exist. Before then, use `(start.index + (displayed.page - 1) / displayed.total) / book.spine.length`.
  - `measure`:
    1. Call `await book.locations.generate(1000)` if locations are missing.
    2. Count words in each spine section with `section.load(book.load.bind(book))`, followed by `countWords(body.textContent)` and `section.unload()`.
    3. Return `{ words, locations: book.locations.save() }`.
    4. Report a new status.
- [ ] **Step 5: Persist progress in `Reader.tsx`.**
  - Loading: add `db.progress.get(book.id)` to the existing `Promise.all`, and pass `locations` to `open`.
  - In the debounced `flush`, run `db.progress.put({ ...existing, id, fraction, updated: Date.now(), finished: existing?.finished ?? (fraction >= FINISHED_AT || status.last ? Date.now() : undefined) })`.
  - When the adapter is ready and `words === undefined`, run `measure(controller.signal)`, then `db.progress.update(book.id, result)`. Ignore an `AbortError`.
  - In the footer, append ` · {percent}` to the status label. This is the **percent completed** in the reader.
- [ ] **Step 6: Confirm every check passes.** Expected: every `PASS` line appears, and the v1 migration check still passes.
- [ ] **Step 7: Commit.** Run `git commit -am "feat(reader): report progress and measure book length"`

### Task 5: Reading sessions

**Files:**
- Modify: `src/reader/Reader.tsx`
- Test: `tests/browser.mjs`

**Wiring:**
- Create `ReadingClock(Date.now())` when the reader opens. Create `ProgressTrail` on the first `change` call.
- `touch` runs on each `change` and on `pointerdown`, `keydown`, and `wheel` events on the reader `<main>`.
- `pause` runs when `document.hidden` becomes true.
- Jumps: set `jumping = true` immediately before `adapter.jump` or `adapter.resizeText`. In `change`, call `trail.jump(p)` and reset the flag if it is set; otherwise call `trail.move(p)`.
- Saving: in `flush`, the hidden handler, `pagehide`, and cleanup, if `clock.active >= MIN_SESSION_MS`, call `db.sessions.put({...})` with the stored `id`, so later saves update one row.

- [ ] **Step 1: Write the failing browser check** in a new block before the motion block:

```js
const timed = await context()
await timed.page.getByText('Explore sample shelf').click()
await timed.page.locator('input[type=search]').fill('Blake'); await inspect(timed.page); await open(timed.page)
await timed.page.getByText('Piping down the valleys wild,',{exact:true}).waitFor()
await timed.page.clock.install()
await timed.page.getByRole('button',{name:'Next page'}).click()
await timed.page.clock.fastForward(90_000)
await timed.page.getByRole('button',{name:'Next page'}).click()
await timed.page.evaluate(() => {                     // tab hidden mid-session
  Object.defineProperty(document,'hidden',{value:true,configurable:true})
  document.dispatchEvent(new Event('visibilitychange'))
})
await waitForRows(timed.page,'sessions','rows.length === 1')
const [row] = await idbRows(timed.page,'sessions')
assert.equal(row.book,-11); assert(row.active >= 90_000 && row.active < 100_000); assert(row.advanced > 0 && row.to > row.from)
await timed.page.evaluate(() => { Object.defineProperty(document,'hidden',{value:false,configurable:true}) })
console.log('PASS reading session timing, idle cap and save on hide')
```

  Leave `timed.ctx` open for Task 6.
- [ ] **Step 2: Confirm the check fails.** Expected: `waitForRows` times out.
- [ ] **Step 3: Implement the wiring.**
- [ ] **Step 4: Confirm every check passes.**
- [ ] **Step 5: Commit.** Run `git commit -am "feat(reader): record idle-capped reading sessions"`

### Task 6: Stats view, preview progress, and percentage in the label

**Files:**
- Create: `src/stats/StatsView.tsx`
- Modify: `src/App.tsx`, `src/Shelf.tsx`, `src/App.module.css`
- Test: `tests/browser.mjs`

**Interfaces:**
- `export default function StatsView({ books, back }: { books: Book[]; back: () => void })`. `books` combines the personal library and `samples`. Missing IDs appear as “Removed book”.

**Screen content**, from top to bottom, under a reader-style header with **‹ Library** and the heading **Reading stats**:
1. Four figures:
   - **This week**: `formatDuration(weekMs)`
   - **Reading speed**: `{wpm} wpm`, or **—** when unknown
   - **Streak**: `{n} days`
   - **Completed**: `{finished} of {started} books`, or **—** when nothing has been started
2. **Last 14 days**: a CSS bar chart. Give each bar `aria-label="{day}: {duration}"` and the chart `role="img"` with a summary label.
3. **Books**: title, `<progress value={fraction}>` with its percentage, time, speed or **—**, and **Finished** when that applies.
4. Empty state: “Open a book to start tracking your reading.”

Subscribe to `db.sessions` and `db.progress` with `liveQuery`.

**App wiring:** Add `stats` state, `lazy` import, and a **Reading stats** button before **Library tools** using the `.tools` class. Set `main` to `hidden` when `!!reader || stats`, and pass `reading={!!reader || stats}` to `Shelf`.

**Shelf:**
- Inspection preview: below the author, show `<p>` containing `{percent} read · {formatDuration(ms)}`, or `Finished · {duration}`.
- Hover and keyboard label from Task 1: add `{percent} read` as a third line.
- A book that has not been opened shows neither line.

- [ ] **Step 1: Write the failing browser check.** Continue the Task 5 block:

```js
await back(timed.page)
await timed.page.getByRole('heading',{name:'Sample shelf'}).waitFor()
await timed.page.locator('input[type=search]').fill('Blake')
await timed.page.getByRole('button',{name:/^Inspect /}).focus()
await timed.page.getByRole('tooltip').filter({hasText:/\d+% read/}).waitFor()
await timed.page.keyboard.press('Enter')
await timed.page.getByText(/% read · \d+ min/).waitFor()
await timed.page.getByRole('button',{name:'Back to shelf'}).click()
await timed.page.getByRole('button',{name:'Reading stats'}).click()
await timed.page.getByRole('heading',{name:'Reading stats'}).waitFor()
assert.match(await timed.page.locator('body').innerText(),/Songs of Innocence/)
assert.match(await timed.page.locator('body').innerText(),/Completed\s*0 of 1 books/)
await timed.page.getByRole('button',{name:'‹ Library'}).click()
await timed.ctx.close()
console.log('PASS stats view, preview and label progress')
```

- [ ] **Step 2: Confirm the check fails.** Expected: FAIL while waiting for `% read`.
- [ ] **Step 3: Implement** the view, wiring, preview and label lines, and styles. Reuse the existing tokens and use `var(--rust)` for bars.
- [ ] **Step 4: Confirm every check passes, then check the screen manually.** Run the suite and lint. Then open the stats view in Chrome at 390×844 and 1440×860. Confirm that nothing overflows horizontally and that tabbing reaches every control.
- [ ] **Step 5: Commit.** Run `git commit -am "feat(stats): reading stats view and progress on shelf"`

---

# Phase C: Highlights, Notes, and Export

### Task 7: Annotation core and storage

**Files:**
- Create: `src/annotations/core.ts`, `tests/unit/annotations.test.ts`
- Modify: `src/db.ts`. Add the `Annotation` type, the `offset` field on PDF `Location`, `version(4)`, and `annotations!: Table<Annotation, number>`.

**Interfaces:**
- `export const COLORS: Record<HighlightColor, { label: string; fill: string }>` and `export const COLOR_ORDER: HighlightColor[]`, using the values from Global Constraints.
- `export function findQuote(source: string, quote: string, offset?: number): number`:
  - If `source.startsWith(quote, offset)`, return `offset`.
  - Otherwise, return the occurrence nearest to `offset`.
  - If `offset` is not given, return the first occurrence.
  - Return `-1` when the quote is absent or empty.
- `export function sortAnnotations(list: Annotation[]): Annotation[]` sorts by `order`, then `created`, without mutating the input.
- `export function toMarkdown(book: { title: string; author: string }, list: Annotation[], exported: number): string` produces exactly this format:

```
# {title}
{author ? `_${author}_ · ` : ''}Exported {YYYY-MM-DD}

## {label}            ← one section per color in COLOR_ORDER, skipped when empty
> {quote line 1}
> {quote line 2}

{where}{note ? ` · ${note with newlines replaced by '\n  '}` : ''}
                      ← blank line between items; items in sortAnnotations order
```

- [ ] **Step 1: Write the failing tests:**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findQuote, toMarkdown, sortAnnotations } from '../../src/annotations/core.ts'
test('findQuote prefers the recorded occurrence', () => {
  const page = 'Little Lamb, who made thee? Dost thou know who made thee? Little Lamb, who made thee?'
  assert.equal(findQuote(page, 'Little Lamb', 58), 58)
  assert.equal(findQuote(page, 'Little Lamb', 50), 58)   // nearest after drift
  assert.equal(findQuote(page, 'Little Lamb'), 0)
  assert.equal(findQuote(page, 'Tyger'), -1); assert.equal(findQuote(page, ''), -1)
})
const a = (color: string, order: number, text: string, note = '', where = 'Page 2') =>
  ({ book: 1, color, note, where, order, created: order, updated: order, location: { format: 'pdf', page: 2, fraction: 0, text } }) as any
test('markdown export groups by color in fixed order and sorts by position', () => {
  const md = toMarkdown({ title: 'Songs of Innocence', author: 'William Blake' },
    [a('green', .5, 'Gave thee life'), a('yellow', .9, 'He is meek', 'Line two\nmore'), a('yellow', .2, 'Little Lamb,\nwho made thee?', 'Opening')],
    Date.UTC(2026, 10, 7))
  assert.equal(md, [
    '# Songs of Innocence', '_William Blake_ · Exported 2026-11-07', '',
    '## Important', '> Little Lamb,', '> who made thee?', '', 'Page 2 · Opening', '',
    '> He is meek', '', 'Page 2 · Line two\n  more', '',
    '## Idea', '> Gave thee life', '', 'Page 2', '',
  ].join('\n'))
  assert.equal(sortAnnotations([a('pink', .9, 'x'), a('pink', .1, 'y')])[0].order, .1)
})
```

  Format the export date with `toLocaleDateString('en-CA')`. The test runs with `TZ=UTC`.
- [ ] **Step 2: Confirm the tests fail.** Run `npm run test:unit`. Expected: FAIL because the module cannot be found.
- [ ] **Step 3: Implement `core.ts` and the `db.ts` changes.**
- [ ] **Step 4: Confirm the tests pass and the build is clean.** Run `npm run test:unit && npm run lint && npm run build`.
- [ ] **Step 5: Commit.** Run `git commit -am "feat(annotations): core formats, anchoring and storage"` after `git add src/annotations tests/unit`.

### Task 8: Highlighting in the reader, including bookmarked text

**Files:**
- Create: `src/annotations/Toolbar.tsx`
- Modify: `src/reader/adapter.ts`, `pdf.ts`, `epub.ts`, `pdf.css`, `Reader.tsx`, `src/App.module.css`
- Test: `tests/browser.mjs`

**Interfaces:**
- `ReaderAdapter` gains:
  - `paint(marks: Paint[]): void`, where `type Paint = { key: string; location: Location; style: HighlightColor | 'bookmark' }`. It renders every mark whose location falls on the current page or in the current rendition, and replaces the previous set.
  - `selectionRect(): DOMRect | undefined`, which returns the selection's bounding rectangle in viewport coordinates. For EPUB, offset it by the iframe's `getBoundingClientRect()`.
- `ReaderInput` gains `select: (active: boolean) => void`, called when a non-collapsed selection appears or clears, and `activate: (key: string) => void`, called when the person clicks a painted mark.
- PDF `location(true)` now includes `offset`, the selection start index in the page's text-layer string. Compute it with the same tree walker as `selectPassage`. Refactor that walker into `rangeFor(quote, offset)`, which uses `findQuote`.
- `Toolbar` props: `{ rect: DOMRect; touch: boolean; onColor: (c: HighlightColor) => void; onNote: () => void }`. It renders `role="toolbar" aria-label="Highlight"`, with one button per color and an **Add note** button. It sits above the selection, or below it when `touch` is true so it does not collide with the native callout.

**Rendering:**
- **PDF:**
  - Add a `.highlightLayer` sibling above `.textLayer` with `pointer-events:none`.
  - Draw one absolutely positioned `div` per `range.getClientRects()` rectangle, relative to the page wrapper. Give each the class `mark <style>`.
  - Repaint after every `draw()`, so zoom changes keep highlights aligned.
  - Clicks: listen for `click` on the page wrapper. If the point falls inside a mark's rectangle, call `activate(key)`.
  - Detect selections with `document`'s `selectionchange`, limited to `element`.
- **EPUB:**
  - Paint marks with `rendition.annotations.highlight(cfi, {key}, () => activate(key), 'mark-' + style, { fill, 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' })`.
  - Paint bookmarks with `rendition.annotations.underline(...)`.
  - Remove marks that are no longer present with `rendition.annotations.remove(cfi, type)`.
  - Detect selections with `rendition.on('selected')`, and treat a selection cleared in the contents' `selectionchange` as inactive.
- **Bookmarked text:** paint the current bookmark (`db.bookmarks.get(book.id)`) as `{ key: 'bookmark', style: 'bookmark' }` whenever its location has `text`, and repaint after **Bookmark this passage**.
- **Creating a highlight:** a color button runs `db.annotations.add({ book: book.id, location: adapter.location(true), color, note: '', where: status.where, order: status.progress, created: now, updated: now })`, clears the selection, and repaints. The menu gains **Highlight selection** (yellow) for keyboard use, captured with the existing `selectedPassage` `pointerdown` pattern.

- [ ] **Step 1: Write the failing browser checks** in the mixed import block.
  - **PDF:**
    1. After the existing “Little Lamb, who made thee?” selection, click `getByRole('button',{name:/Highlight green/})`.
    2. Wait for `waitForRows(page,'annotations','rows.some(a => a.color === "green" && /Little Lamb/.test(a.location.text) && Number.isInteger(a.location.offset))')`.
    3. Assert that `.highlightLayer .mark.green` has a count of at least 1.
    4. Click **Zoom in** and assert that the mark's `getBoundingClientRect().width` grew.
    5. After the existing bookmark, assert that `.highlightLayer .mark.bookmark` has a count of at least 1.
    6. After `back` and `open`, assert that both marks are painted again.
  - **EPUB:**
    1. After the iframe has content, select the first `p` in the iframe with `contentDocument.createRange()`, `selectNodeContents`, and `addRange`.
    2. Wait for the toolbar, then click **Highlight blue**.
    3. Wait for `waitForRows(page,'annotations','rows.some(a => a.color === "blue" && a.location.cfi?.startsWith("epubcfi("))')`.
    4. Assert that `page.locator('.mark-blue')` has a count of at least 1.
    5. Click **Increase font size** and assert the count is still at least 1.
- [ ] **Step 2: Confirm the checks fail.** Expected: FAIL while waiting for the toolbar.
- [ ] **Step 3: Implement the adapter methods, then `Toolbar`, then the `Reader` wiring.**
- [ ] **Step 4: Confirm every check passes.**
- [ ] **Step 5: Commit.** Run `git commit -am "feat(reader): color-coded highlights and bookmarked-text highlight"` after `git add src/annotations`.

### Task 9: Notes, the review panel, and export

**Files:**
- Create: `src/annotations/NotesPanel.tsx`
- Modify: `src/reader/Reader.tsx`, `src/App.module.css`
- Test: `tests/browser.mjs`

**Interfaces:**
- `NotesPanel` props: `{ book: Book; list: Annotation[]; editing?: number; onJump: (a: Annotation) => void; onClose: () => void }`. It subscribes to nothing; `Reader` passes the result of `liveQuery(() => db.annotations.where({ book: book.id }).toArray())`.

**Behavior:**
- **Panel:**
  - A **Notes & highlights** button in the reader header, between the title and **•••**, opens a side panel. On wide screens it is a right-hand drawer 340 px wide. On phones it is a bottom sheet with a maximum height of 70 vh.
  - The panel contains color filter toggles (`aria-pressed`) and the list in `sortAnnotations` order.
  - Each item shows a color swatch with its label, the quote clamped to four lines, `where`, and the note.
- **Editing:**
  - Selecting an item's quote calls `onJump`, which runs `adapter.jump(location)` and marks a jump for statistics, as in Task 5.
  - **Edit** expands four color buttons, a `<textarea aria-label="Note">`, and **Delete highlight**.
  - The note saves 400 ms after typing stops and when the field loses focus, through `db.annotations.update(id, { note, updated })`.
- **Opening from the page:**
  - When `activate(key)` fires from a painted mark, the panel opens with that item in edit mode and focuses the note field.
  - **Add note** in the selection toolbar creates the highlight in yellow and then opens it the same way.
- **Export:**
  1. Build `new File([toMarkdown(book, list, Date.now())], `${book.title} – highlights.md`, { type: 'text/markdown' })`.
  2. If `navigator.canShare?.({ files: [file] })` is true, call `navigator.share({ files: [file], title: book.title })` and ignore `AbortError`.
  3. Otherwise, download the file through an object URL, matching the existing backup export.
  4. Disable the button when the list is empty.
- **Empty panel:** “Select text and choose a color to highlight it.”

- [ ] **Step 1: Write the failing browser check.** Continue the PDF part of Task 8.
  1. Click the green mark (`page.mouse.click` at the center of its rectangle).
  2. Fill `getByRole('textbox',{name:'Note'})` with `Remember the lamb`.
  3. Wait for `waitForRows(page,'annotations','rows.some(a => a.note === "Remember the lamb")')`.
  4. Click the filter toggle **Idea**, then click it again.
  5. Start `waitForEvent('download')` and click **Export**.
  6. Read the saved file and assert that it matches `/## Idea\n> .*Little Lamb/` and contains `Remember the lamb`.
  7. Close the panel.
- [ ] **Step 2: Confirm the check fails.** Expected: FAIL because the `Note` textbox is missing.
- [ ] **Step 3: Implement** the panel, editing, export, and styles. The drawer sits above the document with `z-index: 5` and does not cover the footer controls on phones.
- [ ] **Step 4: Confirm every check passes, then check the screen manually.** Run the suite. Then check at 390×844 that the bottom sheet scrolls and its controls are at least 44 px tall.
- [ ] **Step 5: Commit.** Run `git commit -am "feat(reader): notes panel and annotation export"` after `git add src/annotations`.

---

# Phase D: Night Mode

### Task 10: Night mode

**Files:**
- Create: `src/theme.ts`, `tests/unit/theme.test.ts`
- Modify: `src/index.css`, `src/App.module.css`, `src/App.tsx`, `src/main.tsx`, `src/reader/Reader.tsx`, `src/reader/epub.ts`, `src/reader/pdf.css`, `src/shelf/Scene.tsx`, `index.html`
- Test: `tests/browser.mjs`

**Interfaces:**
- `export type Theme = 'system' | 'light' | 'dark'`
- `getTheme(): Theme` reads `localStorage`, returns `'system'` on any error, and treats unknown values as `'system'`.
- `setTheme(t: Theme): void` writes the value and calls `applyTheme`.
- `applyTheme(): 'light' | 'dark'` resolves `'system'` with `matchMedia('(prefers-color-scheme: dark)')`, sets `document.documentElement.dataset.theme` to the resolved value, updates `<meta name="theme-color">` (`#f7f2e8` for light and `#1d1a16` for dark), and returns the resolved value.
- `useResolvedTheme(): 'light' | 'dark'` is a hook that re-renders on `setTheme` and on changes to the media query. It listens for a `shelfscape-theme` `CustomEvent` dispatched by `setTheme`.
- `ReaderAdapter` gains `theme(mode: 'light' | 'dark'): void`.

**Tokens:**
- Add to `index.css`:

```css
:root[data-theme=dark]{color-scheme:dark;--paper:#1d1a16;--ink:#e9dfcf;--muted:#a89a86;--rust:#e0916a;--line:#3e362c;--field:#26221d;--surface:#2a251f}
```

- Add `--field:#fffaf34d;--surface:#fff9ef` to the light `:root`.
- Replace the hard-coded backgrounds and borders in `App.module.css` with tokens: `#fffaf34d` and `#fff9ef`, the `.app` radial `#fffaf0`, `.drop` `#fff6e5ed`, `.readerMenu` `#fffbf2`, `.search` border `#aa9880`, and the `.primary` text `#fff7e7`. Keep the rust button fill.
- In dark mode, set the radial highlight to `#2a241d`.

**Reader:**
- EPUB: register a `night` theme with `body { color: #e9dfcf !important; background: transparent !important }` and `a { color: #e0916a !important }`, then call `rendition.themes.select(mode === 'dark' ? 'night' : 'default')`.
- PDF: in dark mode, apply `.pdfPage canvas { filter: invert(.88) hue-rotate(180deg) }` only. The highlight and text layers are not filtered. Add `// ponytail: inversion also inverts photos; per-image handling if users complain`.
- Highlights: switch `mix-blend-mode` to `screen` in dark mode.
- A **Night mode** toggle button (`aria-pressed`) in the reader footer, beside A−/A+, switches between `light` and `dark`.

**Shelf:**
- `Scene` receives a `night` prop. In dark mode, set ambient light to `0.95` and the key light to `1.7` with color `#ffd9a8`. The canvas stays transparent, so the paper token shows through.
- **Library tools** gains a **Theme** `<select>` with System, Light, and Dark.

**Startup:** call `applyTheme()` in `main.tsx` before `createRoot` to avoid a flash of the wrong theme.

- [ ] **Step 1: Write the failing unit test** in `tests/unit/theme.test.ts`. It parses `src/index.css` for the light `:root{…}` and the `[data-theme=dark]{…}` token blocks with a regular expression. Using `contrast` from `src/shelf/design.ts`, it asserts:
  - ink on paper is at least 7 in both themes
  - muted on paper is at least 4.5 in both themes
  - rust on paper is at least 4.5 in both themes
- [ ] **Step 2: Write the failing browser check** in a new block.
  1. Create `context({colorScheme:'dark'})` and assert that `getComputedStyle(document.body).backgroundColor === 'rgb(29, 26, 22)'`.
  2. Open the Secret Garden sample and assert that the iframe body's computed `color` is `rgb(233, 223, 207)`.
  3. Open the Blake PDF and assert that `.pdfPage canvas` has a computed `filter` containing `invert`.
  4. Click **Night mode** to switch to light, reload, and assert that `document.documentElement.dataset.theme === 'light'`, which proves the preference persists.
- [ ] **Step 3: Confirm the checks fail.** Run `npm run test:unit` and the browser suite. Expected: both fail.
- [ ] **Step 4: Implement** the theme module, tokens, reader, shelf, and startup changes.
- [ ] **Step 5: Confirm the checks pass, then check the screen manually.** Run both suites. Then look at the shelf, the reader with highlights, the notes panel, the stats view, and Library tools in dark mode at both viewport sizes. Confirm that no light patches remain.
- [ ] **Step 6: Commit.** Run `git commit -am "feat: night mode across shelf, reader and highlights"` after `git add src/theme.ts tests/unit`.

---

### Task 11: Backup v2 and documentation

**Files:**
- Modify: `src/library/backup.ts`, `tests/browser.mjs`, `README.md`

**Interfaces:**
- The manifest becomes `{ version: 2; books; positions; bookmarks; sessions: Session[]; progress: Progress[]; annotations: Annotation[] }`. Restore accepts `version` 1, which has no extra tables, or 2.

**Rules:**
- Validation:
  - Session numbers are finite.
  - `0 <= from, to, advanced <= 1`.
  - `active >= 0`.
  - `start <= end`.
  - Progress `fraction` is between 0 and 1.
  - Annotation `color` is in `COLOR_ORDER`.
  - `note` and `where` are strings.
  - `location` passes `validLocation`, including an optional non-negative integer `offset`, and has `text`.
  - Each `book` or `id` is a manifest book ID or a negative sample ID.

  Otherwise, throw `'Invalid reading data in backup.'`.
- Remapping: apply the existing ID `map` to `session.book`, `progress.id`, and `annotation.book`.
- Duplicates:
  - Skip a session when `[book+start]` already exists.
  - Skip an annotation when `[book+created]` already exists.
  - Delete the incoming `id` before calling `add`.
- Progress merge: write the incoming row only when there is no existing row or `incoming.updated > existing.updated`. Keep the earliest non-empty `finished` value.

- [ ] **Step 1: Write the failing browser checks** in the backup block.
  1. In the mixed import block, immediately before the EPUB `back(page)`, add `await page.clock.install(); await page.clock.fastForward(15_000); await page.getByRole('button',{name:'Next page'}).click()`. This makes one session exceed `MIN_SESSION_MS`.
  2. Before export, read `S` (sessions) and `A` (annotations), and assert `S >= 1` and `A >= 2`.
  3. After the first restore, assert that the restored counts equal `S` and `A`.
  4. After the second restore, assert that the counts are unchanged.
  5. Build a v1 zip in Node with `jszip` from `{version:1,books:[],positions:[],bookmarks:[]}`, restore it, and assert that the status reads `Backup restored.`.
- [ ] **Step 2: Confirm the checks fail.** Expected: the restored session count is `0`.
- [ ] **Step 3: Implement** the v2 export and the v1/v2 restore.
- [ ] **Step 4: Update `README.md`.** Under “Browse and read”, explain:
  - Hover shows a book's name, and a click pulls the book out.
  - Selection offers four highlight colors, notes, and the **Notes & highlights** panel, with Markdown export and sharing.
  - The bookmarked passage is underlined.
  - **Reading stats** covers speed, time, streaks, and completion, stays on the device, and is included in backups. “Time away from the page counts for at most two minutes.”
  - **Night mode** is available in the reader footer and Library tools.
- [ ] **Step 5: Run the full verification.** Run `npm run lint && npm run test:unit && npm run build`, then the browser suite against the preview. Expected: all checks pass.
- [ ] **Step 6: Commit.** Run `git commit -am "feat(backup): include stats and annotations; document new features"`

---

## Deliberately Out of Scope

- Reading goals, reminders, and notifications. The original brief lists these as optional future ideas.
- Cloud sync. Sessions and annotations use append-only rows keyed by `(book, start)` and `(book, created)`, so they will merge cleanly once the Supabase milestone exists.
- Online cover lookup. The original brief defers it, and Task 2 improves the generated covers instead.
- Language-aware word counts (`Intl.Segmenter`), per-image handling for PDFs in night mode, and annotations in scanned PDFs, which have no text layer to anchor to.
- A library-wide annotation view. Notes are reviewed per book. Add a cross-book view once people have notes in several books.
