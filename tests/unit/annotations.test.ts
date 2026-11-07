import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findQuote, toMarkdown, sortAnnotations } from '../../src/annotations/core.ts'
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
