import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bounce, easeOut, fallPose, SETTLED, stagger } from '../../src/shelf/tween.ts'

test('a leaving book tips forward, then drops out of view before the switch settles', () => {
  assert.deepEqual(fallPose(0, 1.6), { tip: 0, drop: 0, forward: 0 })
  const early = fallPose(.3, 1.6)
  assert.ok(early.tip > .9 && early.drop > .5 && early.forward > .5, JSON.stringify(early))
  // By the last frame it is drawn (1.4 s) it sits far below the stage, which ends about 0.4 units under the shelf.
  assert.ok(fallPose(1.4, 1.6).drop > 10)
  assert.ok(1400 < SETTLED)
  for (let t = 0; t < 1.4; t += .05) assert.ok(fallPose(t + .05, 1.6).drop >= fallPose(t, 1.6).drop)
})
test('easing ends where it should and stagger stays in range', () => {
  assert.equal(easeOut(0), 0); assert.equal(easeOut(1), 1)
  assert.equal(bounce(0), 0); assert.ok(Math.abs(bounce(1) - 1) < 1e-9)
  for (const id of [-11, -1, 0, 7, 1234]) { const n = stagger(id, 6); assert.ok(Number.isInteger(n) && n >= 0 && n < 6) }
})
