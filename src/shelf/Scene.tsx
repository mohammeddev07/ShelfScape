import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { useSpring } from '@react-spring/three'
import { BoxGeometry, Group, PlaneGeometry, Quaternion, Texture, MeshStandardMaterial } from 'three'
import { db } from '../db'
import { useResolvedTheme } from '../theme'
import { binding, pageTexture } from './bindings'

import { arc, bounce, CAMERA, DROP_DELAY, DROP_MS, easeOut, EDGE, FLOOR, layout, SETTLED, SLIDE_DELAY, SLIDE_MS, stagger, VIEW, type Slot, type Motion, type Hits, type Transition } from './layout'
const box = new BoxGeometry(1, 1, 1), plane = new PlaneGeometry(1, 1)
const roundedSpine = new PlaneGeometry(1,1,16,1)
const points = roundedSpine.attributes.position
for (let i = 0; i < points.count; i++) points.setZ(i,.043 * Math.cos(Math.PI * points.getX(i)))
roundedSpine.computeVertexNormals()
const IDENTITY = new Quaternion(), LIFT = .07

function useMap<T extends Texture | MeshStandardMaterial>(map: T) {
  useEffect(() => () => map.dispose(), [map])
  return map
}
type Arrival = { since: number; from?: number; offset?: number; drop: boolean; done?: boolean }
function BookModel({ slot, copy, active, lit, motion, hits, reduced, pages, transition, fall }: {
  slot: Slot; copy: number; active: boolean; lit: boolean; motion: Motion; hits: Hits; reduced: boolean; pages: MeshStandardMaterial
  transition?: Transition; fall?: { since: number; x: number }
}) {
  const group = useRef<Group>(null), twist = useRef<Group>(null), zoom = useRef(1), lift = useRef(0)
  // Per switch: slide from where this book stood, or drop in if it was not on screen. Armed in the frame loop, not during render.
  const arrival = useRef<Arrival>({ since:-1,drop:false,done:true })
  const invalidate = useThree(s => s.invalidate)
  const { book, w, h, d, tilt } = slot
  const spine = useMap(useMemo(() => binding(book,'spine'),[book]))
  const cloth = useMap(useMemo(() => new MeshStandardMaterial({color:book.color,roughness:.83}),[book.color]))
  const [image, setImage] = useState<HTMLImageElement>()
  useEffect(() => {
    if (!active) return
    let live = true, url: string | undefined
    const apply = (src: string) => {
      const im = new Image()
      im.onload = () => { if (live) setImage(im) }
      im.src = src
    }
    if (book.sample && book.format === 'epub') apply(book.sample.replace('/samples/','/art/').replace('.epub','.jpg'))
    else db.art.get(book.id).then(asset => {
      if (!live || !asset) return
      url = URL.createObjectURL(asset.blob); apply(url)
    }).catch(() => {})
    return () => { live = false; setImage(undefined); if (url) URL.revokeObjectURL(url) }
  }, [active,book.id,book.sample,book.format])
  const details = active
  const faces = useMemo(() => details ? [binding(book,'front', image),binding(book,'back')] : [],[details,book,image])
  useEffect(() => () => faces.forEach(map => map.dispose()),[faces])
  useEffect(() => invalidate(),[lit,invalidate])
  const springs = useSpring({ reveal: active ? 1 : 0, from: { reveal: 0 }, immediate: reduced,
    config: { tension: 190, friction: 27 }, onChange: () => invalidate() })
  useFrame((_,dt) => {
    if (!group.current || !twist.current) return
    if (fall) {
      // Tips forward off the front lip, then drops out of view.
      const time = Math.max(0,(performance.now() - fall.since - stagger(book.id,5) * 40) / 1000), tip = Math.min(1.4,time * 3.2), free = Math.max(0,time - .12)
      const bow = arc(fall.x,motion.span / 2)
      group.current.position.set(fall.x,FLOOR + h / 2 - (1 - Math.cos(tip)) * h / 2 - 8 * free * free,bow.z + Math.sin(tip) * h / 2 + free * 1.2)
      group.current.rotation.set(tip,bow.yaw,tilt + (book.id % 2 ? 1 : -1) * time * .5)
      if (time < 1.4) invalidate()
      return
    }
    const q = twist.current.quaternion, k = 1 - .0005 ** Math.min(dt,.05)
    if (active) { q.copy(motion.inspection.rotation); zoom.current = motion.inspection.zoom }
    else if (reduced) { q.identity(); zoom.current = 1 }
    else {
      // Turn back as the book slides home instead of snapping square.
      q.slerp(IDENTITY,k); zoom.current += (1 - zoom.current) * k
      if (q.angleTo(IDENTITY) > 1e-3 || Math.abs(zoom.current - 1) > 1e-3) invalidate()
    }
    // The browsed (hovered or keyboard) book rises a little off the shelf.
    const goal = lit && !active ? LIFT : 0
    lift.current = reduced ? goal : lift.current + (goal - lift.current) * Math.min(1,k * 1.6)
    if (Math.abs(goal - lift.current) > 1e-3) invalidate()
    const t = springs.reveal.get(), z = Math.min(t * 2, 1), turn = Math.max(0, (t - 0.16) / 0.84)
    const x = motion.at(slot.x) + copy * motion.period, bow = arc(x, motion.span / 2)
    let dx = 0, dy = 0
    if (transition && arrival.current.since !== transition.since)
      arrival.current = { since:transition.since,from:transition.from.get(book.id),drop:!transition.from.has(book.id) }
    const come = arrival.current
    if (!come.done) {
      const time = performance.now() - come.since
      if (!come.drop && come.offset === undefined) {
        come.offset = come.from! - x
        // Too far to slide believably (another stretch of a looping shelf): drop in instead.
        if (Math.abs(come.offset) > motion.span * .75) { come.drop = true; come.offset = 0 }
      }
      if (come.drop) dy = (1 - bounce(Math.min(1,Math.max(0,(time - DROP_DELAY - stagger(book.id,6) * 45) / DROP_MS)))) * 2.6
      else dx = come.offset! * (1 - easeOut(Math.min(1,Math.max(0,(time - SLIDE_DELAY) / SLIDE_MS))))
      if (time > SETTLED) come.done = true
      else invalidate()
    }
    group.current.position.set((x + dx) * (1 - t), (FLOOR + h / 2 + lift.current + dy) * (1 - t) + 0.27 * t, bow.z * (1 - z) + 1.6 * z)
    group.current.rotation.set(0, bow.yaw * (1 - t) - 1.36 * turn, tilt * (1 - t) - 0.035 * turn)
    group.current.scale.setScalar(1 + t * (0.29 + zoom.current - 1))
  })
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (fall) return
    e.stopPropagation()
    hits.down(e.nativeEvent, book.id, e.object.name === 'cover', active)
  }
  return <group name={'Book ' + book.id} ref={group} onPointerOver={e => { e.stopPropagation(); if (e.pointerType === 'mouse') hits.hover(book.id) }}
    onPointerOut={() => hits.hover(undefined)} onPointerDown={down}>
    <group ref={twist}>
      <mesh geometry={box} material={pages} scale={[w * .91,h - .048,d - .043]}/>
      {[-1,1].map(sign => <group key={sign}>
        <mesh geometry={box} position={[sign * (w / 2 - .009),0,0]} scale={[.018,h,d]} material={cloth}/>
        {details && <mesh name={sign === 1 ? 'cover' : 'back'} geometry={plane} rotation-y={sign * Math.PI / 2}
          position={[sign * (w / 2 + .001),0,0]} scale={[d,h,1]}><meshStandardMaterial map={faces[sign === 1 ? 0 : 1]} roughness={.8}/></mesh>}
      </group>)}
      <mesh name="spine" geometry={roundedSpine} position={[0,0,d / 2 + .002]} scale={[w,h,1]}><meshStandardMaterial map={spine} roughness={.82}/></mesh>
    </group>
  </group>
}
function firstNear(slots: Slot[], x: number) {
  let low = 0, high = slots.length
  while (low < high) {
    const mid = (high + low) >>> 1
    if (slots[mid].x < x) low = mid + 1
    else high = mid
  }
  return low
}
/** Books only: the walnut shelf is drawn behind the canvas so it stays put while rows crossfade. */
export function Scene({ shelf, selected, lit, motion, hits, reduced, onLose, transition }: {
  shelf: ReturnType<typeof layout>; selected?: number; lit?: number; motion: Motion; hits: Hits; reduced: boolean; onLose: () => void; transition?: Transition
}) {
  const { size, invalidate, gl, setDpr } = useThree(), night = useResolvedTheme() === 'dark'
  const slowFrames = useRef(0)
  const span = size.width / Math.max(1,size.height) * VIEW, margin = span * EDGE
  const [windowStart,setWindowStart] = useState(0)
  const pages = useMap(useMemo(() => pageTexture(),[]))
  const pageStock = useMap(useMemo(() => new MeshStandardMaterial({map:pages,roughness:.97}),[pages]))
  useEffect(() => {
    motion.configure(span,size.width,shelf.length,margin,invalidate)
    const loss = (e: Event) => { e.preventDefault(); onLose() }
    gl.domElement.addEventListener('webglcontextlost',loss)
    return () => gl.domElement.removeEventListener('webglcontextlost',loss)
  },[motion,span,margin,size.width,shelf.length,invalidate,gl,onLose])
  useFrame((_,dt) => {
    if (dt > .034 && dt < .15) slowFrames.current++
    else slowFrames.current = Math.max(0,slowFrames.current - 1)
    if (slowFrames.current >= 12 && gl.getPixelRatio() > 1) { setDpr(1); slowFrames.current = 0 }
    motion.advance(dt)
    // Re-render when the leftmost visible book changes; on a looping shelf that index wraps to 0.
    const first = firstNear(shelf.slots, motion.period ? motion.clamp(motion.offset - 1) : motion.offset - 1) % Math.max(1,shelf.slots.length)
    if (first !== windowStart) setWindowStart(first)
  }, -1)
  // Every placement of each book within [-1, span + 1]; a looping shelf only slightly wider than the view repeats some.
  // ponytail: O(n) scan per window change; fine at 1,000 books, cyclic binary search if libraries get far bigger.
  const near = shelf.slots.flatMap(slot => {
    const p = motion.place(slot.x)
    if (p < -1 || p > span + 1) return []
    const copies = motion.period ? Math.floor((span + 1 - p) / motion.period) + 1 : 1
    return Array.from({ length:copies },(_,copy) => ({ slot, copy }))
  })
  const picked = selected !== undefined && shelf.slots.find(s => s.book.id === selected)
  if (picked && !near.some(n => n.slot === picked && n.copy === 0)) near.push({ slot:picked, copy:0 })
  return <>
    <OrthographicCamera makeDefault position={[0,CAMERA.y,CAMERA.z]} rotation={[-CAMERA.pitch,0,0]} zoom={size.height / VIEW} near={.1} far={50}/>
    <ambientLight intensity={night ? .9 : 1.45}/><directionalLight position={[-3,6,5]} intensity={night ? 1.8 : 2.3} color={night ? '#ffd2a1' : '#ffeed7'}/>
    <directionalLight position={[4,3,-3]} intensity={night ? .8 : 1.05} color="#ffe2c4"/>
    {near.map(({ slot, copy }) => <BookModel key={slot.book.id + ':' + copy} slot={slot} copy={copy} active={copy === 0 && selected === slot.book.id}
      lit={lit === slot.book.id} motion={motion} reduced={reduced} hits={hits} pages={pageStock} transition={transition}/>)}
    {/* Same key as on the old shelf, so a leaving book keeps its textures while it falls. */}
    {transition?.leaving.map(({ slot, x }) => <BookModel key={slot.book.id + ':0'} slot={slot} copy={0} active={false} lit={false} motion={motion}
      reduced={reduced} hits={hits} pages={pageStock} fall={{ since:transition.since, x }}/>)}
  </>
}
