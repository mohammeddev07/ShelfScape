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
const inspect = page => page.getByRole('button',{ name:/^Inspect / }).click()
const open = page => page.getByRole('button',{name:'Open book',exact:true}).click()
const back = page => page.getByRole('button',{name:'‹ Library'}).click()
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
  await page.locator('.textLayer').evaluate(layer => {
    const text = [...layer.querySelectorAll('span')].find(span => span.textContent.includes('Little Lamb, who made thee?'))
    const range = document.createRange(); range.selectNodeContents(text)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
  })
  await options(page);await page.getByText('Bookmark this passage').click()
  await page.getByRole('status').filter({hasText:'bookmarked'}).waitFor()
  await back(page); await inspect(page); await open(page)
  await page.getByText('The Lamb',{exact:true}).waitFor()
  const savedPdf = (await idbRows(page,'bookmarks'))[0].location
  assert.equal(savedPdf.page,2)
  assert.match(savedPdf.text,/Little Lamb/)
  await back(page); await search.fill('Burnett'); await inspect(page); await open(page)
  await page.locator('iframe').first().waitFor()
  await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.body?.children.length > 0)
  await waitForRows(page,'progress','rows.some(p => p.words > 10000 && p.locations)')
  await page.getByText(/\d+%/).first().waitFor()
  assert.equal(await page.locator('iframe').first().getAttribute('sandbox'),'allow-same-origin')
  // The cover and the first text page are both at location 0, so progress shows from the second text page.
  await page.getByRole('button',{name:'Next page'}).click(); await page.getByRole('button',{name:'Next page'}).click()
  await waitForRows(page,'progress','rows.some(p => p.words > 10000 && p.locations && p.fraction > 0)')
  await page.getByRole('button',{name:'Increase font size'}).click()
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
  assert.equal((await idbRows(restored.page,'bookmarks')).length,2)
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
  await touch.page.getByRole('button',{name:'Reset view'}).click()
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
  assert.equal(await night.page.evaluate(() => getComputedStyle(document.body).backgroundColor),'rgb(29, 26, 22)')
  await night.page.getByRole('button',{name:/Library tools/}).click()
  await night.page.getByLabel('Theme').selectOption('light')
  await night.page.getByRole('button',{name:'Close library tools'}).click(); await night.page.reload()
  assert.equal(await night.page.evaluate(() => document.documentElement.dataset.theme),'light')
  assert.equal(await night.page.evaluate(() => getComputedStyle(document.body).backgroundColor),'rgb(247, 242, 232)')
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
  // Newest first on the shelf, and Next spine does not wrap, so visit in shelf order.
  for (const title of ["If on a winter's night a traveler",'Notes','War and Peace']) {
    const target = gallery.page.getByRole('button',{name:'Inspect ' + title,exact:true})
    for (let i = 0; i < titles.length && !await target.count(); i++) await gallery.page.getByRole('button',{name:'Next spine'}).click()
    await target.click(); await gallery.page.getByRole('button',{name:'Back to shelf'}).waitFor()
    await gallery.page.waitForTimeout(300)
    await gallery.page.screenshot({path:join(outs,`cover-${++n}.png`)})
    await gallery.page.getByRole('button',{name:'Back to shelf'}).click()
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
  await statsCtx.page.getByRole('button',{name:'Reading stats'}).click()
  await statsCtx.page.getByRole('heading',{name:'Reading stats'}).waitFor()
  await statsCtx.page.getByText('Songs of Innocence').waitFor()
  const text = await statsCtx.page.locator('body').innerText()
  assert.match(text,/Songs of Innocence/); assert.match(text,/Completed\s*0 of 1 books/); assert.match(text,/\d+ wpm/)
  assert.equal(await statsCtx.page.locator('[aria-label^="'+new Date().toLocaleDateString('en-CA')+':"]').count(),1)
  await back(statsCtx.page)
  await statsCtx.page.getByRole('heading',{name:'Sample shelf'}).waitFor()
  await statsCtx.ctx.close()
  console.log('PASS stats view')

  const motion = await context()
  await motion.page.getByText('Explore sample shelf').click()
  await motion.page.mouse.move(0,0)
  const spineX = () => motion.page.evaluate(() => window.testScene.getObjectByName('Book -1').position.x)
  await motion.page.waitForFunction(()=>!!window.testScene?.getObjectByName('Book -1'))
  const initialX = await spineX()
  await motion.page.waitForTimeout(650)
  assert((await spineX()) < initialX)
  const hitPoint = await hit(motion.page,-2,'spine')
  await motion.page.mouse.move(hitPoint.x,hitPoint.y)
  await motion.page.getByRole('button',{name:'Open book'}).waitFor()
  await motion.page.waitForTimeout(500)
  const hoverX = await spineX()
  await motion.page.waitForTimeout(320)
  assert.equal(await spineX(),hoverX)
  await motion.page.getByRole('button',{name:'Back to shelf'}).click()
  await motion.page.getByRole('button',{name:/^Inspect /}).focus()
  await motion.page.keyboard.press('ArrowRight');await motion.page.keyboard.press('Enter')
  const rotate = async key => {
    await motion.page.keyboard.press(key);await motion.page.waitForTimeout(100)
    return motion.page.evaluate(() => {
      const book=window.testScene.getObjectByName('cover').parent.parent
      return book.quaternion.toArray()
    })
  }
  const yaw=await rotate('ArrowRight'), pitch=await rotate('ArrowUp'), roll=await rotate('q')
  assert.notDeepEqual(yaw,pitch);assert.notDeepEqual(pitch,roll)
  const session=await motion.ctx.newCDPSession(motion.page)
  const install=await session.send('Page.getInstallabilityErrors')
  // Temporary test profiles count as incognito in branded Chrome; that is not an app defect.
  assert.deepEqual(install.installabilityErrors.filter(e => e.errorId !== 'in-incognito'),[])
  await motion.ctx.close()
  console.log('PASS automatic movement, pause on hover, keyboard rotations, Chrome installation criteria')
  assert.deepEqual(errors,[])
  console.log('Browser checks passed. Artifacts in',outs)
} finally { await browser.close() }
