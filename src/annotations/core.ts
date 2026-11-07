import type { Annotation, HighlightColor } from '../db'

export const COLORS: Record<HighlightColor, { label: string; fill: string }> = {
  yellow: { label: 'Important', fill: '#f2c94c' },
  green: { label: 'Idea', fill: '#8fbf7a' },
  blue: { label: 'Question', fill: '#7fa7d9' },
  pink: { label: 'Quote', fill: '#e39ab0' },
}
export const COLOR_ORDER: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']

/** Index of `quote` in `source`: the recorded `offset` if it still matches, else the nearest occurrence, else the first. -1 if absent. */
export function findQuote(source: string, quote: string, offset?: number): number {
  if (!quote) return -1
  if (offset !== undefined && source.startsWith(quote, offset)) return offset
  let best = -1
  for (let i = source.indexOf(quote); i !== -1; i = source.indexOf(quote, i + 1)) {
    if (offset === undefined) return i
    if (best === -1 || Math.abs(i - offset) < Math.abs(best - offset)) best = i
    else break // later hits are only farther away
  }
  return best
}

export const sortAnnotations = (list: Annotation[]): Annotation[] =>
  [...list].sort((a, b) => a.order - b.order || a.created - b.created)

export function toMarkdown(book: { title: string; author: string }, list: Annotation[], exported: number): string {
  const lines = [`# ${book.title}`, `${book.author ? `_${book.author}_ · ` : ''}Exported ${new Date(exported).toLocaleDateString('en-CA')}`, '']
  const sorted = sortAnnotations(list)
  for (const color of COLOR_ORDER) {
    const items = sorted.filter(a => a.color === color)
    if (!items.length) continue
    lines.push(`## ${COLORS[color].label}`)
    for (const a of items) {
      for (const q of (a.location.text ?? '').split(/\r?\n/)) lines.push(`> ${q}`)
      lines.push('', `${a.where}${a.note ? ` · ${a.note.replace(/\r?\n/g, '\n  ')}` : ''}`, '')
    }
  }
  return lines.join('\n')
}
