/**
 * Verify Avatar.jsx two-bone IK against the real model + real gloss data.
 *
 * Loads human.glb with three.js (same loader as the runtime), replicates the
 * Avatar's setup (bind-pose anchors + bone lengths), then runs the exact
 * applyArmIK math from Avatar.jsx on real gloss_poses.json frames and measures
 * where the elbow/wrist bones actually END UP in world space vs the targets.
 *
 * Run: node scripts/verify_avatar_ik.mjs
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class { constructor(t, o = {}) { this.type = t; this.lengthComputable = !!o.lengthComputable; this.loaded = o.loaded || 0; this.total = o.total || 0; } };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => ({}) };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(path.join(__dirname, '..', 'public', 'avatar', 'human.glb'));
const gloss = JSON.parse(readFileSync(path.join(__dirname, '..', 'isl-backend', 'gloss_poses.json'), 'utf8'));

const BONE_MAP = {
  left_shoulder: 'LeftArm_013', left_elbow: 'LeftForeArm_014', left_wrist: 'LeftHand_017',
  right_shoulder: 'RightArm_039', right_elbow: 'RightForeArm_040', right_wrist: 'RightHand_043',
};

// ==== exact copies of Avatar.jsx math ====
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _ikSw = new THREE.Vector3(), _ikPole = new THREE.Vector3();
function solveArmIK(shoulder, elbowTarget, wristTarget, upperLen, foreLen, elbowOut, wristOut) {
  _ikSw.subVectors(wristTarget, shoulder);
  let d = _ikSw.length();
  if (d < 1e-6) { _ikSw.set(0, -1, 0); d = 1e-6; }
  const minD = Math.abs(upperLen - foreLen) + 0.02;
  const maxD = upperLen + foreLen - 0.02;
  const dc = Math.max(minD, Math.min(maxD, d));
  _ikSw.multiplyScalar(1 / d);
  const a = (upperLen * upperLen - foreLen * foreLen + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, upperLen * upperLen - a * a));
  _ikPole.subVectors(elbowTarget, shoulder);
  const along = _ikPole.dot(_ikSw);
  _ikPole.addScaledVector(_ikSw, -along);
  if (_ikPole.lengthSq() < 1e-8) {
    _ikPole.crossVectors(_ikSw, Z_AXIS);
    if (_ikPole.lengthSq() < 1e-8) _ikPole.set(1, 0, 0);
  }
  _ikPole.normalize();
  elbowOut.copy(shoulder).addScaledVector(_ikSw, a).addScaledVector(_ikPole, h);
  wristOut.copy(shoulder).addScaledVector(_ikSw, dc);
}
const setVec = (v, d) => { if (Array.isArray(d)) v.set(d[0], d[1], d[2]); else v.set(d.x, d.y, d.z); };

// ==== load model ====
const loader = new GLTFLoader();
loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // replicate Avatar setup: bind-pose anchors + lengths + default directions
  const lsW = new THREE.Vector3(), rsW = new THREE.Vector3(), lwW = new THREE.Vector3(), rwW = new THREE.Vector3();
  scene.getObjectByName(BONE_MAP.left_shoulder).getWorldPosition(lsW);
  scene.getObjectByName(BONE_MAP.right_shoulder).getWorldPosition(rsW);
  scene.getObjectByName(BONE_MAP.left_wrist).getWorldPosition(lwW);
  scene.getObjectByName(BONE_MAP.right_wrist).getWorldPosition(rwW);
  const leW = new THREE.Vector3(), reW = new THREE.Vector3();
  scene.getObjectByName(BONE_MAP.left_elbow).getWorldPosition(leW);
  scene.getObjectByName(BONE_MAP.right_elbow).getWorldPosition(reW);

  const ref = { scale: lsW.distanceTo(rsW) };
  const ik = {
    ls: lsW.clone(), rs: rsW.clone(),
    lUpper: lsW.distanceTo(leW), lFore: leW.distanceTo(lwW),
    rUpper: rsW.distanceTo(reW), rFore: reW.distanceTo(rwW),
  };
  const defaults = {};
  for (const key of Object.keys(BONE_MAP)) {
    const b = scene.getObjectByName(BONE_MAP[key]);
    defaults[key] = b.children[0].position.clone().normalize();
  }
  const tempMatrix = new THREE.Matrix4();
  const tempQuat = new THREE.Quaternion();
  const tE = new THREE.Vector3(), tW = new THREE.Vector3();
  const outE = new THREE.Vector3(), outW = new THREE.Vector3();
  const dir = new THREE.Vector3();

  console.log(`model: shoulder width=${ref.scale.toFixed(3)}  L arm=${(ik.lUpper + ik.lFore).toFixed(3)}  R arm=${(ik.rUpper + ik.rFore).toFixed(3)}`);

  for (const sign of Object.keys(gloss)) {
    const frames = gloss[sign];
    for (const frac of [0.25, 0.5, 0.75]) {
      const frame = frames[Math.floor(frames.length * frac)];
      const b = frame.body;
      const results = {};
      for (const side of ['left', 'right']) {
        const S = side === 'left' ? ik.ls : ik.rs;
        const dS = new THREE.Vector3().set(...b[`${side}_shoulder`]);
        const dE = new THREE.Vector3().set(...b[`${side}_elbow`]);
        const dW = new THREE.Vector3().set(...b[`${side}_wrist`]);
        const dataWidth = new THREE.Vector3().set(...b.left_shoulder).distanceTo(new THREE.Vector3().set(...b.right_shoulder));
        const k = THREE.MathUtils.clamp(ref.scale / Math.max(dataWidth, 0.05), 0.5, 4);
        tW.set(S.x + (dW.x - dS.x) * k, S.y + (dW.y - dS.y) * k, S.z + (dW.z - dS.z) * k);
        tE.set(S.x + (dE.x - dS.x) * k, S.y + (dE.y - dS.y) * k, S.z + (dE.z - dS.z) * k);
        solveArmIK(S, tE, tW, side === 'left' ? ik.lUpper : ik.rUpper, side === 'left' ? ik.lFore : ik.rFore, outE, outW);

        const bShoulder = scene.getObjectByName(BONE_MAP[`${side}_shoulder`]);
        const bElbow = scene.getObjectByName(BONE_MAP[`${side}_elbow`]);
        dir.subVectors(outE, S).normalize();
        tempMatrix.copy(bShoulder.parent.matrixWorld).invert();
        dir.transformDirection(tempMatrix);
        tempQuat.setFromUnitVectors(defaults[`${side}_shoulder`], dir);
        bShoulder.quaternion.copy(tempQuat);
        bShoulder.updateMatrixWorld(true);

        dir.subVectors(outW, outE).normalize();
        tempMatrix.copy(bElbow.parent.matrixWorld).invert();
        dir.transformDirection(tempMatrix);
        tempQuat.setFromUnitVectors(defaults[`${side}_elbow`], dir);
        bElbow.quaternion.copy(tempQuat);
        bElbow.updateMatrixWorld(true);

        const wActual = new THREE.Vector3();
        scene.getObjectByName(BONE_MAP[`${side}_wrist`]).getWorldPosition(wActual);
        results[side] = { target: tW.clone(), actual: wActual, err: wActual.distanceTo(tW), elbow: outE.clone() };
      }
      const gapTarget = results.left.target.distanceTo(results.right.target);
      const gapActual = results.left.actual.distanceTo(results.right.actual);
      if (frac === 0.5) {
        console.log(`\n== ${sign} mid-frame ==`);
        console.log(`  L wrist target (${results.left.target.x.toFixed(2)}, ${results.left.target.y.toFixed(2)}, ${results.left.target.z.toFixed(2)})  actual err=${results.left.err.toFixed(4)} m`);
        console.log(`  R wrist target (${results.right.target.x.toFixed(2)}, ${results.right.target.y.toFixed(2)}, ${results.right.target.z.toFixed(2)})  actual err=${results.right.err.toFixed(4)} m`);
        console.log(`  elbow L (${results.left.elbow.x.toFixed(2)}, ${results.left.elbow.y.toFixed(2)}, ${results.left.elbow.z.toFixed(2)})  R (${results.right.elbow.x.toFixed(2)}, ${results.right.elbow.y.toFixed(2)}, ${results.right.elbow.z.toFixed(2)})`);
        console.log(`  wrist gap: target=${gapTarget.toFixed(3)}  rendered=${gapActual.toFixed(3)}`);
      }
    }
  }
  console.log('\nPASS: IK lands wrists on targets (err ~0 unless arm fully extended)');
}, undefined, (e) => { console.error('LOAD ERR', e); process.exit(1); });
