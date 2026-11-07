# ShelfScape

A local-first, installable bookshelf for PDF and EPUB files. Import your own books or choose **Explore sample shelf** to browse complete public-domain editions. The sample collection is separate from your personal library.

## Run

Use Node 24 (the project includes an `.nvmrc`).

```sh
npm ci
npm run dev
```

For an installable build, run `npm run build`, then `npm run preview`. Serve `dist/` at the root of a static HTTPS origin. The first online visit precaches the shell, sample editions, reader code, and PDF rendering resources. Allow the service worker to finish installing before going offline. Imports live in IndexedDB on that browser and origin. Library tools includes backup export, restore, and installation instructions.

## Browse and read

- Hover over a spine to see its title, author, and how much you have read. Click or tap a spine to pull the book out. Clicking another spine returns the current book to the shelf before the new one comes out. Drag the shelf to browse. Drag the floating book to rotate, pinch or use the zoom buttons, and select **Reset view** to return to the cover.
- Use the spine control beneath the shelf and the arrow keys to move the title label along the shelf. Press **Enter** to pull the labelled book out. The arrow keys then turn the book horizontally or vertically, and **Q** and **E** roll it. **Escape** returns it to the shelf.
- Tap the revealed front cover or choose **Open book**. PDF pages retain their layout and selectable text where the source provides it. EPUB supports adjustable type and chapter navigation. The reader saves the last view and shows the percentage read. **Reading options → Bookmark this passage** records a separate location, using selected text when available, and the bookmarked passage is underlined.
- Select text to highlight it in one of four colors: yellow for important points, green for ideas, blue for questions, and pink for quotes. **Notes & highlights** lists them by position. Filter by color, add a note, jump to a passage, or **Export** them as Markdown. On phones, Export opens the share sheet.
- **Reading stats** shows this week's reading time, reading speed, your daily streak, books completed, the last 14 days, and progress per book. Time away from the page counts for at most two minutes, and jumps through the contents or a bookmark do not count as reading.
- **Night mode** follows your system setting. Change it from the reader's footer or from **Library tools**.
- Everything stays on this device. Export a backup before clearing browser storage. Backups include your books, reading positions, bookmarks, statistics, and highlights. Restoring a backup merges originals by content hash and skips entries it already has. The bundled sample credits are in [public/samples/CREDITS.txt](public/samples/CREDITS.txt).

## Verification

```sh
npm run lint
npm run test:unit
npm run build
npx playwright-core install chromium
npm run preview
# In another terminal
npm run test:browser
```

Set `CHROME_PATH` to use an installed Chromium-family executable. Set `TEST_URL` when testing a preview on a different port. The suite uses temporary browser profiles and never reads your personal browser data.

The unit tests cover the statistics, annotation, and cover-design logic. The browser suite exercises imports, offline opening, resume, bookmarks, highlights and notes, reading sessions and statistics, night mode, backup restoration, touch gestures, the shelf's hover, click, and swap behavior, context loss, and bounded rendering for 1,000 books. Physical-device acceptance requires a production HTTPS build on iPhone Safari and Android Chrome, in both browser and installed modes. Verify rotation and pinch, keyboard and screen-reader navigation, offline relaunch, storage persistence, and frame timing during repeated browse–read–return cycles on each device.
