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

- Hover over a spine or tap it once to reveal the book. Drag the shelf to browse. Drag the floating book to rotate, pinch or use the zoom buttons, and select **Reset view** to return to the cover.
- Use the spine control beneath the shelf and the arrow keys to browse. Activate it to commit the selection. The arrow keys then turn the book horizontally or vertically, and **Q** and **E** roll it. **Escape** dismisses the inspection.
- Tap the revealed front cover or choose **Open book**. PDF pages retain their layout and selectable text where the source provides it. EPUB supports adjustable type and chapter navigation. The reader saves the last view. **Reading options → Bookmark this passage** records a separate location, using selected text when available.
- Export a backup before clearing browser storage. Restoring a backup merges originals by content hash and restores the reading positions it contains. The bundled sample credits are in [public/samples/CREDITS.txt](public/samples/CREDITS.txt).

## Verification

```sh
npm run lint
npm run build
npx playwright-core install chromium
npm run preview
# In another terminal
npm run test:browser
```

Set `CHROME_PATH` to use an installed Chromium-family executable. Set `TEST_URL` when testing a preview on a different port. The suite uses temporary browser profiles and never reads your personal browser data.

The browser suite exercises imports, offline opening, resume, bookmarks, backup restoration, touch gestures, context loss, and bounded rendering for 1,000 books. Physical-device acceptance requires a production HTTPS build on iPhone Safari and Android Chrome, in both browser and installed modes. Verify rotation and pinch, keyboard and screen-reader navigation, offline relaunch, storage persistence, and frame timing during repeated browse–read–return cycles on each device.
