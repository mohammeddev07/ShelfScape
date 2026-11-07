import { test } from 'node:test'
import assert from 'node:assert/strict'
import { design, contrast, FAMILIES } from '../../src/shelf/design.ts'
const cloth = ['#394f40','#8b523b','#344958','#76505a','#79603b','#41625a','#715240','#3f5638','#9b6b38','#9b6745']
test('contrast matches WCAG', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21); assert.equal(contrast('#777777', '#777777'), 1)
})
test('lettering is legible on every cloth', () => {
  for (const c of cloth) for (let i = 0; i < 50; i++) assert.ok(contrast(design('Book ' + i, c).foil, c) >= 4.5, c)
})
test('deterministic and varied', () => {
  assert.deepEqual(design('Emma', '#42645f'), design('Emma', '#42645f'))
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => design('Book ' + i, '#394f40').family)).size, FAMILIES.length)
})
