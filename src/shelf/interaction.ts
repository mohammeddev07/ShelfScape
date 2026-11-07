import { Quaternion, Vector3 } from 'three'

export interface Inspection { rotation: Quaternion; zoom: number }
export interface PointerTrack { x: number; y: number; startX: number; startY: number; id?: number; cover: boolean; inspect: boolean; moved: boolean }
export function rotateBy(state: Inspection, axis: 'x' | 'y' | 'z', angle: number) {
  const v = new Vector3(Number(axis === 'x'), Number(axis === 'y'), Number(axis === 'z'))
  state.rotation.premultiply(new Quaternion().setFromAxisAngle(v, angle)).normalize()
}
function arc(x: number, y: number, box: DOMRect) {
  const radius = Math.min(box.width, box.height) * 0.32
  const u = (x - box.left - box.width / 2) / radius
  const v = (box.top + box.height / 2 - y) / radius
  return new Vector3(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v))).normalize()
}
export function rotateDrag(state: Inspection, p: PointerTrack, x: number, y: number, box: DOMRect) {
  state.rotation.premultiply(new Quaternion().setFromUnitVectors(arc(p.x,p.y,box), arc(x,y,box))).normalize()
}
