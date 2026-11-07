import { TextLayer, type RenderTask } from 'pdfjs-dist'
import { loadPdf } from './pdfDocument'
import type { Paint, ReaderAdapter, ReaderInput } from './adapter'
import type { Location } from '../db'
import { countWords } from '../stats/core'
import { COLORS, findQuote } from '../annotations/core'
import './pdf.css'

export async function openPdf(input: ReaderInput): Promise<ReaderAdapter> {
  const { element,signal } = input
  const task = loadPdf(await input.file.arrayBuffer())
  let render: RenderTask | undefined, layer: TextLayer | undefined, observer: ResizeObserver | undefined
  let generation = 0, drawing = true, marks: Paint[] = []
  const stop = () => { generation++; render?.cancel(); layer?.cancel(); observer?.disconnect(); void task.destroy() }
  signal.addEventListener('abort',stop,{ once:true })
  if (signal.aborted) { stop(); signal.throwIfAborted() }
  const doc = await task.promise
  const saved = input.saved?.format === 'pdf' ? input.saved : undefined
  let page = Math.min(doc.numPages,Math.max(1,saved?.page || 1)), zoom = 1, fraction = saved?.fraction ?? 0
  const location = (selected = false): Location => {
    const selection = selected ? window.getSelection() : null
    let anchor = fraction
    if (selection?.rangeCount && !selection.isCollapsed && element.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0), rect = range.getBoundingClientRect(), before = document.createRange()
      anchor = Math.min(1,Math.max(0,(element.scrollTop + rect.top - element.getBoundingClientRect().top) / Math.max(1,element.scrollHeight)))
      // Same string textNodes() builds: the layer's text nodes in order.
      before.setStart(element.querySelector('.textLayer')!,0); before.setEnd(range.startContainer,range.startOffset)
      return { format:'pdf',page,fraction:anchor,text:selection.toString().slice(0,512),offset:before.toString().length }
    }
    return { format:'pdf',page,fraction:anchor }
  }
  const report = () => input.change(location(),{ label:page + ' / ' + doc.numPages,first:page === 1,last:page === doc.numPages,contents:[],
    progress:(page - 1 + fraction) / doc.numPages,where:'Page ' + page })
  const onScroll = () => { if (!drawing && !signal.aborted) { fraction = element.scrollTop / Math.max(1,element.scrollHeight); report() } }
  element.addEventListener('scroll',onScroll,{ signal })
  // One range per text-layer node the quote covers, so painting gets text boxes only, never span boxes too.
  function rangeFor(quote: string, offset?: number): Range[] {
    const walker = document.createTreeWalker(element.querySelector('.textLayer')!,NodeFilter.SHOW_TEXT)
    const nodes: {node:Node; offset:number}[] = []
    let source = ''
    while (walker.nextNode()) {
      nodes.push({node:walker.currentNode,offset:source.length})
      source += walker.currentNode.textContent || ''
    }
    let start = findQuote(source,quote,offset), end = start + quote.length
    if (start < 0) {
      // A selection's text has line breaks the layer lacks, so match ignoring whitespace.
      const map: number[] = []
      for (let i = 0; i < source.length; i++) if (!/\s/.test(source[i])) map.push(i)
      const bare = quote.replace(/\s+/g,''), at = bare ? findQuote(map.map(i => source[i]).join(''),bare,
        offset === undefined ? undefined : Math.max(0,map.findIndex(i => i >= offset))) : -1
      if (at < 0) return []
      start = map[at]; end = map[at + bare.length - 1] + 1
    }
    return nodes.filter(n => n.offset < end && n.offset + n.node.textContent!.length > start).map(n => {
      const range = document.createRange()
      range.setStart(n.node,Math.max(0,start - n.offset)); range.setEnd(n.node,Math.min(n.node.textContent!.length,end - n.offset))
      return range
    })
  }
  function selectPassage(quote: string, offset?: number) {
    const parts = rangeFor(quote,offset), last = parts.at(-1)
    if (!last) return
    const range = document.createRange()
    range.setStart(parts[0].startContainer,parts[0].startOffset); range.setEnd(last.endContainer,last.endOffset)
    const selection = window.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
  }
  function drawMarks() {
    const wrap = element.querySelector('.pdfPage'), layer = wrap?.querySelector('.highlightLayer')
    if (!wrap || !layer || drawing) return
    const origin = wrap.getBoundingClientRect()
    layer.replaceChildren(...marks.flatMap(({ key,location:at,style }) => at.format !== 'pdf' || at.page !== page || !at.text ? [] :
      rangeFor(at.text,at.offset).flatMap(range => [...range.getClientRects()]).filter(r => r.width >= 1).map(r => {
        const mark = document.createElement('div')
        mark.className = 'mark ' + style; mark.dataset.key = key
        if (style !== 'bookmark') mark.style.background = COLORS[style].fill
        Object.assign(mark.style,{ left:r.left - origin.left + 'px',top:r.top - origin.top + 'px',width:r.width + 'px',height:r.height + 'px' })
        return mark
      })))
  }
  element.addEventListener('click',e => {
    if (window.getSelection()?.isCollapsed === false) return
    const hit = [...element.querySelectorAll<HTMLElement>('.highlightLayer .mark:not(.bookmark)')].findLast(mark => {
      const r = mark.getBoundingClientRect()
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    })
    if (hit) input.activate(hit.dataset.key!)
  },{ signal })
  const selected = () => {
    const selection = window.getSelection()
    return selection?.rangeCount && !selection.isCollapsed && element.contains(selection.anchorNode) ? selection.getRangeAt(0) : undefined
  }
  document.addEventListener('selectionchange',() => input.select(!!selected()),{ signal })
  async function draw(target = fraction) {
    const token = ++generation
    render?.cancel(); layer?.cancel(); drawing = true
    const pdfPage = await doc.getPage(page)
    if (token !== generation) return
    const base = pdfPage.getViewport({ scale:1 }), width = Math.min(830,element.clientWidth - 16) * zoom
    const viewport = pdfPage.getViewport({ scale:width / base.width })
    const wrap = document.createElement('div'), canvas = document.createElement('canvas'), text = document.createElement('div'), marked = document.createElement('div')
    wrap.className = 'pdfPage'; wrap.style.width = viewport.width + 'px'; wrap.style.height = viewport.height + 'px'
    wrap.style.setProperty('--total-scale-factor',String(viewport.scale))
    const dpr = Math.min(devicePixelRatio,1.65,2300 / Math.max(viewport.width,viewport.height))
    canvas.width = Math.ceil(viewport.width * dpr); canvas.height = Math.ceil(viewport.height * dpr); canvas.setAttribute('aria-hidden','true')
    text.className = 'textLayer'; text.setAttribute('aria-label','Page ' + page)
    marked.className = 'highlightLayer'
    wrap.append(canvas,text,marked); element.replaceChildren(wrap)
    render = pdfPage.render({ canvas,viewport,transform:[dpr,0,0,dpr,0,0] })
    layer = new TextLayer({ textContentSource:pdfPage.streamTextContent({ includeMarkedContent:true }),container:text,viewport })
    try {
      await Promise.all([render.promise,layer.render()])
      if (generation !== token || signal.aborted) return
      if (!text.textContent?.trim()) {
        canvas.removeAttribute('aria-hidden'); canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','Scanned page ' + page)
      } else {
        const tree = await pdfPage.getStructTree()
        if (generation !== token) return
        // Expose logical headings and image descriptions on tagged content.
        const annotate = (node: NonNullable<typeof tree> & { alt?: string }, role = '', alt = '') => {
          const kind = node.role || role
          for (const child of node.children) {
            if ('children' in child) annotate(child,kind,node.alt || alt)
            else if (child.id) {
              const part = text.querySelector('#' + CSS.escape(child.id))
              if (part && /^H[1-6]$/.test(kind)) { part.setAttribute('role','heading'); part.setAttribute('aria-level',kind.slice(1)) }
              if (part && (alt || node.alt)) part.setAttribute('aria-label',node.alt || alt)
            }
          }
        }
        if (tree) annotate(tree)
      }
      element.scrollTop = target * element.scrollHeight
      fraction = element.scrollTop / Math.max(1,element.scrollHeight)
      drawing = false; drawMarks(); report()
    } catch (error) { if (generation === token && !signal.aborted) throw error }
    finally { if (generation === token) pdfPage.cleanup() }
  }
  await draw()
  let width = element.clientWidth
  observer = new ResizeObserver(() => { if (width !== element.clientWidth) { width = element.clientWidth; draw().catch(input.error) } })
  observer.observe(element)
  return {
    async step(n) { page = Math.min(doc.numPages,Math.max(1,page+n)); await draw(0) },
    async resizeText(n) { zoom = Math.min(2.5,Math.max(.65,zoom + n * .15)); await draw() },
    async jump(to) {
      if (typeof to === 'string') { page = Math.min(doc.numPages,Math.max(1,Number(to) || 1)); await draw(0) }
      else if (to.format === 'pdf') { page = Math.min(doc.numPages,Math.max(1,to.page)); await draw(to.fraction); if (to.text) selectPassage(to.text,to.offset) }
    },location,
    paint(next) { marks = next; drawMarks() },
    selectionRect: () => selected()?.getBoundingClientRect(),
    async measure(stop) {
      let words = 0
      for (let n = 1; n <= doc.numPages; n++) {
        stop.throwIfAborted()
        const pdfPage = await doc.getPage(n)
        for (const item of (await pdfPage.getTextContent()).items) if ('str' in item) words += countWords(item.str)
        pdfPage.cleanup()
        await new Promise(r => setTimeout(r))
      }
      return { words }
    },
  }
}
