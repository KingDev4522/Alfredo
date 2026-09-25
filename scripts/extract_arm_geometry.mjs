/**
 * Extract arm bone bind-pose geometry from public/avatar/human.glb.
 *
 * Uses three.js itself (same loader + same scene-graph math as the runtime
 * Avatar) so the numbers are exactly what Avatar.jsx sees at startup.
 * Prints JSON: world positions of arm bones, bone lengths, shoulder positions.
 *
 * Run: node scripts/extract_arm_geometry.mjs
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Node lacks browser globals three's FileLoader expects
if (typeof globalThis.self === 'undefined') { globalThis.self = globalThis; }
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, opts = {}) { this.type = type; this.lengthComputable = !!opts.lengthComputable; this.loaded = opts.loaded || 0; this.total = opts.total || 0; }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => ({}) };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glbPath = path.join(__dirname, '..', 'public', 'avatar', 'human.glb');

// three's GLTFLoader wants a URL; feed it a data URL of the file bytes
const buf = readFileSync(glbPath);
const b64 = buf.toString('base64');
const url = 'data:model/gltf-binary;base64,' + b64;

const loader = new GLTFLoader();
// parse with a no-op onError; textures fail silently in Node but bones load fine
try {
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const scene = gltf.scene;
  // mimic runtime: update world matrices once
  scene.updateMatrixWorld(true);

  const names = [
    'LeftShoulder_012', 'LeftArm_013', 'LeftForeArm_014', 'LeftHand_017',
    'RightShoulder_038', 'RightArm_039', 'RightForeArm_040', 'RightHand_043',
  ];

  const out = { positions: {}, lengths: {}, scaleOfScene: 1 };
  const get = (n) => scene.getObjectByName(n);

  for (const n of names) {
    const b = get(n);
    if (!b) { out.positions[n] = null; continue; }
    const p = new THREE.Vector3();
    b.getWorldPosition(p);
    out.positions[n] = [p.x, p.y, p.z];
  }

  const pairs = [
    ['L upper', 'LeftArm_013', 'LeftForeArm_014'],
    ['L fore', 'LeftForeArm_014', 'LeftHand_017'],
    ['R upper', 'RightArm_039', 'RightForeArm_040'],
    ['R fore', 'RightForeArm_040', 'RightHand_043'],
    ['L shoulder-clavicle', 'LeftShoulder_012', 'LeftArm_013'],
    ['R shoulder-clavicle', 'RightShoulder_038', 'RightArm_039'],
  ];
  for (const [label, a, b] of pairs) {
    const ba = get(a), bb = get(b);
    if (!ba || !bb) { out.lengths[label] = null; continue; }
    const pa = new THREE.Vector3(), pb = new THREE.Vector3();
    ba.getWorldPosition(pa); bb.getWorldPosition(pb);
    out.lengths[label] = pa.distanceTo(pb);
  }

  // wrist distance in bind pose + shoulder width (runtime scale reference)
  const lw = get('LeftHand_017'), rw = get('RightHand_043');
  const ls = get('LeftArm_013'), rs = get('RightArm_039');
  if (lw && rw) {
    const a = new THREE.Vector3(), b2 = new THREE.Vector3();
    lw.getWorldPosition(a); rw.getWorldPosition(b2);
    out.wristDistBind = a.distanceTo(b2);
  }
  if (ls && rs) {
    const a = new THREE.Vector3(), b2 = new THREE.Vector3();
    ls.getWorldPosition(a); rs.getWorldPosition(b2);
    out.shoulderWidthBind = a.distanceTo(b2);
  }

  console.log(JSON.stringify(out, null, 2));
}, undefined, (err) => {
  console.error('LOAD ERROR', String(err));
});
} catch (e) {
  console.error('PARSE ERROR', String(e));
  process.exit(1);
}
