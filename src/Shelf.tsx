import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { animated, useSpring } from '@react-spring/three'
import type { Book } from './db'

function BookMesh({ book, x }: { book: Book; x: number }) {
  const [picked, setPicked] = useState(false)
  const { y, z, rotY } = useSpring({
    y: picked ? 0.3 : 0,
    z: picked ? 0.6 : 0,
    rotY: picked ? -0.4 : 0,
  })
  return (
    <animated.mesh
      position-x={x}
      position-y={y}
      position-z={z}
      rotation-y={rotY}
      onClick={() => setPicked((p) => !p)}
    >
      <boxGeometry args={[0.35, 1.2, 0.9]} />
      <meshStandardMaterial color={book.color} />
    </animated.mesh>
  )
}

export function Shelf({ books }: { books: Book[] }) {
  return (
    <Canvas camera={{ position: [0, 1, 5], fov: 45 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      {books.map((b, i) => (
        <BookMesh key={b.id} book={b} x={(i - (books.length - 1) / 2) * 0.5} />
      ))}
      <mesh position={[0, -0.65, 0]}>
        <boxGeometry args={[3, 0.1, 1.1]} />
        <meshStandardMaterial color="#5a3d2b" />
      </mesh>
      <OrbitControls enablePan={false} />
    </Canvas>
  )
}
