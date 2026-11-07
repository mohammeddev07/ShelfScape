import ePub, { EpubCFI, type Contents, type Location as EpubLocation, type NavItem } from 'epubjs'
import type { ReaderAdapter, ReaderInput } from './adapter'
import type { Location } from '../db'
import { countWords } from '../stats/core'

// Installed before epub.js serializes a chapter into its script-disabled iframe.
function secureChapter(doc: Document) {
  doc.querySelectorAll('script,iframe,frame,object,embed,form,meta[http-equiv],link[rel="preload"],link[rel="prefetch"]').forEach(el => el.remove())
  for (const element of doc.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      if (/^on/i.test(attr.name) || ['href','src','xlink:href','action','poster'].includes(attr.name) &&
        /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(attr.value.trim()) && !attr.value.startsWith('data:image/')) element.removeAttribute(attr.name)
    }
  }
  const head = doc.querySelector('head')
  if (!head) throw new Error('The chapter has no document head.')
  const policy = doc.createElementNS('http://www.w3.org/1999/xhtml','meta')
  policy.setAttribute('http-equiv','Content-Security-Policy')
  policy.setAttribute('content',"default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src blob: data:; form-action 'none'")
  head.prepend(policy)
}
export async function openEpub(input: ReaderInput): Promise<ReaderAdapter> {
  const { element,signal,change } = input
  const book = ePub({ replacements:'blobUrl' })
  let opened = false, font = 100, last: Location | undefined
  const cleanup = () => { if (opened) book.destroy() }
  signal.addEventListener('abort',cleanup,{ once:true })
  try {
    await book.open(await input.file.arrayBuffer(),'binary')
    await book.ready
    opened = true
    signal.throwIfAborted()
    book.spine.hooks.content.register(secureChapter)
    const rendition = book.renderTo(element,{ width:'100%',height:'100%',spread:'none',flow:'paginated',allowScriptedContent:false })
    const contents: {title:string;target:string}[] = []
    function flatten(items: NavItem[]) {
      for (const item of items) {
        if (item.href && !/^(?:[a-z]+:|\/\/)/i.test(item.href)) contents.push({ title:item.label.trim(),target:item.href })
        if (item.subitems) flatten(item.subitems)
      }
    }
    flatten(book.navigation.toc)
    rendition.themes.default({ body:{ color:'#33291f !important',background:'transparent !important','font-family':'Georgia,serif !important',
      'line-height':'1.65 !important' },'a':{color:'#924324 !important'} })
    rendition.themes.fontSize('100%')
    rendition.hooks.content.register((chapter: Contents) => {
      chapter.document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault(); (e.key === 'ArrowRight' ? rendition.next() : rendition.prev()).catch(input.error)
        }
      })
      const frame = chapter.window.frameElement
      frame?.setAttribute('title',chapter.document.title || 'Book chapter')
    })
    const sections = (book.spine as unknown as { length: number }).length, cfi = new EpubCFI()
    // The last TOC entry in this section whose anchor starts at or before the page.
    // ponytail: assumes TOC and spine hrefs share a directory; resolve both against the package if a book differs.
    function chapter({ index,href,cfi:start }: EpubLocation['start']) {
      const view = (rendition.getContents() as unknown as Contents[]).find(c => c.sectionIndex === index)
      let title = ''
      for (const item of contents) {
        const [path,id] = item.target.split('#')
        if (path !== href) continue
        const anchor = id && view?.document.getElementById(id)
        if (title && !(anchor && view && cfi.compare(view.cfiFromNode(anchor),start) <= 0)) break
        title = item.title
      }
      return title || 'Section ' + (index + 1)
    }
    let current: EpubLocation | undefined
    const relocated = (location: EpubLocation) => {
      if (signal.aborted || !location.start?.cfi) return
      const { start } = location
      current = location; last = { format:'epub',cfi:start.cfi }
      change(last,{ label:'Section ' + (start.index + 1) + ' · ' + start.displayed.page + ' / ' + start.displayed.total,
        first:location.atStart,last:location.atEnd,contents,where:chapter(start),
        progress:book.locations.length() ? book.locations.percentageFromCfi(start.cfi) : (start.index + (start.displayed.page - 1) / start.displayed.total) / sections })
    }
    rendition.on('relocated',relocated)
    rendition.on('displayError',input.error)
    if (input.locations) book.locations.load(input.locations)
    await rendition.display(input.saved?.format === 'epub' ? input.saved.cfi : undefined)
    signal.throwIfAborted()
    return {
      step: n => n > 0 ? rendition.next() : rendition.prev(),
      async resizeText(n) {
        const anchor = last?.format === 'epub' && last.cfi
        font = Math.min(180,Math.max(75,font + 10 * n))
        rendition.themes.fontSize(font + '%')
        if (anchor) await rendition.display(anchor)
      },
      async jump(to) { if (typeof to === 'string') await rendition.display(to); else if (to.format === 'epub') await rendition.display(to.cfi) },
      location(selected) {
        if (selected) for (const content of rendition.getContents() as unknown as Contents[]) {
          const selection = content.window.getSelection()
          if (selection && !selection.isCollapsed && selection.rangeCount) return {
            format:'epub',cfi:content.cfiFromRange(selection.getRangeAt(0)),text:selection.toString().slice(0,512) }
        }
        return last
      },
      async measure(stop) {
        if (!book.locations.length()) await book.locations.generate(1000)
        let words = 0
        for (let n = 0; n < sections; n++) {
          stop.throwIfAborted()
          const section = book.spine.get(n)
          await section.load(book.load.bind(book))
          words += countWords(section.document.body?.textContent ?? '')
          section.unload()
          await new Promise(r => setTimeout(r))
        }
        stop.throwIfAborted()
        if (current) relocated(current)
        return { words,locations:book.locations.save() }
      },
    }
  } catch (error) { cleanup(); throw error }
}
