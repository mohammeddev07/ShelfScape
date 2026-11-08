// Run against the production preview. Browser state is isolated and discarded on exit.
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { basename,join,resolve } from 'node:path'
import { mkdtemp,readFile,writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { chromium } from 'playwright-core'

const url = process.env.TEST_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH || undefined,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader'] })
const outs = await mkdtemp(join(tmpdir(),'shelfscape-browser-'))
const errors = []
const pdf = resolve('public/samples/songs.pdf'), epub = resolve('public/samples/secret-garden.epub')
const stageOf = page => page.locator('[aria-roledescription=bookshelf]')
const caption = page => page.locator('section h2')
// Keyboard: Enter on the focused shelf takes the browsed book out.
const inspect = async page => { await stageOf(page).press('Enter'); await page.getByRole('button',{name:'Open book',exact:true}).waitFor() }
const open = page => page.getByRole('button',{name:'Open book',exact:true}).click()
const back = page => page.getByRole('button',{name:/^‹? ?Library$/}).click()
const options = page => page.getByRole('button',{name:'Reading options'}).click()
async function context(settings = {}, init) {
  const ctx = await browser.newContext({viewport:{width:1280,height:800},...settings})
  // Observe actual renderer counters using Three's devtools event, only in this test context.
  await ctx.addInitScript(() => {
    window.__THREE_DEVTOOLS__ = new EventTarget()
    window.__THREE_DEVTOOLS__.addEventListener('observe',({detail}) => {
      if (detail.isScene) window.testScene = detail
      if (detail.isWebGLRenderer) window.testRenderer = detail
    })
  })
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url)
  await page.getByRole('heading',{name:'My library'}).waitFor()
  return {ctx,page}
}
async function importBooks(page,files) {
  const payloads = await Promise.all(files.map(async f => typeof f !== 'string' ? f : ({
    name:basename(f),mimeType:f.endsWith('pdf') ? 'application/pdf' : 'application/epub+zip',buffer:await readFile(f)
  })))
  await page.locator('input[accept=".epub,.pdf"]').setInputFiles(payloads)
  await page.getByText('Import results',{exact:true}).waitFor()
}
async function metrics(page) {
  return page.evaluate(() => {
    const r = window.testRenderer, s = window.testScene
    let meshes = 0
    s.traverse(obj => { if (obj.isMesh) meshes++ })
    return {meshes,textures:r.info.memory.textures,geometries:r.info.memory.geometries,frames:r.info.render.frame}
  })
}
async function hit(page,id,part) {
  return page.evaluate(({id,part}) => {
    const scene = window.testScene, mesh = scene.getObjectByName('Book ' + id).getObjectByName(part)
    let camera
    scene.traverse(o => { if (o.isOrthographicCamera) camera = o })
    const pos = mesh.getWorldPosition(mesh.position.clone()).project(camera)
    const rect = window.testRenderer.domElement.getBoundingClientRect()
    return {x:rect.left + (pos.x + 1) / 2 * rect.width,y:rect.top + (1 - pos.y) / 2 * rect.height}
  },{id,part})
}
async function idbRows(page,table) {
  return page.evaluate(async table => {
    const db = await new Promise(resolve => { const r = indexedDB.open('shelfscape'); r.onsuccess = () => resolve(r.result) })
    const rows = await new Promise(resolve => { const r = db.transaction(table).objectStore(table).getAll(); r.onsuccess = () => resolve(r.result) })
    db.close(); return rows
  },table)
}
// Polls from Node: page.waitForFunction treats an async predicate's Promise as truthy and resolves at once.
async function waitForRows(page,table,test) {
  const check = new Function('rows','return ' + test)
  for (const end = Date.now() + 30_000; !check(await idbRows(page,table).catch(() => [])); await page.waitForTimeout(100))
    if (Date.now() > end) throw new Error('waitForRows timed out: ' + table + ' ' + test)
}
// Writes fixture rows straight into IndexedDB so a block can test a feature without depending on another block.
async function seedRows(page,table,rows) {
  await page.evaluate(async ([table,rows]) => {
    const db = await new Promise(r => { const q = indexedDB.open('shelfscape'); q.onsuccess = () => r(q.result) })
    const tx = db.transaction(table,'readwrite')
    for (const row of rows) tx.objectStore(table).put(row)
    await new Promise(r => { tx.oncomplete = r }); db.close()
  },[table,rows])
}
try {
  const migrated = await context({}, async () => {
    // v1 was created by Dexie with a native IndexedDB version of 10.
    // Init scripts also run in sandboxed frames, where storage access throws.
    try { if (window !== top || sessionStorage.getItem('migration-fixture')) return } catch { return }
    sessionStorage.setItem('migration-fixture','1')
    const request = indexedDB.open('shelfscape',10)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('books',{keyPath:'id',autoIncrement:true})
      store.createIndex('title','title')
      store.add({title:'Dune',color:'#c2703d'})
      store.add({title:'Family journal',color:'#795441'})
    }
    request.onsuccess = () => request.result.close()
  })
  await migrated.page.getByText('1 volume',{exact:true}).waitFor()
  assert.equal((await idbRows(migrated.page,'books'))[0].title,'Family journal')
  await migrated.page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'files') throw new DOMException('Test storage limit','QuotaExceededError')
      return put.apply(this,args)
    }
  })
  await importBooks(migrated.page,[pdf])
  assert.match(await migrated.page.locator('body').innerText(),/storage is full/)
  assert.equal((await idbRows(migrated.page,'books')).length,1)
  assert.equal((await idbRows(migrated.page,'files')).length,0)
  await migrated.ctx.close()
  console.log('PASS v1 migration and atomic quota failure')
  const {ctx,page} = await context({reducedMotion:'reduce'})
  await importBooks(page,[pdf,{name:'invalid.epub',mimeType:'application/epub+zip',buffer:Buffer.from('invalid')},epub,pdf])
  assert.match(await page.locator('body').innerText(),/Already on your shelf/)
  assert.match(await page.locator('body').innerText(),/contents do not match/)
  assert.equal((await idbRows(page,'books')).length,2)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await ctx.setOffline(true)
  await page.reload()
  const search = page.locator('input[type=search]')
  await search.fill('Blake'); await inspect(page); await open(page)
  await page.getByText('Piping down the valleys wild,',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Next page'}).click()
  await page.getByText('The Lamb',{exact:true}).waitFor()
  await waitForRows(page,'progress','rows.some(p => p.words > 0 && p.words < 10000 && !p.locations)')
  await page.getByRole('button',{name:'Zoom in'}).click()
  await page.waitForFunction(() => document.querySelector('.textLayer')?.textContent.includes('Little Lamb, who made thee?'))
  const selectLamb = () => page.locator('.textLayer').evaluate(layer => {
    const text = [...layer.querySelectorAll('span')].find(span => span.textContent.includes('Little Lamb, who made thee?'))
    const range = document.createRange(); range.selectNodeContents(text)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
  })
  await selectLamb()
  await page.getByRole('button',{name:/Highlight green/}).click()
  await waitForRows(page,'annotations','rows.some(a => a.color === "green" && /Little Lamb/.test(a.location.text) && Number.isInteger(a.location.offset))')
  const green = page.locator('.highlightLayer .mark.green')
  await green.first().waitFor()
  const markWidth = () => green.first().evaluate(m => m.getBoundingClientRect().width)
  const narrow = await markWidth()
  await page.getByRole('button',{name:'Zoom in'}).click()
  await page.waitForFunction(w => document.querySelector('.highlightLayer .mark.green')?.getBoundingClientRect().width > w,narrow)
  await selectLamb()
  await options(page);await page.getByText('Bookmark this passage').click()
  await page.getByRole('status').filter({hasText:'bookmarked'}).waitFor()
  await page.locator('.highlightLayer .mark.bookmark').first().waitFor()
  await back(page); await inspect(page); await open(page)
  await page.getByText('The Lamb',{exact:true}).waitFor()
  await green.first().waitFor(); await page.locator('.highlightLayer .mark.bookmark').first().waitFor()
  const savedPdf = (await idbRows(page,'marks'))[0].location
  assert.equal(savedPdf.page,2)
  assert.match(savedPdf.text,/Little Lamb/)
  const box = await green.first().boundingBox()
  await page.mouse.click(box.x + box.width / 2,box.y + box.height / 2)
  await page.getByRole('textbox',{name:'Note'}).fill('Remember the lamb')
  await waitForRows(page,'annotations','rows.some(a => a.note === "Remember the lamb")')
  await page.getByRole('button',{name:'Idea',exact:true}).click(); await page.getByRole('button',{name:'Idea',exact:true}).click()
  await page.evaluate(() => { navigator.canShare = undefined })   // desktop Chrome can share files; test the download fallback
  const exported = page.waitForEvent('download')
  await page.getByRole('button',{name:'Export',exact:true}).click()
  const notes = await readFile(await (await exported).path(),'utf8')
  assert.match(notes,/## Idea\n> .*Little Lamb/); assert(notes.includes('Remember the lamb'))
  // Deleting keeps the panel open; with no next item, focus lands on the panel heading.
  await page.getByRole('button',{name:'Delete highlight'}).click()
  await waitForRows(page,'annotations','!rows.some(a => a.note === "Remember the lamb")')
  await page.waitForFunction(() => document.activeElement?.matches('h2') && document.activeElement.textContent === 'Notes & highlights')
  await page.getByText('Select text and choose a color to highlight it.').waitFor()
  await page.getByRole('button',{name:'Close notes'}).click()
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),'Notes & highlights')
  // A selection that was cleared, then a page turn: keyboard Highlight selection must not save the old passage.
  const before = (await idbRows(page,'annotations')).length
  await selectLamb(); await page.getByRole('toolbar',{name:'Highlight'}).waitFor()
  await page.evaluate(() => getSelection().collapseToStart()); await page.getByRole('toolbar',{name:'Highlight'}).waitFor({state:'detached'})
  await page.getByRole('button',{name:'Previous page'}).click(); await page.getByText('Piping down the valleys wild,',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Reading options'}).press('Enter'); await page.getByRole('button',{name:'Highlight selection'}).press('Enter')
  await page.getByRole('status').filter({hasText:'Select text to highlight it.'}).waitFor()
  // The same notice again, after the first has cleared, shows a fresh pill.
  await page.getByRole('status').filter({hasText:'Select text to highlight it.'}).waitFor({state:'detached'})
  await page.getByRole('button',{name:'Reading options'}).press('Enter'); await page.getByRole('button',{name:'Highlight selection'}).press('Enter')
  const pill = page.getByRole('status').locator('span',{hasText:'Select text to highlight it.'})
  await pill.waitFor()
  assert.equal(await pill.evaluate(s => getComputedStyle(s).opacity),'1')
  assert.equal((await idbRows(page,'annotations')).length,before)
  await back(page); await search.fill('Burnett'); await inspect(page); await open(page)
  await page.locator('iframe').first().waitFor()
  await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.body?.children.length > 0)
  await waitForRows(page,'progress','rows.some(p => p.words > 10000 && p.locations)')
  await page.getByText(/ · \d+%$/).waitFor()
  assert.equal(await page.locator('iframe').first().getAttribute('sandbox'),'allow-same-origin')
  // The cover and the first text page are both at location 0, so progress shows from the second text page.
  await page.getByRole('button',{name:'Next page'}).click(); await page.getByRole('button',{name:'Next page'}).click()
  await waitForRows(page,'progress','rows.some(p => p.words > 10000 && p.locations && p.fraction > 0)')
  await page.locator('iframe').first().evaluate(frame => {
    const doc = frame.contentDocument, range = doc.createRange(); range.selectNodeContents(doc.querySelector('p'))
    doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range)
  })
  await page.getByRole('toolbar',{name:'Highlight'}).waitFor()
  await page.getByRole('button',{name:/Highlight blue/}).click()
  await waitForRows(page,'annotations','rows.some(a => a.color === "blue" && a.location.cfi?.startsWith("epubcfi("))')
  await page.locator('.mark-blue').first().waitFor()
  await page.getByRole('button',{name:'Increase font size'}).click()
  await page.waitForTimeout(300); await page.locator('.mark-blue').first().waitFor()
  await options(page); await page.getByText('Bookmark this passage').click()
  await page.getByRole('status').filter({hasText:'bookmarked'}).waitFor()
  await back(page)
  assert((await idbRows(page,'positions')).some(row => row.location.cfi?.startsWith('epubcfi(')))
  console.log('PASS mixed import, deduplication, offline cold start, PDF and EPUB reading, resume and bookmarks')
  const [b1,b2] = (await idbRows(page,'books')).map(book => book.id)
  await seedRows(page,'sessions',[
    {book:b1,start:1_000_000,end:1_060_000,active:50_000,from:0,to:0.2,advanced:0.2},
    {book:b2,start:2_000_000,end:2_090_000,active:80_000,from:0.1,to:0.3,advanced:0.2}])
  await seedRows(page,'progress',[{id:b1,fraction:0.2,words:1000,updated:5,finished:777},{id:b2,fraction:0.3,updated:6}])
  await seedRows(page,'annotations',[
    {book:b1,location:{format:'pdf',page:2,fraction:0.5,text:'Little Lamb',offset:12},color:'yellow',note:'',where:'Page 2',order:0.1,created:3_000_000,updated:3_000_000},
    {book:b2,location:{format:'epub',cfi:'epubcfi(/6/4!/4/2,/1:0,/1:5)',text:'Secret'},color:'pink',note:'hi',where:'Chapter 1',order:0.2,created:4_000_000,updated:4_000_000}])
  const S = (await idbRows(page,'sessions')).length, A = (await idbRows(page,'annotations')).length
  assert(S >= 2 && A >= 2)
  await page.getByText('Library tools',{exact:false}).first().click()
  const download = page.waitForEvent('download')
  await page.getByText('Export backup',{exact:true}).click()
  const archive = join(outs,'backup.zip')
  await (await download).saveAs(archive)
  const restored = await context()
  await restored.page.locator('input[accept=".zip"]').setInputFiles(archive)
  await restored.page.getByRole('status').filter({hasText:'Backup restored.'}).waitFor()
  assert.equal((await idbRows(restored.page,'books')).length,2)
  assert.equal((await idbRows(restored.page,'marks')).length,2)
  assert.equal((await idbRows(restored.page,'sessions')).length,S)
  assert.equal((await idbRows(restored.page,'annotations')).length,A)
  const prog = await idbRows(restored.page,'progress')
  assert(prog.some(row => row.finished === 777))
  const restoredBooks = (await idbRows(restored.page,'books')).map(book => book.id)
  assert((await idbRows(restored.page,'sessions')).every(row => restoredBooks.includes(row.book)))
  assert((await idbRows(restored.page,'annotations')).some(row => row.location.offset === 12))
  await restored.page.locator('input[accept=".zip"]').setInputFiles(archive)
  await restored.page.waitForTimeout(200)
  assert.equal((await idbRows(restored.page,'files')).length,2)
  assert.equal((await idbRows(restored.page,'marks')).length,2)
  assert.equal((await idbRows(restored.page,'sessions')).length,S)
  assert.equal((await idbRows(restored.page,'annotations')).length,A)
  assert.equal((await idbRows(restored.page,'progress')).length,prog.length)
  const bad = new JSZip()
  bad.file('library.json',JSON.stringify({version:2,books:[],positions:[],bookmarks:[],progress:[],annotations:[],
    sessions:[{book:-1,start:5,end:1,active:0,from:0,to:0,advanced:0}]}))
  await writeFile(join(outs,'bad.zip'),await bad.generateAsync({type:'nodebuffer'}))
  await restored.page.locator('input[accept=".zip"]').setInputFiles(join(outs,'bad.zip'))
  await restored.page.getByRole('status').filter({hasText:'Invalid reading data in backup.'}).waitFor()
  assert.equal((await idbRows(restored.page,'sessions')).length,S)
  const v1 = new JSZip()
  v1.file('library.json',JSON.stringify({version:1,books:[],positions:[],bookmarks:[]}))
  await writeFile(join(outs,'v1.zip'),await v1.generateAsync({type:'nodebuffer'}))
  await restored.page.locator('input[accept=".zip"]').setInputFiles(join(outs,'v1.zip'))
  await restored.page.getByRole('status').filter({hasText:'Backup restored.'}).waitFor()
  console.log('PASS backup round trip and repeated restore')
  await ctx.close(); await restored.ctx.close()

  const touch = await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'})
  await touch.page.getByText('Explore sample shelf').click()
  await touch.page.waitForFunction(() => !!window.testScene?.getObjectByName('Book -1'))
  const anchor = await hit(touch.page,-1,'spine')
  let point = anchor
  await touch.page.touchscreen.tap(point.x,point.y)
  await touch.page.getByRole('button',{name:'Open book',exact:true}).waitFor()
  await touch.page.screenshot({path:join(outs,'touch-preview.png')})
  const cdp = await touch.ctx.newCDPSession(touch.page)
  point = await hit(touch.page,-1,'cover')
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+75,y:point.y+45}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  assert.equal(await touch.page.locator('canvas').count(),1)
  // Tap empty shelf to put the book back, then tap it out again: a fresh pick starts square.
  const corner0 = await touch.page.locator('canvas').first().boundingBox()
  await touch.page.touchscreen.tap(corner0.x + 8,corner0.y + 8)
  await touch.page.getByRole('button',{name:'Open book',exact:true}).waitFor({state:'detached'})
  await touch.page.waitForFunction(() => window.testScene.getObjectByName('Book -1').position.z < .3)
  point = await hit(touch.page,-1,'spine')
  await touch.page.touchscreen.tap(point.x,point.y)
  await touch.page.getByRole('button',{name:'Open book',exact:true}).waitFor()
  await touch.page.waitForFunction(() => window.testScene.getObjectByName('Book -1').position.z > 1.5)
  point = await hit(touch.page,-1,'cover')
  await touch.page.touchscreen.tap(point.x,point.y)
  await touch.page.locator('iframe').first().waitFor()
  await back(touch.page)
  await touch.page.waitForFunction(() => !!window.testScene?.getObjectByName('Book -1'))
  const restoredPoint = await hit(touch.page,-1,'spine')
  assert(Math.abs(restoredPoint.x - anchor.x) < 1)
  await touch.page.evaluate(() => window.testRenderer.getContext().getExtension('WEBGL_lose_context').loseContext())
  await touch.page.getByText('Book list',{exact:true}).waitFor()
  await touch.page.getByRole('button',{name:/Songs of Innocence William Blake/}).click()
  await touch.page.getByText('Introduction',{exact:true}).waitFor()
  console.log('PASS emulated touch selection, drag/open separation, cover activation, context-loss fallback')
  await touch.ctx.close()

  const night = await context({colorScheme:'dark'})
  assert.equal(await night.page.evaluate(() => document.documentElement.dataset.theme),'dark')
  assert.equal(await night.page.evaluate(() => getComputedStyle(document.body).backgroundColor),'rgb(14, 21, 18)')
  await night.page.getByRole('button',{name:/Library tools/}).click()
  await night.page.getByLabel('Theme').selectOption('light')
  await night.page.getByRole('button',{name:'Close library tools'}).click(); await night.page.reload()
  assert.equal(await night.page.evaluate(() => document.documentElement.dataset.theme),'light')
  assert.equal(await night.page.evaluate(() => getComputedStyle(document.body).backgroundColor),'rgb(238, 241, 236)')
  await night.page.getByRole('button',{name:/Library tools/}).click()
  await night.page.getByLabel('Theme').selectOption('system'); await night.page.getByRole('button',{name:'Close library tools'}).click()
  await night.ctx.close()
  console.log('PASS night mode follows the system, persists an explicit choice')

  const gallery = await context({reducedMotion:'reduce'})
  const cloth = ['#394f40','#8b523b','#344958','#76505a','#79603b','#41625a','#715240','#3f5638','#9b6b38','#9b6745']
  const long = 'The Extraordinary and Thoroughly Documented Account of a Very Long Voyage Across the Northern Seas and Back Again, Twice'
  const titles = [['A','Ann Lee'],['War and Peace','Leo Tolstoy'],[long,''],['Анна Каренина','Лев Толстой'],['東京物語','小津安二郎'],
    ['The Left Hand of Darkness','Ursula K. Le Guin'],['Notes',''],['Middlemarch','George Eliot'],['Beloved','Toni Morrison'],
    ['The Name of the Rose','Umberto Eco'],["If on a winter's night a traveler",'Italo Calvino'],['Dune','Frank Herbert']]
  assert.equal(long.length,120)
  await seedRows(gallery.page,'books',titles.map(([title,author],i) => ({id:i+1,title,author,color:cloth[i % cloth.length],added:i+1})))
  await gallery.page.reload(); await gallery.page.getByText('12 volumes',{exact:true}).waitFor()
  await gallery.page.waitForFunction(() => window.testRenderer?.info.memory.textures > 0); await gallery.page.waitForTimeout(300)
  await gallery.page.screenshot({path:join(outs,'covers-shelf.png')})
  let n = 0
  // Browse with the arrow keys until the caption names the book, take it out with Enter, put it back with Escape.
  const shelfKeys = stageOf(gallery.page)
  for (const title of ["If on a winter's night a traveler",'Notes','War and Peace']) {
    await shelfKeys.focus()
    for (let i = 0; i <= titles.length && await caption(gallery.page).filter({hasText:new RegExp('^' + title + '$')}).count() === 0; i++) await shelfKeys.press('ArrowRight')
    await shelfKeys.press('Enter'); await gallery.page.getByRole('button',{name:'Attach file',exact:true}).waitFor()   // fixtures have no file
    await gallery.page.waitForTimeout(300)
    await gallery.page.screenshot({path:join(outs,`cover-${++n}.png`)})
    await gallery.page.keyboard.press('Escape')
    await gallery.page.waitForFunction(() => document.activeElement?.getAttribute('aria-roledescription') === 'bookshelf')
  }
  assert.equal(n,3); assert.deepEqual(errors,[])
  await gallery.ctx.close()
  console.log('PASS generated cover gallery, screenshots in',outs)

  const large = await context({reducedMotion:'reduce'})
  await large.page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('shelfscape');r.onsuccess=()=>resolve(r.result) })
    const source = await (await fetch('/samples/songs.pdf')).blob()
    const artwork = await (await fetch('/art/alice.jpg')).blob()
    const tx = db.transaction(['books','files','art'],'readwrite')
    for(let i=1;i<=1000;i++) {
      tx.objectStore('books').add({id:i,title:'Test volume '+i,author:'Fixture',format:'pdf',color:'#475c47',added:i})
      tx.objectStore('files').add({id:i,blob:source})
      tx.objectStore('art').add({id:i,blob:artwork})
    }
    await new Promise(resolve => tx.oncomplete=resolve); db.close()
  })
  await large.page.reload(); await large.page.getByText('1000 volumes',{exact:true}).waitFor()
  await large.page.waitForFunction(() => window.testRenderer?.info.memory.textures > 0)
  const measured = [await metrics(large.page)]
  await large.page.evaluate(() => {
    window.frameIntervals = []
    let prev = performance.now()
    const record = now => { window.frameIntervals.push(now-prev); prev=now; if(window.frameIntervals.length<240) requestAnimationFrame(record) }
    requestAnimationFrame(record)
  })
  await large.page.mouse.move(510,430)
  for (let i=0;i<10;i++) {
    await large.page.mouse.wheel(1100,0); await large.page.waitForTimeout(120); measured.push(await metrics(large.page))
  }
  await large.page.mouse.move(2,2); await large.page.waitForTimeout(550)
  const idle = await metrics(large.page); await large.page.waitForTimeout(350)
  assert.equal((await metrics(large.page)).frames,idle.frames)
  assert(Math.max(...measured.map(m=>m.textures)) < 50)
  assert(Math.max(...measured.map(m=>m.meshes)) < 150)
  console.log('PASS 1,000-book shelf, peak meshes',Math.max(...measured.map(m=>m.meshes)),'peak textures',Math.max(...measured.map(m=>m.textures)),'idle frames',idle.frames)
  const stats = await large.page.evaluate(() => {
    const sorted=window.frameIntervals.slice(1).sort((a,b)=>a-b)
    return { medianMs: sorted[Math.floor(sorted.length/2)], p95Ms: sorted[Math.floor(sorted.length*.95)], heapMiB:Math.round(performance.memory.usedJSHeapSize/1048576) }
  })
  console.log('Headless Chromium, software WebGL',stats)
  for(let i=0;i<3;i++) {
    await inspect(large.page);await open(large.page);await large.page.getByText('Introduction',{exact:true}).waitFor()
    await back(large.page);await large.page.waitForFunction(()=>window.testRenderer?.info.memory.textures>0)
    assert((await metrics(large.page)).textures < 50)
  }
  await large.ctx.close()

  const dusk = await context({colorScheme:'dark'})
  await dusk.page.getByText('Explore sample shelf').click()
  await dusk.page.locator('input[type=search]').fill('Burnett'); await inspect(dusk.page); await open(dusk.page)
  await dusk.page.waitForFunction(() => {
    const body = document.querySelector('iframe')?.contentDocument?.body
    return body && getComputedStyle(body).color === 'rgb(233, 223, 207)'
  })
  await back(dusk.page)
  await dusk.page.locator('input[type=search]').fill('Blake'); await inspect(dusk.page); await open(dusk.page)
  await dusk.page.locator('.pdfPage canvas').waitFor()
  assert.match(await dusk.page.locator('.pdfPage canvas').evaluate(c => getComputedStyle(c).filter),/invert/)
  const nightMode = dusk.page.getByRole('button',{name:'Night mode'})
  assert.equal(await nightMode.getAttribute('aria-pressed'),'true')
  await nightMode.click()
  assert.equal(await dusk.page.evaluate(() => document.documentElement.dataset.theme),'light')
  await back(dusk.page)
  await dusk.page.getByRole('button',{name:/Library tools/}).click()
  assert.equal(await dusk.page.getByLabel('Theme').inputValue(),'light')
  await dusk.page.getByRole('button',{name:'Close library tools'}).click()
  await dusk.page.reload()
  assert.equal(await dusk.page.evaluate(() => document.documentElement.dataset.theme),'light')
  await dusk.page.evaluate(() => localStorage.removeItem('shelfscape-theme'))
  await dusk.ctx.close()
  console.log('PASS night mode in the reader: EPUB theme, PDF inversion, footer toggle persists')

  const timed = await context()
  await timed.page.getByText('Explore sample shelf').click()
  await timed.page.locator('input[type=search]').fill('Blake'); await inspect(timed.page); await open(timed.page)
  await timed.page.getByText('Piping down the valleys wild,',{exact:true}).waitFor()
  await timed.page.clock.install()
  await timed.page.getByRole('button',{name:'Next page'}).click()
  await timed.page.clock.fastForward(90_000)
  await timed.page.mouse.move(640,400); await timed.page.mouse.wheel(0,200)   // songs.pdf has two pages, so scroll instead of a second Next
  await timed.page.evaluate(() => {                     // tab hidden mid-session
    Object.defineProperty(document,'hidden',{value:true,configurable:true})
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitForRows(timed.page,'sessions','rows.length === 1')
  const [row] = await idbRows(timed.page,'sessions')
  assert.equal(row.book,-11); assert(row.active >= 90_000 && row.active < 100_000); assert(row.advanced > 0 && row.to > row.from)
  await timed.page.evaluate(() => { Object.defineProperty(document,'hidden',{value:false,configurable:true}) })
  await timed.ctx.close()
  console.log('PASS reading session timing, idle cap and save on hide')

  const statsCtx = await context()
  await statsCtx.page.getByText('Explore sample shelf').click()
  await statsCtx.page.getByRole('heading',{name:'Sample shelf'}).waitFor()
  const now = await statsCtx.page.evaluate(() => Date.now()), day = 86_400_000
  await seedRows(statsCtx.page,'sessions',[
    {book:-11,start:now-day,end:now-day+300_000,active:300_000,from:0,to:0.1,advanced:0.1},
    {book:-11,start:now-60_000,end:now,active:600_000,from:0.1,to:0.3,advanced:0.2}])
  await seedRows(statsCtx.page,'progress',[{id:-11,fraction:0.4,words:3000,updated:now}])
  const sp = statsCtx.page, searchBox = sp.locator('input[type=search]')
  await searchBox.fill('Secret Garden')
  await stageOf(sp).press('ArrowRight')
  await caption(sp).filter({hasText:'Secret Garden'}).waitFor(); await sp.waitForTimeout(300)
  assert.equal(await sp.getByText(/% read/).count(),0)
  await searchBox.fill('Blake')
  await stageOf(sp).press('ArrowRight')
  await sp.getByText(/\d+% read · /).waitFor()
  await sp.keyboard.press('Enter')
  await sp.getByRole('button',{name:'Open book',exact:true}).waitFor()
  await sp.getByText(/% read · \d+ min/).waitFor()
  await sp.keyboard.press('Escape')
  await statsCtx.page.getByRole('button',{name:'Reading stats'}).click()
  await statsCtx.page.getByRole('heading',{name:'Reading stats'}).waitFor()
  assert.equal(await statsCtx.page.evaluate(() => !!document.activeElement?.closest('section')?.querySelector('h1')),true)
  const dayList = statsCtx.page.getByRole('list',{name:'Reading time per day'})
  await dayList.getByRole('listitem').filter({hasText:new Date().toLocaleDateString(undefined,{month:'short',day:'numeric'})}).filter({hasText:/ \d+ min/}).waitFor({state:'attached'})
  await statsCtx.page.locator('strong',{hasText:'Songs of Innocence'}).waitFor()
  const text = await statsCtx.page.locator('body').innerText()
  assert.match(text,/Songs of Innocence/); assert.match(text,/Completed\s*0 of 1 book\b/); assert.match(text,/\d+ wpm/)
  assert.equal(await statsCtx.page.locator('[aria-label^="'+new Date().toLocaleDateString('en-CA')+':"]').count(),1)
  await back(statsCtx.page)
  await statsCtx.page.getByRole('heading',{name:'Sample shelf'}).waitFor()
  await statsCtx.ctx.close()
  console.log('PASS stats view')

  // Bookmarks as in major readers: a one-tap ribbon per page, many per book, a list to jump to or delete them.
  const marksCtx = await context({reducedMotion:'reduce'}), mp = marksCtx.page
  await mp.getByText('Explore sample shelf').click()
  await mp.locator('input[type=search]').fill('Blake'); await inspect(mp); await open(mp)
  await mp.getByText('Piping down the valleys wild,',{exact:true}).waitFor()
  const ribbon = mp.getByRole('button',{name:'Bookmark page'})
  const pressedIs = v => mp.waitForFunction(v => document.querySelector('[aria-label="Bookmark page"]')?.getAttribute('aria-pressed') === v,v)
  await pressedIs('false'); await ribbon.click()
  await mp.getByRole('status').filter({hasText:'Page bookmarked.'}).waitFor(); await pressedIs('true')
  assert.equal(await mp.locator('[class*=ribbon]').count(),1)
  await mp.getByRole('button',{name:'Next page'}).click(); await mp.getByText('The Lamb',{exact:true}).waitFor()
  await pressedIs('false'); assert.equal(await mp.locator('[class*=ribbon]').count(),0)
  await ribbon.click(); await waitForRows(mp,'marks','rows.length === 2')
  const marked = await idbRows(mp,'marks')
  assert.deepEqual(marked.map(m => m.where).sort(),['Page 1','Page 2']); assert(marked.every(m => m.book === -11 && m.excerpt && m.created > 0))
  await mp.getByRole('button',{name:'Reading options'}).click(); await mp.getByRole('button',{name:'Bookmarks 2'}).click()
  const notesPanel = mp.getByRole('complementary',{name:'Notes & highlights'})
  assert.equal(await notesPanel.getByRole('button',{name:'Bookmarks 2'}).getAttribute('aria-pressed'),'true')
  await notesPanel.locator('li').first().getByRole('button').first().click()   // the excerpt jumps to its page
  await mp.getByText('Piping down the valleys wild,',{exact:true}).waitFor(); await pressedIs('true')
  await notesPanel.getByRole('button',{name:'Delete bookmark, Page 1'}).click()
  await waitForRows(mp,'marks','rows.length === 1 && rows[0].where === "Page 2"'); await pressedIs('false')
  await mp.getByRole('button',{name:'Next page'}).click(); await pressedIs('true')
  await ribbon.click(); await mp.getByRole('status').filter({hasText:'Bookmark removed.'}).waitFor()
  await waitForRows(mp,'marks','rows.length === 0')
  await marksCtx.ctx.close()
  console.log('PASS bookmarks: page toggle and ribbon, many per book, list jump and delete')

  const motion = await context()
  await motion.page.getByText('Explore sample shelf').click()
  await motion.page.mouse.move(0,0)
  await motion.page.waitForFunction(()=>!!window.testScene?.getObjectByName('Book -1'))
  // The shelf spins on its own (no pause button), and holds still under the pointer.
  const spineX = () => motion.page.evaluate(() => window.testScene.getObjectByName('Book -1').position.x)
  const initialX = await spineX(); await motion.page.waitForTimeout(1000)
  const spun = initialX - await spineX()
  assert(spun > .15 && spun < .6,'auto spin ' + spun)
  assert.equal(await motion.page.getByRole('button',{name:/pause|play/i}).count(),0)
  const z = id => motion.page.evaluate(id => window.testScene.getObjectByName('Book ' + id).position.z,id)
  const click = async id => { const p = await hit(motion.page,id,'spine'); await motion.page.mouse.click(p.x,p.y) }
  const hitPoint = await hit(motion.page,-2,'spine')
  await motion.page.mouse.move(hitPoint.x,hitPoint.y)
  // Hover shows the full title under the shelf, author on the next line, and never pulls the book out.
  await caption(motion.page).filter({hasText:'Alice'}).waitFor()
  await motion.page.locator('section p',{hasText:'Lewis Carroll'}).waitFor()
  await motion.page.waitForTimeout(500)
  assert(await z(-2) < .01)
  // The caption stays while the pointer travels down to its actions.
  const openLink = await motion.page.getByRole('button',{name:'Open book',exact:true}).boundingBox()
  await motion.page.mouse.move(hitPoint.x,openLink.y + openLink.height / 2,{steps:8})
  await motion.page.mouse.move(openLink.x + openLink.width / 2,openLink.y + openLink.height / 2,{steps:8})
  await caption(motion.page).filter({hasText:'Alice'}).waitFor()
  await click(-2)
  await motion.page.getByRole('button',{name:'Open book'}).waitFor()
  // Let the book finish sliding out so it is not in front of the next spine.
  await motion.page.waitForFunction(() => Math.abs(window.testScene.getObjectByName('Book -2').position.x) < .001)
  await click(-3)
  await motion.page.waitForTimeout(150)
  assert((await z(-3)) < .05); assert((await z(-2)) > .05)
  // react-spring steps at most 64 ms a frame, so on slow software WebGL wait for the end state, not a fixed time.
  const settled = (pred,arg) => motion.page.waitForFunction(pred,arg,{timeout:15000})
  // -3 must also finish sliding to centre, or it still covers the -4 spine clicked next.
  await settled(() => { const [a,b] = ['Book -2','Book -3'].map(n => window.testScene.getObjectByName(n).position); return a.z < .01 && b.z > 1.5 && Math.abs(b.x) < .001 })
  assert.equal(await caption(motion.page).filter({hasText:'Pride and Prejudice'}).count(),1)
  const [p4,p5] = [await hit(motion.page,-4,'spine'),await hit(motion.page,-5,'spine')]
  await motion.page.mouse.click(p4.x,p4.y); await motion.page.mouse.click(p5.x,p5.y)
  await settled(() => [-1,-2,-3,-4,-5].map(id => window.testScene.getObjectByName('Book ' + id).position.z > 1.5 ? 'out' : window.testScene.getObjectByName('Book ' + id).position.z < .3 ? 'in' : '').join() === 'in,in,in,in,out')
  // Escape during a pending swap cancels it: no book comes out.
  await click(-3); await motion.page.keyboard.press('Escape')
  const outCount = () => window.testScene.children.filter(o => o.name.startsWith('Book ') && o.position.z > .3).length
  await settled(`(${outCount})() === 0`)
  await motion.page.waitForTimeout(1000)   // longer than the swap delay, so a cancelled swap would have fired
  assert.equal(await motion.page.evaluate(outCount),0)
  // With the first book centred (Home), the last one sits right beside it on the left.
  await stageOf(motion.page).press('Home')
  await settled(() => Math.abs(window.testScene.getObjectByName('Book -1')?.position.x) < .05)
  const gap = await motion.page.evaluate(() => {
    const first = window.testScene.getObjectByName('Book -1')
    return Math.min(...window.testScene.children.filter(o => o.name.startsWith('Book ') && o.position.x < first.position.x).map(o => first.position.x - o.position.x))
  })
  assert(gap < 1,'loop gap '+gap)
  // Arrow keys browse (the book lifts, it does not leave), Enter takes it out, then the keys turn it.
  await motion.page.mouse.move(0,0)
  const resting = await motion.page.evaluate(() => window.testScene.getObjectByName('Book -2').position.y)
  await stageOf(motion.page).press('ArrowRight')
  await caption(motion.page).filter({hasText:'Alice'}).waitFor()
  await settled(y => { const p = window.testScene.getObjectByName('Book -2').position; return p.z < .3 && p.y > y + .05 },resting)
  await motion.page.keyboard.press('Enter')
  await motion.page.waitForFunction(() => document.activeElement?.textContent === 'Open book')
  // Software WebGL can take well over 100 ms for a frame, so wait for each key's rotation to reach the scene.
  const twist = () => motion.page.evaluate(() => window.testScene.getObjectByName('cover').parent.parent.quaternion.toArray())
  const rotate = async key => {
    const before = await twist()
    await motion.page.keyboard.press(key)
    await motion.page.waitForFunction(before => window.testScene.getObjectByName('cover').parent.parent.quaternion.toArray().some((v,i) => v !== before[i]),before)
    return twist()
  }
  await motion.page.waitForFunction(() => !!window.testScene.getObjectByName('cover'))
  const yaw=await rotate('ArrowRight'), pitch=await rotate('ArrowUp'), roll=await rotate('q')
  assert.notDeepEqual(yaw,pitch);assert.notDeepEqual(pitch,roll)
  const session=await motion.ctx.newCDPSession(motion.page)
  const install=await session.send('Page.getInstallabilityErrors')
  // Temporary test profiles count as incognito in branded Chrome; that is not an app defect.
  assert.deepEqual(install.installabilityErrors.filter(e => e.errorId !== 'in-incognito'),[])
  await motion.ctx.close()
  console.log('PASS auto-spin without a pause button, hover caption, click to inspect, sequenced swap, looping shelf, keyboard browsing and rotations, Chrome installation criteria')

  const shelfCtx = await context(), sh = shelfCtx.page
  const longTitle = 'The Remarkably Long and Winding Story of a Title That Keeps Going Well Past the Edge of Any Reasonable Shelf'
  await seedRows(sh,'books',Array.from({length:30},(_,i) => ({id:i+1,title:i === 0 || i === 29 ? longTitle + ' ' + (i + 1) : 'Volume ' + (i + 1),
    author:'Author ' + (i + 1),color:'#475c47',added:i + 1})))
  await sh.reload(); await sh.getByText('30 volumes',{exact:true}).waitFor()
  // Create and fill a shelf; membership survives a reload.
  await sh.getByRole('button',{name:'New shelf'}).click()
  await sh.getByLabel('Shelf name').fill('Tech'); await sh.keyboard.press('Enter')
  const editor = sh.getByRole('dialog',{name:'Edit Tech'}); await editor.waitFor()
  for (const t of ['Volume 2','Volume 3','Volume 4']) await editor.getByRole('checkbox',{name:new RegExp('^' + t + ' ')}).check()
  await editor.getByRole('button',{name:'Done'}).click()
  await sh.getByText('3 volumes',{exact:true}).waitFor()
  assert.equal(await sh.getByRole('button',{name:'Tech',exact:true}).getAttribute('aria-current'),'page')
  await sh.reload(); await sh.getByRole('button',{name:'Tech',exact:true}).click(); await sh.getByText('3 volumes',{exact:true}).waitFor()
  assert.deepEqual((await idbRows(sh,'shelves')).map(s => [s.name,s.books.sort((a,b) => a - b)]),[['Tech',[2,3,4]]])
  // Switching shelves: books not on the new shelf tip off and fall away, books on both slide together, newcomers drop in.
  // Each shelf keeps its browsing position. The pointer stays over the shelf (switching by script), which holds the auto-spin.
  await sh.getByRole('button',{name:'All books',exact:true}).click(); await sh.getByText('30 volumes',{exact:true}).waitFor()
  await sh.waitForFunction(() => window.testScene?.children.filter(o => o.name.startsWith('Book ')).length > 10)
  const shelfBox = await sh.locator('canvas').first().boundingBox()
  await sh.mouse.move(shelfBox.x + shelfBox.width / 2,shelfBox.y + 20); await sh.mouse.wheel(700,0); await sh.waitForTimeout(500)
  const placed = () => sh.evaluate(() => window.testScene.children.filter(o => o.name.startsWith('Book ')).map(o => o.name + ':' + o.position.x.toFixed(2)).sort().join())
  const browsed = await placed()
  const switchTo = name => sh.evaluate(name => [...document.querySelectorAll('nav[aria-label=Shelves] button')].find(b => b.textContent === name).click(),name)
  // A book on screen (nearest the centre): ones rendered just past the edges are removed at once rather than animated.
  const leaver = await sh.evaluate(() => window.testScene.children.filter(o => o.name.startsWith('Book ') && ![2,3,4].includes(+o.name.slice(5)))
    .sort((a,b) => Math.abs(a.position.x) - Math.abs(b.position.x)).map(o => +o.name.slice(5))[0])
  await switchTo('Tech')
  // The fall's shape is unit tested (tests/unit/tween.test.ts). Here: the leaving book is handed over to the fall, never just
  // removed, then leaves the scene. Polling for a mid-air pose is unreliable where one software WebGL frame outlasts the fall.
  await sh.waitForFunction(n => window.testScene.getObjectByName('Book ' + n)?.userData.falling === true,leaver,{timeout:15000})
  await sh.waitForFunction(n => !window.testScene.getObjectByName('Book ' + n),leaver,{timeout:15000})
  await sh.getByText('3 volumes',{exact:true}).waitFor(); await sh.waitForTimeout(300)
  await switchTo('All books'); await sh.waitForTimeout(1800)   // newcomers land, the slid books settle
  assert.equal(await placed(),browsed)
  // Reduced motion switches instantly: the leaving books are gone at once.
  await sh.emulateMedia({reducedMotion:'reduce'}); await sh.waitForTimeout(150)
  await switchTo('Tech')
  await sh.waitForFunction(n => !window.testScene.getObjectByName('Book ' + n),leaver,{timeout:3000})
  await sh.getByRole('button',{name:'All books',exact:true}).click(); await sh.getByText('30 volumes',{exact:true}).waitFor()
  // Keyboard only: Tab from search reaches the shelf, arrows browse, Enter takes a book out, Escape puts it back, Tab reaches rename.
  const activeLabel = () => sh.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await sh.locator('input[type=search]').focus(); await sh.keyboard.press('Tab'); await sh.keyboard.press('Tab')
  assert.equal(await activeLabel(),'All books, 30 books')
  await sh.keyboard.press('Home'); await caption(sh).filter({hasText:longTitle + ' 30'}).waitFor()
  await sh.keyboard.press('ArrowRight'); await caption(sh).filter({hasText:/^Volume 29$/}).waitFor()
  await sh.keyboard.press('Enter')
  await sh.waitForFunction(() => document.activeElement?.textContent === 'Attach file')   // seeded books have no file yet
  await sh.keyboard.press('Escape')
  await sh.waitForFunction(() => document.activeElement?.getAttribute('aria-roledescription') === 'bookshelf')
  await sh.keyboard.press('Tab')
  const renameLabel = await activeLabel()
  assert.match(renameLabel,/^Rename /)
  // Rename inline: Escape cancels, Save persists across caption, search and reload; the original filename is untouched.
  await sh.keyboard.press('Enter')
  const titleInput = sh.getByLabel('Book title'); await titleInput.waitFor()
  assert.equal(await titleInput.inputValue(),renameLabel.slice(7))
  await sh.keyboard.press('Escape'); await titleInput.waitFor({state:'detached'})
  assert.equal(await activeLabel(),renameLabel)
  await sh.keyboard.press('Enter'); await titleInput.fill('A Better Title')
  await sh.getByRole('button',{name:'Cancel'}).waitFor(); await sh.keyboard.press('Enter')
  await caption(sh).filter({hasText:'A Better Title'}).waitFor()
  await waitForRows(sh,'books','rows.some(b => b.title === "A Better Title")')
  await sh.reload(); await sh.locator('input[type=search]').fill('better'); await sh.getByText('1 volume',{exact:true}).waitFor()
  await sh.locator('input[type=search]').fill('')
  // Long titles at both ends of a shelf wrap in full under it, on desktop and phone widths.
  await sh.getByRole('button',{name:'Tech',exact:true}).click(); await sh.getByRole('button',{name:'Edit shelf'}).click()
  await editor.getByLabel('Filter books').fill('remarkably')
  for (const box of await editor.getByRole('checkbox').all()) await box.check()
  await editor.getByRole('button',{name:'Done'}).click(); await sh.getByText('5 volumes',{exact:true}).waitFor()
  await sh.waitForFunction(() => !!window.testScene?.getObjectByName('Book 30') && !!window.testScene.getObjectByName('Book 1'))
  const noOverflow = () => sh.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  for (const id of [30,1]) {
    const p = await hit(sh,id,'spine'); await sh.mouse.move(p.x,p.y)
    await caption(sh).filter({hasText:longTitle + ' ' + id}).waitFor()
    const box = await caption(sh).boundingBox(), width = sh.viewportSize().width
    assert(box.x >= 0 && box.x + box.width <= width && box.height > 60,'caption box ' + JSON.stringify(box)); assert(await noOverflow())
  }
  await sh.screenshot({path:join(outs,'long-title-desktop.png')})
  await sh.setViewportSize({width:390,height:844})
  for (const [keyName,id] of [['Home',30],['End',1]]) {
    await stageOf(sh).press(keyName)
    await caption(sh).filter({hasText:longTitle + ' ' + id}).waitFor()
    const box = await caption(sh).boundingBox()
    assert(box.x >= 0 && box.x + box.width <= 390,'phone caption ' + JSON.stringify(box)); assert(await noOverflow())
  }
  await sh.screenshot({path:join(outs,'long-title-phone.png')})
  await sh.setViewportSize({width:1280,height:800})
  // Importing on a shelf adds the book to it; a PDFDrive tail is offered for removal and the filename is kept.
  const bare = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
  await importBooks(sh,[{name:'Atomic Habits ( PDFDrive.com ).pdf',mimeType:'application/pdf',buffer:bare}])
  await sh.getByRole('button',{name:'Rename to “Atomic Habits”'}).click()
  await waitForRows(sh,'books','rows.some(b => b.title === "Atomic Habits" && b.filename === "Atomic Habits ( PDFDrive.com ).pdf")')
  await sh.getByText('6 volumes',{exact:true}).waitFor()
  // Shelves travel in backups, remapped to the restored book ids, and restoring twice adds no duplicates.
  await sh.getByRole('button',{name:/Library tools/}).click()
  const shelfDownload = sh.waitForEvent('download')
  await sh.getByText('Export backup',{exact:true}).click()
  const shelfArchive = join(outs,'shelves.zip'); await (await shelfDownload).saveAs(shelfArchive)
  const fresh = await context()
  for (let i = 0; i < 2; i++) {
    await fresh.page.locator('input[accept=".zip"]').setInputFiles(shelfArchive)
    await fresh.page.getByRole('status').filter({hasText:'Backup restored.'}).waitFor(); await fresh.page.waitForTimeout(200)
  }
  const restoredShelves = await idbRows(fresh.page,'shelves'), restoredBookIds = new Set((await idbRows(fresh.page,'books')).map(b => b.id))
  assert.deepEqual(restoredShelves.map(s => [s.name,s.books.length]),[['Tech',6]])
  assert(restoredShelves[0].books.every(id => restoredBookIds.has(id)))
  await fresh.ctx.close(); await shelfCtx.ctx.close()
  console.log('PASS custom shelves, drop-and-slide switch and restored position, reduced motion, keyboard-only browsing, rename, long titles at both edges, PDFDrive suggestion, shelf backup')
  assert.deepEqual(errors,[])
  console.log('Browser checks passed. Artifacts in',outs)
} finally { await browser.close() }
