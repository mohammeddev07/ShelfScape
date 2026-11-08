# ShelfScape design system (walnut shelf in a reading room)

Design read: personal reading PWA for book lovers. A reading room: deep green-black (dark) or cool sage paper (light), bone ink, one amber accent, a lamp-light pool behind the shelf; Spectral for headings and book titles, Geist for controls; Phosphor icons.
Dials: DESIGN_VARIANCE 4 · MOTION_INTENSITY 4 · VISUAL_DENSITY 3.

## Identity
- The 3D wooden shelf with colorful book spines is the hero and the only rich visual. Everything around it is quiet.
- Layout skeleton: masthead, page title + Import, shelves bar, search + sort (+ Edit shelf), shelf stage, caption, footer. Reader, Stats and Library tools keep their behavior.

## Typography
- UI font: **Geist** variable, self-hosted at `public/fonts/Geist-Variable.woff2` (OFL, license in `public/fonts/Geist-OFL.txt`), declared in `src/index.css` with `font-display: swap`, preloaded in `index.html`, precached by the service worker (`woff2` in the workbox globPatterns). Token: `--sans`.
- Display (h1/h2, wordmark, book titles in the caption, rename field and shelf editor): **Spectral Medium** (500), self-hosted at `public/fonts/Spectral-500-{latin,latin-ext,cyrillic}.woff2` with unicode ranges (OFL, `public/fonts/Spectral-OFL.txt`); the latin 500 file is preloaded. Token: `--display`. Page h1 `clamp(36px, 4.6vw, 68px)`.
- Authors: **Spectral Regular** (400), same files pattern. Controls, labels and body copy stay Geist.
- Body 15-16px, line-height 1.5. Small/meta 13px. Nothing below 12px.
- Serif only for book content: `--book: "Iowan Old Style", Charter, "Palatino Linotype", Georgia, serif`. `--serif` is kept as an alias of `--book` for older reader code.
- Numbers in stats use `font-variant-numeric: tabular-nums`.

## Color tokens (`src/index.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #eef1ec (sage paper) | #0e1512 (green-black) | page background, under a soft `--glow` wash from the top |
| `--surface` | #f7f9f6 | #151e1a | dialog, toasts, popovers |
| `--field` | #e3e8e2 | #1a2520 | inputs, secondary buttons |
| `--ink` | #15201b | #ece6d8 (bone) | text |
| `--muted` | #56635c | #9aa79f | secondary text, inactive tabs, authors |
| `--line` | #d9e0d9 | #24302a | hairlines |
| `--edge` | #c5cfc6 | #34423b | stronger borders |
| `--rust` (amber accent; name kept) | #8f5a10 | #e3a94f | the single accent: tab underline, Import outline, Open book, Save, bookmark ribbon |
| `--rust-deep` | #74480b | #f0c27a | accent hover |
| `--on-rust` | #fffaf0 | #14100a | text on accent |
| `--tint` | amber 10% | amber 12% | accent hover fill and focus halo (replaces color-mix for older browsers) |
| `--lamp` | amber .13 | amber .2 | radial pool of light behind the books (`.stage::before`) |

Palette family: Forest (deep green, bone, amber). The warm beige / brass / espresso family is deliberately avoided.
`tests/unit/theme.test.ts` asserts ink ≥ 7:1, muted and accent ≥ 4.5:1 on paper in both themes. Meta theme-color follows the theme (`src/theme.ts`).

## Shape lock
- Interactive controls (buttons, search, select, segmented groups): full pill, 999px.
- Panels, dialogs, tooltip card, toasts, stats figure panel: 16px.
- Small chips (chart hover tip, notes filter chips, stat bar tops `8px 8px 0 0`): 8px.
- PDF pages are paper, not cards: 2px.

## Controls (`src/App.module.css`)
- `.primary`: solid accent pill (Save, Create, Done). `.outline`: amber-outlined pill (Import). `.link`: amber underlined text (Open book).
- `.ghost`: text + icon, no border, `--field` background on hover (masthead tools, Back to shelf, Explore sample shelf, footer links, Stats back).
- `.icon`: round icon-only button, always with `aria-label`.
- `.secondary`: filled neutral pill (dialog actions).
- `.group`: segmented pill container on `--surface` with a 1px `--line` border (reader footer stepper).
- Hover transitions 180ms, `:active` scale(.98), 2px accent focus ring with 3px offset. Controls are 40px tall on desktop and at least 44px on phones and coarse pointers. `prefers-reduced-motion` removes transitions and the press scale.

## Icons
`@phosphor-icons/react`, regular weight, 14-20px, named `*Icon` imports (tree-shaken), `aria-hidden="true"` on every icon. Mapping: Import Plus · Library tools SlidersHorizontal · Reading stats ChartBar · search MagnifyingGlass · selects CaretDown · prev/next and back CaretLeft/CaretRight · Pause/Play · zoom MagnifyingGlassMinus/Plus · Reset view ArrowCounterClockwise · close/dismiss X. Reader: DotsThree (bold) Reading options · NotePencil notes, Edit and Add note · Moon/Sun night mode · Minus/Plus around TextAa (EPUB) or MagnifyingGlass (PDF) · BookmarkSimple, Highlighter, ArrowBendDownRight menu rows · Trash delete · Export export.

## Surfaces
- **Masthead**: 64px, wordmark (bar mark in ink with an accent leaning book) left; Reading stats and Library tools as ghost icon+label buttons right. Under 480px the labels are visually hidden (still the accessible name) and the buttons become 44px icon targets. One 1px `--line` hairline.
- **Heading row**: h1 left, Import pill right. Search is a pill on `--field` with a 1px `--line` border, MagnifyingGlass icon and an accent ring on focus; Sort is a compact pill select with a CaretDown. Under 360px search takes the full row and Sort wraps below.
- **Shelves bar**: text tabs (All books, each custom shelf, then a muted “+ New shelf”) over one hairline; the active tab is ink with a 2px amber underline that scales in over 280ms. “New shelf” turns into an inline name field with Create and Cancel. Under 640px the tabs become a amber-outlined pill `<select>` (stack icon, caret, “+ New shelf” option). **Edit shelf** (custom shelves only, icon-only on phones) opens a dialog of checkboxes with a filter field, Delete shelf (two-step) and Done.
- **Shelf**: a long, shallow walnut oval drawn in SVG behind a transparent canvas (`ShelfArt` in `src/Shelf.tsx`), placed with the scene camera (`project` in `src/shelf/layout.ts`). Its amber lip is 2px wide and thins to 0.5px while fading out over the outer 7% at each end; the oval body, a contact shadow and a drop shadow fade with it. Books stand on a gentle arc (`arc`, depth `BOW`) with spines turned toward the centre, and the book rows fade over the outer 12% of the stage. Besides auto-spin it moves by drag, swipe, wheel or keyboard (eased glide). The browsed book lifts slightly.
- **Auto-spin**: a looping shelf advances at 0.3 units/s (`AUTO_SPEED`) with no pause button. It holds while the mouse is over the shelf section, keyboard focus is inside it, a book is out, a title is being renamed, a dialog or the new-shelf field is open, the tab is hidden, or for 1.5s after a shelf switch. Reduced motion disables it. A shelf that fits never spins.
- **Shelf transitions** (`Transition` in `layout.ts`, drawn by `BookModel`): header and controls stay put. Books not on the new shelf tip forward off the lip and fall out of view; books on both slide to their new places (120ms delay, 560ms ease-out); newcomers drop in from above and land with a small bounce (from 260ms, 620ms). Leaving books keep their component key, so their textures are reused while they fall. Each shelf's browsing position is restored. With reduced motion the switch is instant.
- **Caption** (under the shelf, replaces the tooltip, rail and preview): Spectral Medium title `clamp(26px, 3vw, 44px)` that wraps (balanced), pencil icon button inline after the last line; author in Spectral Regular, muted; progress line 13px; amber underlined **Open book** (or Attach file). It follows hover, keyboard browsing or a tap and stays on the last book hovered so the pointer can reach its actions. A visually hidden live region announces title and author.
- **Bookmarks (reader)**: a ribbon toggle in the header (filled amber and `aria-pressed` when the page shown is bookmarked), an amber ribbon that drops onto the page's top corner, a Bookmarks entry with a count in Reading options, and a Highlights / Bookmarks pill switch in the notes panel. Bookmark rows: amber ribbon icon, page or chapter and date, the excerpt in the book serif (tap to jump), trash button.
- **Rename**: label “Book title”, a 56px rounded field in Spectral, an optional “Use ‘…’” link that strips a trailing PDFDrive.com, the author, solid amber Save and outlined Cancel, then the original filename in 13px muted. Escape cancels; focus returns to the pencil.
- **Empty state**: bookplate art (lifted slightly so its paper blends into the neutral page; in dark mode it is whitened before inversion so its paper becomes pure black and disappears under the screen blend), Geist h2, ghost accent "Explore sample shelf" with CaretRight.
- **Footer**: one quiet 13px muted line over a hairline.
- **Library tools**: `--surface` dialog, 16px radius, soft shadow, sections separated by spacing, pill buttons, X close.
- **Stats**: back ghost button, large page title, one `--surface` panel of four figures (large tabular Geist numerals over 13px muted labels), accent bars, book rows with a 4px `--line` track and accent fill, hairlines only between rows.
- **Toasts / import results**: `--surface`, 16px radius, soft shadow.

## Reader (`src/reader/Reader.tsx`, `src/reader/pdf.css`)
- Full-bleed chrome; the document column keeps the old width (`min(100%, 977.6px)`) so PDF scale and EPUB pagination are unchanged.
- **Header** 60px (56px on phones), no rule: ghost "Library" with CaretLeft (accessible name exactly "Library"), centered book title (Geist 600 16px, ellipsis), right icon buttons Notes & highlights and Reading options; an expanded one keeps the `--field` fill.
- **Footer** 64px over a 1px `--line` hairline. A 2px `--rust` line on that hairline shows reading progress (`--read` custom property). Left: a `.group` stepper (Minus / TextAa or MagnifyingGlass / Plus; names "Decrease/Increase font size" or "Zoom out/in") and the Night mode icon (Moon in light, Sun in dark, `aria-pressed`). Center: Previous/Next caret icon buttons around the status "label · NN%" in 13px muted tabular numerals. On phones the decorative stepper icon hides, the page controls move right and the status may wrap to two lines.
- **Touch targets**: under 640px or on coarse pointers every reader header and footer icon button (stepper included) and every toolbar swatch is 44×44px.
- **Reading options**: `--surface` popover, 16px radius, `--shadow`, 300px; ghost rows with muted icons (Bookmark this passage, Highlight selection, Go to bookmark), a hairline, then labelled pill fields (Contents select with CaretDown, Go to page input + secondary Go).
- **Notice** (`role=status`): the live region stays mounted; each message is a surface pill above the footer, keyed by a counter so a repeated message gets a fresh pill. It fades after 4s (an animation delay, so reduced motion still shows it) and the text clears at 4.3s.
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
- Pill on `--surface`, 1px `--line`, `--shadow`. Color swatches are 22px circles with a 1px inner ring inside 40px round targets (44px under 640px and on coarse pointers; the toolbar keeps 160px from the viewport edges), names "Highlight <color>, <label>". A hairline separates the ghost "Add note" with NotePencil.

## Copy
No new em-dashes. The existing "—" for unknown stat values stays as a data placeholder. The caption hint for a picked book reads "Drag to rotate, arrow keys to turn, Q and E to roll".

## Verification
Screenshots at 1440×900 and 390×844, light and dark: shelf, inspection preview, empty library, Library tools, stats; phase B adds reader PDF (highlight + bookmark), reader EPUB, reading options, notes panel in edit mode (drawer and bottom sheet) and the highlight toolbar. Checked: text contrast ≥ 4.5:1, no horizontal overflow at 320-1440px, focus visible, nothing clipped, consistent radii, one accent.
