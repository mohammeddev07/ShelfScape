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
- Small chips (chart hover tip): 8px.

## Controls (`src/App.module.css`)
- `.primary`: solid accent pill, one per view (Import on the shelf page, Open book in the preview).
- `.ghost`: text + icon, no border, `--field` background on hover (masthead tools, Back to shelf, Explore sample shelf, footer links, Stats back).
- `.icon`: round icon-only button, always with `aria-label`.
- `.secondary`: filled neutral pill (dialog actions).
- `.group`: segmented pill container on `--surface` with a 1px `--line` border (rail controls, preview zoom/reset).
- Hover transitions 180ms, `:active` scale(.98), 2px accent focus ring with 3px offset. Controls are 40px tall on desktop and at least 44px on phones and coarse pointers. `prefers-reduced-motion` removes transitions and the press scale.

## Icons
`@phosphor-icons/react`, regular weight, 14-20px, named `*Icon` imports (tree-shaken), `aria-hidden="true"` on every icon. Mapping: Import Plus · Library tools SlidersHorizontal · Reading stats ChartBar · search MagnifyingGlass · selects CaretDown · prev/next and back CaretLeft/CaretRight · Pause/Play · zoom MagnifyingGlassMinus/Plus · Reset view ArrowCounterClockwise · close/dismiss X. Reserved for the reader (phase B): DotsThree, NotePencil, Moon/Sun.

## Surfaces
- **Masthead**: 64px, wordmark (bar mark in ink with an accent leaning book) left; Reading stats and Library tools as ghost icon+label buttons right. Under 480px the labels are visually hidden (still the accessible name) and the buttons become 44px icon targets. One 1px `--line` hairline.
- **Heading row**: h1 left, Import pill right. Search is a pill on `--field` with a 1px `--line` border, MagnifyingGlass icon and an accent ring on focus; Sort is a compact pill select with a CaretDown. Under 360px search takes the full row and Sort wraps below.
- **Shelf**: 3D scene unchanged except the plank: lighter oak base `#b48a62` with finer, lower-contrast grain, a slimmer and lighter front lip, a softer picked-book shadow and a softer CSS under-shelf shadow. Book painters are untouched.
- **Rail**: volume count left in `--muted`; right a pill group with the current title (ellipsized), previous/next and play/pause icon buttons.
- **Hover tooltip**: `--surface` card, 16px radius, soft shadow, Geist 600 title over 12px muted author/progress.
- **Inspection preview**: centered title (Geist 600, 22-26px), author in `--muted`, progress line 13px; actions: Open book pill, zoom out/in/reset pill group, ghost Back to shelf; hint 13px muted.
- **Empty state**: bookplate art (lifted slightly so its paper blends into the neutral page), Geist h2, ghost accent "Explore sample shelf" with CaretRight.
- **Footer**: one quiet 13px muted line over a hairline.
- **Library tools**: `--surface` dialog, 16px radius, soft shadow, sections separated by spacing, pill buttons, X close.
- **Stats**: back ghost button, large page title, one `--surface` panel of four figures (large tabular Geist numerals over 13px muted labels), accent bars, book rows with a 4px `--line` track and accent fill, hairlines only between rows.
- **Toasts / import results**: `--surface`, 16px radius, soft shadow.

## Copy
No new em-dashes. The existing "—" for unknown stat values stays as a data placeholder. The inspect hint now reads "Drag to rotate, arrow keys to turn, Q and E to roll".

## Verification
Screenshots at 1440×900 and 390×844, light and dark: shelf, inspection preview, empty library, Library tools, stats. Checked: text contrast ≥ 4.5:1, no horizontal overflow at 320-1440px, focus visible, nothing clipped, consistent radii, one accent.
