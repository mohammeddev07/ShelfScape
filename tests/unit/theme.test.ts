import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contrast } from '../../src/shelf/design.ts'
const css = readFileSync('src/index.css', 'utf8')
const tokens = (re: RegExp) => {
  const block = css.match(re)?.[1]; assert.ok(block, String(re))
  return Object.fromEntries([...block.matchAll(/--([\w-]+):(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]))
}
for (const [name, re] of [['light', /:root\{([^}]*)\}/], ['dark', /:root\[data-theme=dark\]\{([^}]*)\}/]] as const)
  test(`${name} tokens are legible on paper`, () => {
    const t = tokens(re)
    assert.ok(contrast(t.ink, t.paper) >= 7, 'ink')
    assert.ok(contrast(t.muted, t.paper) >= 4.5, 'muted')
    assert.ok(contrast(t.rust, t.paper) >= 4.5, 'rust')
  })
