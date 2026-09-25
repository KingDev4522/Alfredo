import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { buildHand, computePose, POSES } from '../lib/handModel.js'

gsap.registerPlugin(ScrollTrigger)

/**
 * Global scroll progress store (0..1 across the whole page) — written by ScrollTrigger,
 * read inside useFrame. No React state, zero re-render.
 */
const scrollState = {
  progress: 0,
  velocity: 0,
}

/**
 * Burst seed — unit-sphere directions. Statically generated, module scope,
 * read via closure in useFrame (never re-rendered).
 */
const BURST_N = 420
const burstSeed = (() => {
  const seed = new Float32Array(BURST_N * 3)
  for (let i = 0; i < BURST_N; i++) {
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    const r = 0.3 + Math.random() * 0.7
    seed[i * 3] = Math.sin(ph) * Math.cos(th) * r
    seed[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r
    seed[i * 3 + 2] = Math.cos(ph) * r
  }
  return seed
})()

/**
 * Module pointer store — written by a single passive listener, read in useFrame.
 */
const pointerStore = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointerStore.x = (e.clientX / window.innerWidth) * 2 - 1
    pointerStore.y = -(e.clientY / window.innerHeight) * 2 + 1
  }, { passive: true })
}

function RoboticHand() {
  const hand = useMemo(() => buildHand(), [])
  const inner = useRef(hand.group)
  const meshGroup = useRef(null)
  const trackingRef = useRef(null)
  const haloRef = useRef(null)
  const burstRef = useRef(null)
  const lerpPose = useRef({ ...POSES.rest })
  const targetRot = useRef({ x: 0, y: 0 })
  const clock = useRef(0)

  useEffect(() => {
    return () => {
      hand.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
    }
  }, [hand])

  useFrame((state, delta) => {
    clock.current += delta
    const t = clock.current
    const p = scrollState.progress
    const dt = Math.min(delta, 0.05)

    // -------- Phase mapping (0..1 page scroll) --------
    // 0.00-0.25 hero rest | 0.25-0.50 tracking mesh | 0.50-0.75 hidden (pipeline pan) | 0.75-1.0 namaste + burst
    let pose, scale, visible
    let rotX = -0.15
    let rotY = -0.35
    let posX = 0
    let posY = -0.55
    let posZ = 0

    if (p < 0.28) {
      // HERO: rest pose, subtle finger articulation via pointer
      pose = POSES.rest
      const breathe = [
        0.02 + pointerStore.x * 0.05,
        Math.sin(t * 1.7) * 0.03 + pointerStore.y * 0.04,
        Math.sin(t * 1.3 + 1) * 0.03,
        Math.sin(t * 1.9 + 2) * 0.025,
        Math.sin(t * 1.1 + 3) * 0.05,
      ]
      lerpPose.current.curls = lerpPose.current.curls.map((c, i) => c + (pose.curls[i] + breathe[i] - c) * 0.08)
      rotX = -0.1 + pointerStore.y * 0.18
      rotY = -0.4 + pointerStore.x * 0.3
      visible = true
      scale = 1
    } else if (p < 0.52) {
      // TRACKING: hand faces forward, mesh overlay, DTW halos
      pose = POSES.track
      lerpPose.current.curls = lerpPose.current.curls.map((c, i) => c + (pose.curls[i] - c) * 0.08)
      lerpPose.current.spread += (pose.spread - lerpPose.current.spread) * 0.08
      rotX = THREE.MathUtils.lerp(-0.1, 0.05, THREE.MathUtils.clamp((p - 0.28) / 0.24, 0, 1))
      rotY = THREE.MathUtils.lerp(-0.4, 0.02, THREE.MathUtils.clamp((p - 0.28) / 0.24, 0, 1))
      visible = true
      scale = 1
    } else if (p < 0.74) {
      // PIPELINE PAN: hand recedes & fades
      const k = THREE.MathUtils.clamp((p - 0.52) / 0.22, 0, 1)
      pose = POSES.track
      visible = k < 0.85
      scale = 1 - k * 0.4
      posY = -0.55 - k * 1.2
      posZ = -k * 2
    } else {
      // NAMASTE + BURST
      pose = POSES.namaste
      lerpPose.current.curls = lerpPose.current.curls.map((c, i) => c + (pose.curls[i] - c) * 0.06)
      lerpPose.current.spread += (pose.spread - lerpPose.current.spread) * 0.06
      const k = THREE.MathUtils.clamp((p - 0.74) / 0.26, 0, 1)
      rotX = 0.12
      rotY = 0.02 - k * 0.15
      rotX += k * 0.1
      posX = 0.05 * k
      visible = true
      scale = 0.7 + k * 0.25
      posY = -0.55 + k * 0.15
    }

    // Apply lerped rotation + position (buttery, dt-scaled)
    const g = inner.current
    if (g) {
      targetRot.current.x += (rotX - targetRot.current.x) * Math.min(1, dt * 5)
      targetRot.current.y += (rotY - targetRot.current.y) * Math.min(1, dt * 5)
      g.rotation.x = targetRot.current.x
      g.rotation.y = targetRot.current.y
      g.position.set(posX, posY, posZ)
      const s = g.scale.x + (scale - g.scale.x) * Math.min(1, dt * 5)
      g.scale.setScalar(s)
      g.visible = visible

      // Skeletal deform
      const curls = lerpPose.current.curls
      const positions = computePose({ curls, spread: lerpPose.current.spread }, t, null)
      hand.updateJoints(positions)
      hand.updateSkeleton(positions)
      hand.updatePhalanges(positions)

      // Tracking mesh overlay + DTW halo (visible only 0.25-0.55)
      const trackK = THREE.MathUtils.clamp((p - 0.24) / 0.06, 0, 1) * THREE.MathUtils.clamp((0.56 - p) / 0.06, 0, 1)
      if (trackingRef.current) {
        trackingRef.current.visible = trackK > 0.02
        trackingRef.current.material.opacity = trackK * 0.75
        trackingRef.current.material.linewidth = 2
        trackingRef.current.rotation.y = Math.sin(t * 0.6) * 0.1
      }
      if (haloRef.current) {
        haloRef.current.visible = trackK > 0.02
        const h = haloRef.current.material
        h.opacity = trackK * (0.18 + Math.sin(t * 2.2) * 0.08)
        haloRef.current.scale.setScalar(1.25 + Math.sin(t * 1.4) * 0.06)
      }

      // Burst particle cloud at namaste (p > 0.86)
      if (burstRef.current) {
        const burstK = THREE.MathUtils.clamp((p - 0.84) / 0.16, 0, 1)
        burstRef.current.visible = burstK > 0.01
        const geo = burstRef.current.geometry
        const arr = geo.attributes.position.array
        const spread = burstK * 2.2 + 0.05
        for (let i = 0; i < BURST_N; i++) {
          const i3 = i * 3
          arr[i3] = burstSeed[i3] * spread + Math.sin(t * 0.8 + i) * 0.02
          arr[i3 + 1] = burstSeed[i3 + 1] * spread * (0.5 + burstK) - burstK * burstK * 1.6 + 0.5
          arr[i3 + 2] = burstSeed[i3 + 2] * spread
        }
        geo.attributes.position.needsUpdate = true
        burstRef.current.material.opacity = burstK * 0.85
        burstRef.current.material.size = 0.02 + burstK * 0.012
      }
    }
  })

  return (
    <group ref={inner} position={[0, -0.55, 0]} rotation={[-0.1, -0.4, 0]}>
      <primitive object={hand.group} />

      {/* Tracking mesh overlay: wireframe shell over hand */}
      <mesh ref={trackingRef} visible={false}>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial color="#2dd4bf" wireframe transparent opacity={0} />
      </mesh>

      {/* DTW confidence halo */}
      <mesh ref={haloRef} position={[0.3, 0.5, 0]} visible={false}>
        <sphereGeometry args={[1.05, 24, 18]} />
        <meshBasicMaterial color="#ffb703" transparent opacity={0.15} depthWrite={false} />
      </mesh>

      {/* Soundwave particle burst */}
      <points ref={burstRef} visible={false} position={[0.15, 0.6, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[burstPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffb703"
          size={0.02}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  )
}

function AmbientDust({ count = 260 }) {
  const ref = useRef(null)
  const seeds = useMemo(() => {
    const s = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) s[i] = (Math.random() - 0.5) * 10
    return s
  }, [count])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      arr[i3 + 1] = seeds[i3 + 1] + Math.sin(t * 0.25 + i * 1.7) * 0.55
      arr[i3] = seeds[i3] + Math.cos(t * 0.18 + i) * 0.35
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref} position={[0, 0, -1.5]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[seeds, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#d97706"
        size={0.016}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

function Rig() {
  const { camera } = useThree()
  useFrame(() => {
    const p = scrollState.progress
    // camera drifts back during pipeline pan, dives slightly at namaste
    const targetZ = p < 0.5 ? 3.2 : p < 0.74 ? 3.2 - (p - 0.5) * 1.4 : 2.86
    camera.position.z += (targetZ - camera.position.z) * 0.04
    camera.position.x += (pointerStore.x * 0.25 - camera.position.x) * 0.03
    camera.lookAt(0.15, 0.25, 0)
  })
  return null
}

const burstPositions = new Float32Array(BURST_N * 3)

export default function HandScene() {
  useEffect(() => {
    // Track global page scroll progress — single ScrollTrigger, no per-frame listeners
    const st = ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        scrollState.progress = self.progress
        scrollState.velocity = self.getVelocity() / 1000
      },
    })
    return () => st.kill()
  }, [])

  return (
    <div className="absolute inset-0 will-change-transform" style={{ transform: 'translateZ(0)' }}>
      <Canvas
        dpr={[1, 2]}
        frameloop="always"
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        camera={{ fov: 42, position: [0, 0.3, 3.2], near: 0.1, far: 30 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.15
        }}
      >
        <ambientLight intensity={0.28} />
        {/* Amber rim light */}
        <directionalLight position={[-3, 2.5, 2]} intensity={2.6} color="#ffb703" />
        <directionalLight position={[2.5, -1, -2]} intensity={0.9} color="#d97706" />
        {/* Biometric cyan touch */}
        <pointLight position={[2, 2, 3]} intensity={0.7} color="#2dd4bf" />
        <RoboticHand />
        <AmbientDust />
        <Rig />
      </Canvas>
    </div>
  )
}
