import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findQuote, toMarkdown, sortAnnotations, sameSpot } from '../../src/annotations/core.ts'
test('findQuote prefers the recorded occurrence', () => {
  const page = 'Little Lamb, who made thee? Dost thou know who made thee? Little Lamb, who made thee?'
  assert.equal(findQuote(page, 'Little Lamb', 58), 58)
  assert.equal(findQuote(page, 'Little Lamb', 50), 58)   // nearest after drift
  assert.equal(findQuote(page, 'Little Lamb'), 0)
  assert.equal(findQuote(page, 'Tyger'), -1); assert.equal(findQuote(page, ''), -1)
})
const a = (color: string, order: number, text: string, note = '', where = 'Page 2') =>
  ({ book: 1, color, note, where, order, created: order, updated: order, location: { format: 'pdf', page: 2, fraction: 0, text } }) as any
test('markdown export groups by color in fixed order and sorts by position', () => {
  const md = toMarkdown({ title: 'Songs of Innocence', author: 'William Blake' },
    [a('green', .5, 'Gave thee life'), a('yellow', .9, 'He is meek', 'Line two\nmore'), a('yellow', .2, 'Little Lamb,\nwho made thee?', 'Opening')],
    Date.UTC(2026, 10, 7))
  assert.equal(md, [
    '# Songs of Innocence', '_William Blake_ · Exported 2026-11-07', '',
    '## Important', '> Little Lamb,', '> who made thee?', '', 'Page 2 · Opening', '',
    '> He is meek', '', 'Page 2 · Line two\n  more', '',
    '## Idea', '> Gave thee life', '', 'Page 2', '',
  ].join('\n'))
  assert.equal(sortAnnotations([a('pink', .9, 'x'), a('pink', .1, 'y')])[0].order, .1)
})
test('bookmarks: same spot matching and the export section', () => {
  const pdf = (page: number, text?: string) => ({ format: 'pdf', page, fraction: .3, text }) as any
  assert.ok(sameSpot(pdf(4), { ...pdf(4), fraction: .9 }))        // same page, scrolled elsewhere
  assert.ok(!sameSpot(pdf(4), pdf(5))); assert.ok(!sameSpot(pdf(4), pdf(4, 'Lamb')))
  assert.ok(sameSpot({ format: 'epub', cfi: 'epubcfi(/6/4!/2)' } as any, { format: 'epub', cfi: 'epubcfi(/6/4!/2)' } as any))
  assert.ok(!sameSpot(pdf(4), { format: 'epub', cfi: 'epubcfi(/6/4!/2)' } as any))
  const md = toMarkdown({ title: 'T', author: '' }, [], Date.UTC(2026, 10, 7), [
    { book: 1, location: pdf(9), where: 'Page 9', order: .9, excerpt: 'Later\npage', created: 2 },
    { book: 1, location: pdf(2), where: 'Page 2', order: .2, excerpt: '', created: 1 }])
  assert.match(md, /## Bookmarks\n- Page 2\n- Page 9: Later page\n/)
})
