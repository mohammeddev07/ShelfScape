import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { useSpring } from '@react-spring/three'
import { BoxGeometry, Group, PlaneGeometry, Quaternion, Texture, MeshStandardMaterial, Vector3 } from 'three'
import { db } from '../db'
import { binding, pageTexture, woodTexture, shadowTexture } from './bindings'

import { layout, type Slot, type Motion, type Hits } from './layout'
const box = new BoxGeometry(1, 1, 1), plane = new PlaneGeometry(1, 1)
const roundedSpine = new PlaneGeometry(1,1,16,1)
const points = roundedSpine.attributes.position
for (let i = 0; i < points.count; i++) points.setZ(i,.043 * Math.cos(Math.PI * points.getX(i)))
roundedSpine.computeVertexNormals()
const IDENTITY = new Quaternion(), tip = new Vector3()

function useMap<T extends Texture | MeshStandardMaterial>(map: T) {
  useEffect(() => () => map.dispose(), [map])
  return map
}
function BookModel({ slot, active, motion, left, hits, reduced, pages }: {
  slot: Slot; active: boolean; motion: Motion; left: number; hits: Hits; reduced: boolean; pages: MeshStandardMaterial
}) {
  const group = useRef<Group>(null), twist = useRef<Group>(null), zoom = useRef(1)
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
  const springs = useSpring({ reveal: active ? 1 : 0, from: { reveal: 0 }, immediate: reduced,
    config: { tension: 190, friction: 27 }, onChange: () => invalidate() })
  useFrame((_,dt) => {
    if (!group.current || !twist.current) return
    const q = twist.current.quaternion
    if (active) { q.copy(motion.inspection.rotation); zoom.current = motion.inspection.zoom }
    else if (reduced) { q.identity(); zoom.current = 1 }
    else {
      // Turn back as the book slides home instead of snapping square.
      const k = 1 - .0005 ** dt
      q.slerp(IDENTITY,k); zoom.current += (1 - zoom.current) * k
      if (q.angleTo(IDENTITY) > 1e-3 || Math.abs(zoom.current - 1) > 1e-3) invalidate()
    }
    const t = springs.reveal.get(), z = Math.min(t * 2, 1), turn = Math.max(0, (t - 0.16) / 0.84)
    group.current.position.set((left + slot.x - motion.offset) * (1 - t), (-0.94 + h / 2) * (1 - t) + 0.27 * t, 1.6 * z)
    group.current.rotation.set(0, -1.36 * turn, tilt * (1 - t) - 0.035 * turn)
    group.current.scale.setScalar(1 + t * (0.29 + zoom.current - 1))
  })
  const down = (e: ThreeEvent<PointerEvent>) => {
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
export function Scene({ shelf, selected, motion, hits, reduced, onLose, label }: {
  shelf: ReturnType<typeof layout>; selected?: number; motion: Motion; hits: Hits; reduced: boolean; onLose: () => void
  label: { id?: number; el: RefObject<HTMLDivElement | null> }
}) {
  const { size, invalidate, gl, setDpr } = useThree()
  const slowFrames = useRef(0)
  const span = size.width / Math.max(1,size.height) * 2.72
  const margin = Math.min(.6, span * .07), left = -span / 2 + margin
  const [windowStart,setWindowStart] = useState(0)
  const pages = useMap(useMemo(() => pageTexture(),[])), wood = useMap(useMemo(() => woodTexture(),[])), shade = useMap(useMemo(() => shadowTexture(),[]))
  const pageStock = useMap(useMemo(() => new MeshStandardMaterial({map:pages,roughness:.97}),[pages]))
  useEffect(() => {
    motion.configure(span,size.width,shelf.length + margin * 2,invalidate)
    const loss = (e: Event) => { e.preventDefault(); onLose() }
    gl.domElement.addEventListener('webglcontextlost',loss)
    return () => gl.domElement.removeEventListener('webglcontextlost',loss)
  },[motion,span,margin,size.width,shelf.length,invalidate,gl,onLose])
  const labelled = useMemo(() => shelf.slots.find(s => s.book.id === label.id),[shelf,label.id])
  useEffect(() => invalidate(),[labelled,invalidate])
  useFrame(({ camera },dt) => {
    if (dt > .034 && dt < .15) slowFrames.current++
    else slowFrames.current = Math.max(0,slowFrames.current - 1)
    if (slowFrames.current >= 12 && gl.getPixelRatio() > 1) { setDpr(1); slowFrames.current = 0 }
    motion.advance(dt)
    const first = firstNear(shelf.slots, motion.offset - 1)
    if (first !== windowStart) setWindowStart(first)
    const el = label.el.current
    if (!el) return
    if (!labelled || motion.dragging || labelled.book.id === selected) { el.style.setProperty('visibility','hidden'); return }
    // Spine top at its resting slot, computed from layout so it never lags the book's own frame update.
    const { x, h, d, tilt } = labelled
    tip.set(left + x - motion.offset - Math.sin(tilt) * h / 2, -0.94 + h / 2 + Math.cos(tilt) * h / 2, d / 2).project(camera)
    el.style.setProperty('transform',`translate(${(tip.x + 1) / 2 * size.width}px,${(1 - tip.y) / 2 * size.height}px) translate(-50%,calc(-100% - 8px))`)
    el.style.setProperty('visibility','visible')
  }, -1)
  const near = shelf.slots.slice(windowStart,firstNear(shelf.slots,motion.offset + span + 1) + 1)
  const picked = selected !== undefined && shelf.slots.find(s => s.book.id === selected)
  if (picked && !near.includes(picked)) near.push(picked)
  return <>
    <OrthographicCamera makeDefault position={[0,1.05,8]} rotation={[-.13,0,0]} zoom={size.height / 2.72} near={.1} far={50}/>
    <ambientLight intensity={1.55}/><directionalLight position={[-3,6,5]} intensity={2.3} color="#ffeed7"/>
    <directionalLight position={[4,3,-3]} intensity={1.05}/>
    <mesh geometry={box} position={[0,-1.046,0]} scale={[span + 2,.19,1.65]}><meshStandardMaterial map={wood} roughness={.88}/></mesh>
    <mesh geometry={box} position={[0,-1.15,.10]} scale={[span + 2,.035,1.40]}><meshStandardMaterial color="#644027"/></mesh>
    {picked && <mesh geometry={plane} position={[0,-1.06,1.78]} scale={[1.60,.17,1]}><meshBasicMaterial map={shade} transparent depthWrite={false}/></mesh>}
    {near.map(slot => <BookModel key={slot.book.id} slot={slot} left={left} active={selected === slot.book.id}
      motion={motion} reduced={reduced} hits={hits} pages={pageStock}/>)}
  </>
}
