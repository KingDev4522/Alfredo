import * as THREE from 'three'

// MediaPipe-style 21-landmark hand topology (normalized units, palm ~1.0 tall).
// Wrist at origin; fingers spread along +X, fingers extend along +Y.
const LM = (x, y, z = 0) => new THREE.Vector3(x, y, z)

export const LANDMARKS = [
  LM(0.0, 0.0, 0), // 0 wrist
  LM(-0.08, 0.42, 0.02), // 1 thumb CMC
  LM(-0.24, 0.62, 0.04), // 2 thumb MCP
  LM(-0.36, 0.78, 0.05), // 3 thumb IP
  LM(-0.44, 0.90, 0.05), // 4 thumb tip
  LM(0.08, 0.48, 0), // 5 index MCP
  LM(0.10, 0.72, 0), // 6 index PIP
  LM(0.11, 0.92, 0), // 7 index DIP
  LM(0.12, 1.06, 0), // 8 index tip
  LM(0.26, 0.46, 0), // 9 middle MCP
  LM(0.29, 0.74, 0), // 10 middle PIP
  LM(0.30, 0.96, 0), // 11 middle DIP
  LM(0.31, 1.12, 0), // 12 middle tip
  LM(0.44, 0.44, -0.02), // 13 ring MCP
  LM(0.48, 0.70, -0.03), // 14 ring PIP
  LM(0.49, 0.90, -0.04), // 15 ring DIP
  LM(0.50, 1.04, -0.04), // 16 ring tip
  LM(0.61, 0.38, -0.05), // 17 pinky MCP
  LM(0.67, 0.60, -0.06), // 18 pinky PIP
  LM(0.69, 0.77, -0.07), // 19 pinky DIP
  LM(0.70, 0.90, -0.07), // 20 pinky tip
]

// Bone connections: [childIndex, parentIndex] per MediaPipe HAND_CONNECTIONS
export const BONES = [
  [1, 0], [2, 1], [3, 2], [4, 3],
  [5, 0], [6, 5], [7, 6], [8, 7],
  [9, 0], [10, 9], [11, 10], [12, 11],
  [13, 0], [14, 13], [15, 14], [16, 15],
  [17, 0], [18, 17], [19, 18], [20, 19],
  [0, 9], [9, 13], [13, 17],
]

export const FINGERS = [
  { name: 'thumb', joints: [1, 2, 3, 4], base: 1, axis: 'z' },
  { name: 'index', joints: [5, 6, 7, 8], base: 5, axis: 'x' },
  { name: 'middle', joints: [9, 10, 11, 12], base: 9, axis: 'x' },
  { name: 'ring', joints: [13, 14, 15, 16], base: 13, axis: 'x' },
  { name: 'pinky', joints: [17, 18, 19, 20], base: 17, axis: 'x' },
]

/**
 * Gesture poses: curl factor per finger [0 = open, 1 = fully curled], thumb spread.
 */
export const POSES = {
  rest: { curls: [0.08, 0.06, 0.04, 0.05, 0.1], spread: 1 },
  open: { curls: [0.02, 0, 0, 0, 0.02], spread: 1.15 },
  track: { curls: [0.05, 0.03, 0.02, 0.03, 0.06], spread: 1 },
  namaste: { curls: [0.02, 0.02, 0.02, 0.02, 0.02], spread: -0.55 },
}

/**
 * Builds a procedurally-generated hand: palm plate + 21 articulated capsule joints,
 * deformable via per-landmark curl transforms. Pure Three.js fallback geometry,
 * no external GLTF required.
 */
export function buildHand() {
  const group = new THREE.Group()

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x1a1512,
    roughness: 0.32,
    metalness: 0.72,
    emissive: 0x120a02,
    emissiveIntensity: 0.5,
  })
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x2a2018,
    roughness: 0.25,
    metalness: 0.85,
    emissive: 0xffb703,
    emissiveIntensity: 0.55,
  })

  // Palm plate — low-poly machined look
  const palmGeo = new THREE.BoxGeometry(0.94, 1.05, 0.16, 3, 4, 1)
  const palmPosAttr = palmGeo.attributes.position
  for (let i = 0; i < palmPosAttr.count; i++) {
    const y = palmPosAttr.getY(i)
    const x = palmPosAttr.getX(i)
    // taper the wrist
    if (y < -0.4) palmPosAttr.setX(i, x * 0.62)
    // knuckle ridge bulge
    if (y > 0.42) palmPosAttr.setZ(i, palmPosAttr.getZ(i) + 0.05)
  }
  palmGeo.computeVertexNormals()
  const palm = new THREE.Mesh(palmGeo, skinMat)
  palm.position.set(0.3, 0.14, 0)
  group.add(palm)

  const jointMeshes = []
  const segments = []

  // Joints + bones
  for (let i = 0; i < 21; i++) {
    const p = LANDMARKS[i]
    const r = i === 0 ? 0.11 : 0.052 - (i % 4) * 0.004
    const geo = new THREE.IcosahedronGeometry(r, 2)
    const mesh = new THREE.Mesh(geo, i === 0 ? skinMat : jointMat)
    mesh.position.copy(p)
    mesh.userData.index = i
    group.add(mesh)
    jointMeshes.push(mesh)
  }

  // Bone cylinders between connected landmarks (recreated per-pose via scale hack:
  // instead we keep static reference bones and let joint positions drive a LineSegments skeleton)
  const boneGeom = new THREE.BufferGeometry()
  const bonePos = new Float32Array(BONES.length * 6)
  boneGeom.setAttribute('position', new THREE.BufferAttribute(bonePos, 3))
  const boneMat = new THREE.LineBasicMaterial({
    color: 0xffb703,
    transparent: true,
    opacity: 0.9,
  })
  const skeleton = new THREE.LineSegments(boneGeom, boneMat)
  group.add(skeleton)

  // Solid stylized phalanges (static mesh per bone, updated by pose)
  const phalanges = []
  const phalMat = skinMat
  for (const [c, p] of BONES) {
    const a = LANDMARKS[c]
    const b = LANDMARKS[p]
    const len = a.distanceTo(b)
    const geo = new THREE.CylinderGeometry(0.036, 0.045, 1, 8, 1, true)
    const mesh = new THREE.Mesh(geo, phalMat)
    mesh.scale.y = Math.max(len, 0.001)
    mesh.userData = { c, p }
    group.add(mesh)
    phalanges.push(mesh)
  }

  function updateSkeleton(positions) {
    const arr = boneGeom.attributes.position.array
    BONES.forEach(([c, p], i) => {
      const a = positions[c]
      const b = positions[p]
      arr[i * 6 + 0] = a.x; arr[i * 6 + 1] = a.y; arr[i * 6 + 2] = a.z
      arr[i * 6 + 3] = b.x; arr[i * 6 + 4] = b.y; arr[i * 6 + 5] = b.z
    })
    boneGeom.attributes.position.needsUpdate = true
    boneGeom.computeBoundingSphere()
  }

  function updatePhalanges(positions) {
    const aVec = new THREE.Vector3()
    const bVec = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const dir = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    for (const mesh of phalanges) {
      aVec.copy(positions[mesh.userData.c])
      bVec.copy(positions[mesh.userData.p])
      mid.addVectors(aVec, bVec).multiplyScalar(0.5)
      dir.subVectors(bVec, aVec)
      const len = dir.length()
      mesh.position.copy(mid)
      if (len > 1e-5) {
        q.setFromUnitVectors(up, dir.normalize())
        mesh.quaternion.copy(q)
        mesh.scale.set(1, len, 1)
      }
    }
  }

  function updateJoints(positions) {
    for (let i = 0; i < 21; i++) jointMeshes[i].position.copy(positions[i])
  }

  return { group, updateSkeleton, updatePhalanges, updateJoints, jointMeshes, skeleton, phalanges }
}

const tmpA = new THREE.Vector3()

/**
 * Compute deformed landmark positions for a given pose + time.
 * Each finger curls around its MCP with cascading joint angles.
 */
export function computePose(pose, t, subtleMotion) {
  const out = LANDMARKS.map((p) => p.clone())

  // Thumb spread
  const spread = pose.spread
  out[1].x = LANDMARKS[1].x * (spread > 0 ? spread : 1) + (spread < 0 ? 0.06 : 0)
  out[2].x = LANDMARKS[2].x * spread
  out[3].x = LANDMARKS[3].x * spread
  out[4].x = LANDMARKS[4].x * spread
  if (spread < 0) {
    // namaste: fold thumb across palm
    for (let i = 1; i <= 4; i++) out[i].z += 0.08
  }

  // Finger curls: rotate each chain around MCP
  for (let f = 0; f < 5; f++) {
    const finger = FINGERS[f]
    const curl = pose.curls[f] + (subtleMotion ? subtleMotion[f] : 0)
    if (curl === 0) continue
    const mcp = out[finger.base]
    for (let j = 1; j < finger.joints.length; j++) {
      const idx = finger.joints[j]
      const prev = out[idx]
      tmpA.subVectors(prev, mcp)
      // rotate around Z (curl toward palm, -Z rotation folds fingers forward/down)
      const ang = curl * (j * 0.55)
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      const nx = tmpA.x * cos - tmpA.y * sin
      const ny = tmpA.x * sin + tmpA.y * cos
      prev.set(mcp.x + nx, mcp.y + ny, prev.z + curl * 0.12 * j)
    }
  }
  return out
}
