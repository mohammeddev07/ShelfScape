# ShelfScape design system (modern, minimal)

Design read: personal reading PWA for book lovers, modern-minimal language, native CSS tokens + one sans family + one accent + Phosphor icons.
Dials: DESIGN_VARIANCE 4 · MOTION_INTENSITY 4 · VISUAL_DENSITY 3.

## Identity
- The 3D wooden shelf with colorful book spines is the hero and the only rich visual. Everything around it is quiet.
- Layout skeleton: masthead, page title + Import, search + sort, shelf stage, rail, footer. Reader, Stats and Library tools keep their behavior.

## Typography
- UI font: **Geist** variable, self-hosted at `public/fonts/Geist-Variable.woff2` (OFL, license in `public/fonts/Geist-OFL.txt`), declared in `src/index.css` with `font-display: swap`, preloaded in `index.html`, precached by the service worker (`woff2` in the workbox globPatterns). Token: `--sans`.
- Display (h1/h2): Geist 600, letter-spacing -0.03em, line-height 1.1. Page h1 `clamp(28px, 3.2vw, 44px)`.
- Body 15-16px, line-height 1.5. Small/meta 13px. Nothing below 12px.
- Serif only for book content: `--book: "Iowan Old Style", Charter, "Palatino Linotype", Georgia, serif`. `--serif` is kept as an alias of `--book` for older reader code.
- Numbers in stats use `font-variant-numeric: tabular-nums`.

## Color tokens (`src/index.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #f5f5f3 | #111113 | page background |
| `--surface` | #fcfcfb | #1a1a1d | cards, dialog, tooltip, toasts, pill groups |
| `--field` | #ececea | #222226 | inputs, secondary buttons, ghost hover |
| `--ink` | #18181b | #ececee | text |
| `--muted` | #63636b | #9d9da6 | secondary text |
| `--line` | #e2e2df | #2b2b30 | hairlines, progress tracks |
| `--edge` | #d4d4d0 | #3a3a40 | stronger borders, secondary hover |
| `--rust` (accent) | #c2410c | #f0845c | the single accent |
| `--rust-deep` | #9a3412 | #f59e7a | accent hover |
| `--on-rust` | #fffaf6 | #111113 | text on accent |
| `--veil` | rgb(245 245 243 / .92) | rgb(17 17 19 / .92) | drop overlay |
| `--glow` | = paper | = paper | radial glow removed |
| `--shadow` | soft, ink-tinted | deeper, near-black tinted | dialog, tooltip, toasts only |

One accent (terracotta). Neutrals are neutral. No pure #000/#fff. `tests/unit/theme.test.ts` asserts ink ≥ 7:1, muted and accent ≥ 4.5:1 on paper in both themes. Meta theme-color follows the theme (`src/theme.ts`).

## Shape lock
- Interactive controls (buttons, search, select, segmented groups): full pill, 999px.
- Panels, dialogs, tooltip card, toasts, stats figure panel: 16px.
- Small chips (chart hover tip, notes filter chips, stat bar tops `8px 8px 0 0`): 8px.
- PDF pages are paper, not cards: 2px.

## Controls (`src/App.module.css`)
- `.primary`: solid accent pill, one per view (Import on the shelf page, Open book in the preview).
- `.ghost`: text + icon, no border, `--field` background on hover (masthead tools, Back to shelf, Explore sample shelf, footer links, Stats back).
- `.icon`: round icon-only button, always with `aria-label`.
- `.secondary`: filled neutral pill (dialog actions).
- `.group`: segmented pill container on `--surface` with a 1px `--line` border (rail controls, preview zoom/reset).
- Hover transitions 180ms, `:active` scale(.98), 2px accent focus ring with 3px offset. Controls are 40px tall on desktop and at least 44px on phones and coarse pointers. `prefers-reduced-motion` removes transitions and the press scale.

## Icons
`@phosphor-icons/react`, regular weight, 14-20px, named `*Icon` imports (tree-shaken), `aria-hidden="true"` on every icon. Mapping: Import Plus · Library tools SlidersHorizontal · Reading stats ChartBar · search MagnifyingGlass · selects CaretDown · prev/next and back CaretLeft/CaretRight · Pause/Play · zoom MagnifyingGlassMinus/Plus · Reset view ArrowCounterClockwise · close/dismiss X. Reader: DotsThree (bold) Reading options · NotePencil notes, Edit and Add note · Moon/Sun night mode · Minus/Plus around TextAa (EPUB) or MagnifyingGlass (PDF) · BookmarkSimple, Highlighter, ArrowBendDownRight menu rows · Trash delete · Export export.

## Surfaces
- **Masthead**: 64px, wordmark (bar mark in ink with an accent leaning book) left; Reading stats and Library tools as ghost icon+label buttons right. Under 480px the labels are visually hidden (still the accessible name) and the buttons become 44px icon targets. One 1px `--line` hairline.
- **Heading row**: h1 left, Import pill right. Search is a pill on `--field` with a 1px `--line` border, MagnifyingGlass icon and an accent ring on focus; Sort is a compact pill select with a CaretDown. Under 360px search takes the full row and Sort wraps below.
- **Shelf**: 3D scene unchanged except the plank: lighter oak base `#b48a62` with finer, lower-contrast grain, a slimmer and lighter front lip, a softer picked-book shadow and a softer CSS under-shelf shadow. Book painters are untouched.
- **Rail**: volume count left in `--muted`; right a pill group with the current title (ellipsized), previous/next and play/pause icon buttons.
- **Hover tooltip**: `--surface` card, 16px radius, soft shadow, Geist 600 title over 12px muted author/progress.
- **Inspection preview**: centered title (Geist 600, 22-26px), author in `--muted`, progress line 13px; actions: Open book pill, zoom out/in/reset pill group, ghost Back to shelf (X icon only under 480px, name kept); hint 13px muted, hidden on coarse pointers.
- **Dock** (rail + preview): while previewing the dock sticks to the bottom with a paper fade. From 960px it is a three-column grid: count left, preview center (max 460px), rail controls right, so the preview never covers them. Below 960px the rail stacks above the preview. The rail title flexes (ellipsis) instead of a fixed vw width. Verified at 1440×900, 1280×800, 1024×768, 390×844 and 360×740: Open book and every rail control inside the viewport and unobstructed.
- **Empty state**: bookplate art (lifted slightly so its paper blends into the neutral page; in dark mode it is whitened before inversion so its paper becomes pure black and disappears under the screen blend), Geist h2, ghost accent "Explore sample shelf" with CaretRight.
- **Footer**: one quiet 13px muted line over a hairline.
- **Library tools**: `--surface` dialog, 16px radius, soft shadow, sections separated by spacing, pill buttons, X close.
- **Stats**: back ghost button, large page title, one `--surface` panel of four figures (large tabular Geist numerals over 13px muted labels), accent bars, book rows with a 4px `--line` track and accent fill, hairlines only between rows.
- **Toasts / import results**: `--surface`, 16px radius, soft shadow.

## Reader (`src/reader/Reader.tsx`, `src/reader/pdf.css`)
- Full-bleed chrome; the document column keeps the old width (`min(100%, 977.6px)`) so PDF scale and EPUB pagination are unchanged.
- **Header** 60px (56px on phones), no rule: ghost "Library" with CaretLeft (accessible name exactly "Library"), centered book title (Geist 600 16px, ellipsis), right icon buttons Notes & highlights and Reading options; an expanded one keeps the `--field` fill.
- **Footer** 64px over a 1px `--line` hairline. A 2px `--rust` line on that hairline shows reading progress (`--read` custom property). Left: a `.group` stepper (Minus / TextAa or MagnifyingGlass / Plus; names "Decrease/Increase font size" or "Zoom out/in") and the Night mode icon (Moon in light, Sun in dark, `aria-pressed`). Center: Previous/Next caret icon buttons around the status "label · NN%" in 13px muted tabular numerals. On phones the decorative stepper icon hides and the page controls move right.
- **Reading options**: `--surface` popover, 16px radius, `--shadow`, 300px; ghost rows with muted icons (Bookmark this passage, Highlight selection, Go to bookmark), a hairline, then labelled pill fields (Contents select with CaretDown, Go to page input + secondary Go).
- **Notice** (`role=status`): the live region stays mounted; each message is a surface pill above the footer that fades after 4s (an animation delay, so reduced motion still shows it).
- **Loading**: centered 14px muted "Opening your book…" with a slow opacity breathe, no spinner.
- **Content**: EPUB body text in the book serif stack, day ink #202024, links in the accent; night colors unchanged. PDF pages: 2px radius, `--shadow`, text selection tinted with the accent.

## Notes & highlights (`src/annotations/NotesPanel.tsx`)
- Desktop: floating sheet 360px wide under the header, 16px radius, 1px `--line`, `--shadow`. Phones: bottom sheet, 16px top corners, max 72vh.
- Header: Geist 600 17px "Notes & highlights" (focusable heading), X `.icon` "Close notes".
- Filter chips: 8px radius, 1px `--line`, 12px swatch with an inner ring; pressed = `--field` fill + ink border.
- Items: meta row (swatch, color label · location, 12px muted) with Edit (ghost) / Done (secondary) on the right; quote in the book serif 17px (4-line clamp); note text 14px. Edit mode: round swatch buttons (ink ring when chosen), `--field` textarea with 16px radius, ghost Delete highlight with Trash.
- Delete highlight keeps the panel open, awaits the delete, shows a failure in the panel and moves focus to the next item (or the heading when none).
- Export: secondary pill with Export icon, pinned to the bottom of the sheet.

## Highlight toolbar (`src/annotations/Toolbar.tsx`)
- Pill on `--surface`, 1px `--line`, `--shadow`. Color swatches are 22px circles with a 1px inner ring inside 40px round targets (44px on coarse pointers), names "Highlight <color>, <label>". A hairline separates the ghost "Add note" with NotePencil.

## Copy
No new em-dashes. The existing "—" for unknown stat values stays as a data placeholder. The inspect hint now reads "Drag to rotate, arrow keys to turn, Q and E to roll".

## Verification
Screenshots at 1440×900 and 390×844, light and dark: shelf, inspection preview, empty library, Library tools, stats; phase B adds reader PDF (highlight + bookmark), reader EPUB, reading options, notes panel in edit mode (drawer and bottom sheet) and the highlight toolbar. Checked: text contrast ≥ 4.5:1, no horizontal overflow at 320-1440px, focus visible, nothing clipped, consistent radii, one accent.
