// Shelf-switch timing and easing. No runtime imports, so Node's test runner can import it directly.
// ms: leavers tip off at once, the gap closes after SLIDE_DELAY, newcomers land after DROP_DELAY; everything settles by SETTLED.
export const SLIDE_DELAY = 120, SLIDE_MS = 560, DROP_DELAY = 260, DROP_MS = 620, SETTLED = 1500
export const easeOut = (k: number) => 1 - (1 - k) ** 3
/** Lands, then two small bounces (Penner's easeOutBounce). */
export function bounce(k: number) {
  const n = 7.5625, d = 2.75
  if (k < 1 / d) return n * k * k
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + .75
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + .9375
  return n * (k -= 2.625 / d) * k + .984375
}
/** A stable 0..n-1 stagger slot per book, so a row does not fall or land in lockstep. */
export const stagger = (id: number, n: number) => (Math.abs(id) * 7919) % n
/** Pose of a book tipping off the front lip, `time` seconds after it starts: forward tip (radians), drop and forward travel (world units). */
export function fallPose(time: number, h: number) {
  const tip = Math.min(1.4, Math.max(0, time) * 3.2), free = Math.max(0, time - .12)
  return { tip, drop: (1 - Math.cos(tip)) * h / 2 + 8 * free * free, forward: Math.sin(tip) * h / 2 + free * 1.2 }
}
