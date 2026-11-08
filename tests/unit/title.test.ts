import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle } from '../../src/library/title.ts'

test('strips a trailing PDFDrive tag', () => {
  for (const raw of ['Atomic Habits ( PDFDrive.com )', 'Atomic Habits (PDFDrive.com)', 'Atomic Habits ( PDFDrive )',
    'Atomic Habits - PDFDrive.com', 'Atomic Habits_PDFDrive.com', 'Atomic Habits pdfdrive.com', 'Atomic Habits [www.PDFDrive.com]'])
    assert.equal(cleanTitle(raw), 'Atomic Habits', raw)
})
test('leaves other titles alone', () => {
  for (const raw of ['Atomic Habits', 'PDFDrive.com', 'Drive', 'The PDF Drive Story of Things', ''])
    assert.equal(cleanTitle(raw), undefined, raw)
})
