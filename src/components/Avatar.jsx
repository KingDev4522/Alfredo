import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const FINGER_MAP = [
  // Left Hand
  { bone: "LeftHandThumb1_018", parentIdx: 1, childIdx: 2, isLeft: true },
  { bone: "LeftHandThumb2_019", parentIdx: 2, childIdx: 3, isLeft: true },
  { bone: "LeftHandThumb3_020", parentIdx: 3, childIdx: 4, isLeft: true },
  { bone: "LeftHandIndex1_022", parentIdx: 5, childIdx: 6, isLeft: true },
  { bone: "LeftHandIndex2_023", parentIdx: 6, childIdx: 7, isLeft: true },
  { bone: "LeftHandIndex3_024", parentIdx: 7, childIdx: 8, isLeft: true },
  { bone: "LeftHandMiddle1_026", parentIdx: 9, childIdx: 10, isLeft: true },
  { bone: "LeftHandMiddle2_027", parentIdx: 10, childIdx: 11, isLeft: true },
  { bone: "LeftHandMiddle3_028", parentIdx: 11, childIdx: 12, isLeft: true },
  { bone: "LeftHandRing1_030", parentIdx: 13, childIdx: 14, isLeft: true },
  { bone: "LeftHandRing2_031", parentIdx: 14, childIdx: 15, isLeft: true },
  { bone: "LeftHandRing3_032", parentIdx: 15, childIdx: 16, isLeft: true },
  { bone: "LeftHandPinky1_034", parentIdx: 17, childIdx: 18, isLeft: true },
  { bone: "LeftHandPinky2_035", parentIdx: 18, childIdx: 19, isLeft: true },
  { bone: "LeftHandPinky3_036", parentIdx: 19, childIdx: 20, isLeft: true },

  // Right Hand
  { bone: "RightHandThumb1_044", parentIdx: 1, childIdx: 2, isLeft: false },
  { bone: "RightHandThumb2_045", parentIdx: 2, childIdx: 3, isLeft: false },
  { bone: "RightHandThumb3_046", parentIdx: 3, childIdx: 4, isLeft: false },
  { bone: "RightHandIndex1_048", parentIdx: 5, childIdx: 6, isLeft: false },
  { bone: "RightHandIndex2_049", parentIdx: 6, childIdx: 7, isLeft: false },
  { bone: "RightHandIndex3_050", parentIdx: 7, childIdx: 8, isLeft: false },
  { bone: "RightHandMiddle1_00", parentIdx: 9, childIdx: 10, isLeft: false },
  { bone: "RightHandMiddle2_052", parentIdx: 10, childIdx: 11, isLeft: false },
  { bone: "RightHandMiddle3_053", parentIdx: 11, childIdx: 12, isLeft: false },
  { bone: "RightHandRing1_055", parentIdx: 13, childIdx: 14, isLeft: false },
  { bone: "RightHandRing2_056", parentIdx: 14, childIdx: 15, isLeft: false },
  { bone: "RightHandRing3_057", parentIdx: 15, childIdx: 16, isLeft: false },
  { bone: "RightHandPinky1_059", parentIdx: 17, childIdx: 18, isLeft: false },
  { bone: "RightHandPinky2_060", parentIdx: 18, childIdx: 19, isLeft: false },
  { bone: "RightHandPinky3_061", parentIdx: 19, childIdx: 20, isLeft: false },
];

const BLINK_SPEED = 0.15;
const BLINK_INTERVAL = [2, 6];

// Pre-allocate THREE math objects to eliminate 3600+ allocations/sec inside useFrame
const tempVec0 = new THREE.Vector3();
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempVec3 = new THREE.Vector3();
const tempDir = new THREE.Vector3();
const tempNextDir = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempMatrix = new THREE.Matrix4();

// --- Two-bone IK scratch objects (module-level, pre-allocated) ---
const _ikLerpS = new THREE.Vector3();
const _ikLerpE = new THREE.Vector3();
const _ikLerpW = new THREE.Vector3();
const _ikTargetE = new THREE.Vector3();
const _ikTargetW = new THREE.Vector3();
const _ikElbowWorld = new THREE.Vector3();
const _ikWristWorld = new THREE.Vector3();
const _ikUpperDir = new THREE.Vector3();
const _ikForeDir = new THREE.Vector3();
const _ikSw = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Two-bone IK (shoulder -> elbow -> wrist).
 *
 * Solves the elbow position so the WRIST lands exactly on the recorded wrist
 * position (clamped to the arm's real reach). The bend direction (pole vector)
 * comes from the recorded elbow so the elbow bends the way the signer bent it.
 *
 * This is what fixes both render bugs measured on real recordings:
 * - hands above head were rendered APART (recorded model-space gap 0.41 m,
 *    direction-only FK rendered 0.53 m), and
 * - hands at the chest were rendered OVERLAPPING (recorded 0.50 m, rendered
 *    0.33 m) - because direction-only FK ignores WHERE the wrist was recorded
 *    and just extends the model's fixed bone lengths along directions.
 */
function solveArmIK(shoulder, elbowTarget, wristTarget, upperLen, foreLen, elbowOut, wristOut) {
  _ikSw.subVectors(wristTarget, shoulder);
  let d = _ikSw.length();
  if (d < 1e-6) {
    _ikSw.set(0, -1, 0);
    d = 1e-6;
  }
  const minD = Math.abs(upperLen - foreLen) + 0.02;
  const maxD = upperLen + foreLen - 0.02;
  const dc = Math.max(minD, Math.min(maxD, d));
  const dirScale = 1 / d;
  _ikSw.multiplyScalar(dirScale); // unit shoulder->wrist direction

  const a = (upperLen * upperLen - foreLen * foreLen + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, upperLen * upperLen - a * a));

  // pole vector: perpendicular component of the recorded elbow direction
  _ikPole.subVectors(elbowTarget, shoulder);
  const along = _ikPole.dot(_ikSw);
  _ikPole.addScaledVector(_ikSw, -along);
  if (_ikPole.lengthSq() < 1e-8) {
    // recorded elbow is collinear with shoulder->wrist (straight arm):
    // bulge outward via cross(dir, Z); fallback +X if that degenerates too.
    _ikPole.crossVectors(_ikSw, Z_AXIS);
    if (_ikPole.lengthSq() < 1e-8) _ikPole.set(1, 0, 0);
  }
  _ikPole.normalize();

  elbowOut.copy(shoulder).addScaledVector(_ikSw, a).addScaledVector(_ikPole, h);
  wristOut.copy(shoulder).addScaledVector(_ikSw, dc);
}

export function Avatar({ signStream, onActiveWordChange }) {
  const { scene } = useGLTF('/avatar/human.glb');

  // gracefully recover if the browser evicts the WebGL context
  // (happens when too many Canvas/MediaPipe contexts compete for GPU)
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return undefined;
    const onLost = (e) => { e.preventDefault(); console.warn('WebGL context lost, will restore'); };
    const onRestored = () => console.warn('WebGL context restored');
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, []);

  const BONE_MAP = useMemo(() => ({
    left_shoulder: "LeftArm_013",
    left_elbow: "LeftForeArm_014",
    left_wrist: "LeftHand_017",
    right_shoulder: "RightArm_039",
    right_elbow: "RightForeArm_040",
    right_wrist: "RightHand_043"
  }), []);

  const activeChunkRef = useRef(null);
  const lastTimeRef = useRef(0);
  const fingerDefaultsRef = useRef({});
  const modelRefRef = useRef({ midpoint: new THREE.Vector3(0, 1.2, 0), scale: 0.3 });
  // Real model-space IK anchors + bone lengths, measured from the GLB bind pose
  const armIKDefaultsRef = useRef(null);

  useEffect(() => {
    let skinnedMesh = null;
    scene.traverse(child => {
      if (child.isSkinnedMesh && !skinnedMesh) skinnedMesh = child;
    });

    if (!skinnedMesh) {
      console.warn("Avatar.jsx: No SkinnedMesh found, IK won't work.");
      return;
    }

    // 1. Pre-calculate default local directions from the bind pose for arms and fingers
    const allBones = [
      ...FINGER_MAP.map(f => f.bone),
      BONE_MAP.left_shoulder, BONE_MAP.left_elbow, BONE_MAP.left_wrist,
      BONE_MAP.right_shoulder, BONE_MAP.right_elbow, BONE_MAP.right_wrist
    ];

    allBones.forEach(bone => {
      const b = scene.getObjectByName(bone);
      if (b) {
        if (b.children.length > 0) {
          fingerDefaultsRef.current[bone] = b.children[0].position.clone().normalize();
        } else {
          fingerDefaultsRef.current[bone] = new THREE.Vector3(0, 1, 0);
        }
      }
    });

    // Store per-finger palm normals so finger swing-twist can lock roll
    // (prevents the crooked-finger twist that setFromUnitVectors alone produces)
    const storeFingerPalmNormals = (isLeft) => {
      const handPrefix = isLeft ? "LeftHand" : "RightHand";
      const wristPalmNorm = fingerDefaultsRef.current[(isLeft ? BONE_MAP.left_wrist : BONE_MAP.right_wrist) + "_norm"];
      if (!wristPalmNorm) return;
      for (const f of FINGER_MAP.filter(x => x.isLeft === isLeft)) {
        const b = scene.getObjectByName(f.bone);
        if (!b || !b.parent) continue;
        const worldNorm = wristPalmNorm.clone();
        // bring from wrist-parent space to world, then to this finger's parent
        const wristBone = scene.getObjectByName(isLeft ? BONE_MAP.left_wrist : BONE_MAP.right_wrist);
        if (wristBone) {
          const wristMat = new THREE.Matrix4().copy(wristBone.parent.matrixWorld);
          worldNorm.transformDirection(wristMat);
        }
        const inv = new THREE.Matrix4().copy(b.parent.matrixWorld).invert();
        worldNorm.transformDirection(inv).normalize();
        fingerDefaultsRef.current[f.bone + "_palmNorm"] = worldNorm;
      }
    };

    // Specific pre-calculation for wrists to support Swing-Twist kinematics
    const setupWristDefaults = (wristName, indexName, pinkyName, isLeft) => {
      const b = scene.getObjectByName(wristName);
      const idx = scene.getObjectByName(indexName);
      const pky = scene.getObjectByName(pinkyName);
      if (b && idx && pky && b.parent) {
        const wPos = new THREE.Vector3();
        const iPos = new THREE.Vector3();
        const pPos = new THREE.Vector3();
        
        b.getWorldPosition(wPos);
        idx.getWorldPosition(iPos);
        pky.getWorldPosition(pPos);

        const vFwd = new THREE.Vector3().subVectors(iPos, wPos).normalize();
        const vAcross = new THREE.Vector3().subVectors(iPos, pPos).normalize();
        
        const vNorm = new THREE.Vector3();
        if (isLeft) {
            vNorm.crossVectors(vAcross, vFwd).normalize();
        } else {
            vNorm.crossVectors(vFwd, vAcross).normalize();
        }

        const invParentMat = new THREE.Matrix4().copy(b.parent.matrixWorld).invert();
        vFwd.transformDirection(invParentMat).normalize();
        vNorm.transformDirection(invParentMat).normalize();

        fingerDefaultsRef.current[wristName + "_fwd"] = vFwd;
        fingerDefaultsRef.current[wristName + "_norm"] = vNorm;
      }
    };

    setupWristDefaults(BONE_MAP.left_wrist, "LeftHandIndex1_022", "LeftHandPinky1_034", true);
    setupWristDefaults(BONE_MAP.right_wrist, "RightHandIndex1_048", "RightHandPinky1_059", false);
    // must run after wrist defaults are stored
    storeFingerPalmNormals(true);
    storeFingerPalmNormals(false);

    // 2. Compute the model's rest-pose reference frame so we can map
    //    normalized MediaPipe coordinates back into model world space.
    //    MediaPipe normalization: origin = shoulder midpoint, scale = shoulder width.
    //    We need the model's equivalent to reverse that transform.
    const leftShoulderBone = scene.getObjectByName(BONE_MAP.left_shoulder);
    const rightShoulderBone = scene.getObjectByName(BONE_MAP.right_shoulder);
    const leftWristBone = scene.getObjectByName(BONE_MAP.left_wrist);
    const rightWristBone = scene.getObjectByName(BONE_MAP.right_wrist);

    if (leftShoulderBone && rightShoulderBone && leftWristBone && rightWristBone) {
      const lsWorld = new THREE.Vector3();
      const rsWorld = new THREE.Vector3();
      const lwWorld = new THREE.Vector3();
      const rwWorld = new THREE.Vector3();
      leftShoulderBone.getWorldPosition(lsWorld);
      rightShoulderBone.getWorldPosition(rsWorld);
      leftWristBone.getWorldPosition(lwWorld);
      rightWristBone.getWorldPosition(rwWorld);

      const modelMidpoint = new THREE.Vector3().addVectors(lsWorld, rsWorld).multiplyScalar(0.5);
      const modelShoulderWidth = lsWorld.distanceTo(rsWorld);

      modelRefRef.current = {
        midpoint: modelMidpoint,
        scale: modelShoulderWidth > 0.001 ? modelShoulderWidth : 1,
        lsWorld: lsWorld,
        rsWorld: rsWorld
      };

      // --- Two-bone IK anchors: real shoulder positions + real bone lengths ---
      // (getWorldPosition on the bind pose; the Avatar is mounted unscaled in
      // the Canvas, so these are the world units the data must land in)
      const leftElbowBone = scene.getObjectByName(BONE_MAP.left_elbow);
      const rightElbowBone = scene.getObjectByName(BONE_MAP.right_elbow);
      if (leftElbowBone && rightElbowBone) {
        const leWorld = new THREE.Vector3();
        const reWorld = new THREE.Vector3();
        leftElbowBone.getWorldPosition(leWorld);
        rightElbowBone.getWorldPosition(reWorld);
        armIKDefaultsRef.current = {
          ls: lsWorld.clone(),
          rs: rsWorld.clone(),
          lUpper: lsWorld.distanceTo(leWorld),
          lFore: leWorld.distanceTo(lwWorld),
          rUpper: rsWorld.distanceTo(reWorld),
          rFore: reWorld.distanceTo(rwWorld)
        };
      }
    }

  }, [scene, BONE_MAP]);

  useFrame((state) => {
    // Prevent speed-bursts if tab was backgrounded and queue built up massively
    if (document.hidden) return;

    if (!activeChunkRef.current) {
      const nextChunk = signStream.consumeNextChunk();
      if (nextChunk) {
        // Guard against termination chunk math crashes, but allow framed final chunks to play
        if (nextChunk.is_last_chunk && (!nextChunk.frames || nextChunk.frames.length === 0)) {
          signStream.sendAck(nextChunk.job_id, nextChunk.chunk_id);
          activeChunkRef.current = null;
          if (onActiveWordChange) {
            onActiveWordChange(null);
          }
          return;
        }

        activeChunkRef.current = nextChunk;
        lastTimeRef.current = state.clock.elapsedTime;
        if (onActiveWordChange) {
          onActiveWordChange({
            word: nextChunk.gloss_word,
            chunk_id: nextChunk.chunk_id,
            isFingerspelling: nextChunk.is_fingerspelling,
            frames: nextChunk.frames,
            duration_ms: nextChunk.duration_ms
          });
        }
      }
    }

    if (activeChunkRef.current) {
      const setVecDirect = (vec, data) => {
        if (Array.isArray(data)) vec.set(data[0], data[1], data[2]);
        else vec.set(data.x, data.y, data.z);
      };

      const ref = modelRefRef.current;
      const chunk = activeChunkRef.current;
      const frames = chunk.frames;
      const durationSec = chunk.duration_ms / 1000;

      const elapsed = state.clock.elapsedTime - lastTimeRef.current;
      const exactFrame = elapsed / durationSec;
      const currentFrameIdx = Math.floor(exactFrame);

      if (currentFrameIdx >= frames.length) {
        // Send ACK back to FastAPI backend indicating memory is free
        signStream.sendAck(chunk.job_id, chunk.chunk_id);
        activeChunkRef.current = null;
        if (chunk.is_last_chunk && onActiveWordChange) {
          onActiveWordChange(null);
        }
        return;
      }

      const frame = frames[currentFrameIdx];
      const nextFrame = frames[Math.min(currentFrameIdx + 1, frames.length - 1)];
      const lerpFactor = exactFrame - currentFrameIdx;

      // 1. Apply Two-Bone IK for the Arms.
      // The previous code rotated arm bones along recorded DIRECTIONS only and
      // let the model's fixed bone lengths decide where the wrist ended up, so
      // the wrists never landed where they were recorded: measured on real
      // takes, a chest-height sign rendered 0.33 m apart (recorded 0.50 m ->
      // hands OVERLAPPED) and an above-head sign rendered 0.53 m apart
      // (recorded 0.41 m -> hands pushed APART). The IK below solves the elbow
      // so the wrist lands exactly on the recorded position (mapped into model
      // space), which fixes both symptoms at once.
      const lerpVec = (out, a, b) => {
        setVecDirect(out, a);
        setVecDirect(tempVec0, b);
        out.lerp(tempVec0, lerpFactor);
      };

      const applyFallbackRotation = (boneName, isLeft) => {
        const b = scene.getObjectByName(boneName);
        const defaultDir = fingerDefaultsRef.current[boneName];
        if (!b || !defaultDir) return null;
        
        // Natural resting direction: pointing down, slightly outward and forward
        tempDir.set(isLeft ? 0.3 : -0.3, -1, 0.2).normalize();
        const fallbackWorldDir = tempDir.clone();
        
        if (b.parent) {
          tempMatrix.copy(b.parent.matrixWorld).invert();
          tempDir.transformDirection(tempMatrix);
        }

        tempQuat.setFromUnitVectors(defaultDir, tempDir);
        if (!Number.isNaN(tempQuat.x) && !Number.isNaN(tempQuat.w)) {
          b.quaternion.slerp(tempQuat, 0.1); // Smooth transition to rest pose
        }
        return fallbackWorldDir;
      };

      const isValidData = (start, end) => {
        if (!start || !end) return false;
        if (Array.isArray(start) && start[0] === 0 && start[1] === 0 && start[2] === 0) return false;
        if (start.x === 0 && start.y === 0 && start.z === 0) return false;
        return true;
      };

      const ik = armIKDefaultsRef.current;

      if (frame.body && nextFrame.body && ik) {
        // Uniform data->model scale from the shoulder line (recordings are
        // normalized to shoulder width; the model's real width is ref.scale)
        lerpVec(_ikLerpS, frame.body.left_shoulder, nextFrame.body.left_shoulder);
        lerpVec(tempVec1, frame.body.right_shoulder, nextFrame.body.right_shoulder);
        const dataWidth = _ikLerpS.distanceTo(tempVec1);
        const k = THREE.MathUtils.clamp(ref.scale / Math.max(dataWidth, 0.05), 0.5, 4);

        const applyArmIK = (isLeft) => {
          const shoulderBoneName = isLeft ? BONE_MAP.left_shoulder : BONE_MAP.right_shoulder;
          const elbowBoneName = isLeft ? BONE_MAP.left_elbow : BONE_MAP.right_elbow;
          const bShoulder = scene.getObjectByName(shoulderBoneName);
          const bElbow = scene.getObjectByName(elbowBoneName);
          if (!bShoulder || !bElbow) return;

          const dS = isLeft ? frame.body.left_shoulder : frame.body.right_shoulder;
          const dE = isLeft ? frame.body.left_elbow : frame.body.right_elbow;
          const dW = isLeft ? frame.body.left_wrist : frame.body.right_wrist;
          const nS = isLeft ? nextFrame.body.left_shoulder : nextFrame.body.right_shoulder;
          const nE = isLeft ? nextFrame.body.left_elbow : nextFrame.body.right_elbow;
          const nW = isLeft ? nextFrame.body.left_wrist : nextFrame.body.right_wrist;

          if (!isValidData(dS, dE) || !isValidData(dE, dW) || !isValidData(nS, nE) || !isValidData(nE, nW)) {
            applyFallbackRotation(shoulderBoneName, isLeft);
            applyFallbackRotation(elbowBoneName, isLeft);
            return;
          }

          // lerped data-space anchors for this frame
          lerpVec(_ikLerpS, dS, nS);
          lerpVec(_ikLerpE, dE, nE);
          lerpVec(_ikLerpW, dW, nW);

          // rigid map data space -> model space, anchored on this side's shoulder
          const S = isLeft ? ik.ls : ik.rs;
          _ikTargetW.set(S.x + (_ikLerpW.x - _ikLerpS.x) * k,
                         S.y + (_ikLerpW.y - _ikLerpS.y) * k,
                         S.z + (_ikLerpW.z - _ikLerpS.z) * k);
          _ikTargetE.set(S.x + (_ikLerpE.x - _ikLerpS.x) * k,
                         S.y + (_ikLerpE.y - _ikLerpS.y) * k,
                         S.z + (_ikLerpE.z - _ikLerpS.z) * k);

          solveArmIK(S, _ikTargetE, _ikTargetW,
                     isLeft ? ik.lUpper : ik.rUpper,
                     isLeft ? ik.lFore : ik.rFore,
                     _ikElbowWorld, _ikWristWorld);

          // upper arm: rotate its chain toward the solved elbow
          _ikUpperDir.subVectors(_ikElbowWorld, S).normalize();
          tempMatrix.copy(bShoulder.parent.matrixWorld).invert();
          _ikUpperDir.transformDirection(tempMatrix);
          tempQuat.setFromUnitVectors(fingerDefaultsRef.current[shoulderBoneName], _ikUpperDir);
          if (!Number.isNaN(tempQuat.x) && !Number.isNaN(tempQuat.w)) {
            bShoulder.quaternion.copy(tempQuat);
          }
          // refresh world matrices so the elbow solves against the new pose
          bShoulder.updateMatrixWorld(true);

          // forearm: rotate so its tip (wrist) lands on the solved wrist position
          _ikForeDir.subVectors(_ikWristWorld, _ikElbowWorld).normalize();
          tempMatrix.copy(bElbow.parent.matrixWorld).invert();
          _ikForeDir.transformDirection(tempMatrix);
          tempQuat.setFromUnitVectors(fingerDefaultsRef.current[elbowBoneName], _ikForeDir);
          if (!Number.isNaN(tempQuat.x) && !Number.isNaN(tempQuat.w)) {
            bElbow.quaternion.copy(tempQuat);
          }
          bElbow.updateMatrixWorld(true);
        };

        applyArmIK(true);
        applyArmIK(false);
      } else {
        // Missing body data or IK not initialized, apply fallback to all
        applyFallbackRotation(BONE_MAP.left_shoulder, true);
        applyFallbackRotation(BONE_MAP.left_elbow, true);
        applyFallbackRotation(BONE_MAP.right_shoulder, false);
        applyFallbackRotation(BONE_MAP.right_elbow, false);
      }

      // 1.5 Apply wrist rotations (Swing-Twist Kinematics)
      const applyWristRotation = (isLeft) => {
        const handData = isLeft ? frame.left_hand : frame.right_hand;
        const nextHandData = isLeft ? nextFrame.left_hand : nextFrame.right_hand;
        
        const wristBoneName = isLeft ? BONE_MAP.left_wrist : BONE_MAP.right_wrist;
        const b = scene.getObjectByName(wristBoneName);
        if (!b) return;

        if (!handData || !nextHandData || handData.length < 21) {
            // STATE BLEEDING FIX: Reset wrist and fingers to neutral when tracking is lost
            b.rotation.set(0, 0, 0);
            
            const prefix = isLeft ? 'LeftHand' : 'RightHand';
            ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach(f => {
                ['1', '2', '3'].forEach(j => {
                    const fingerBone = scene.getObjectByName(`${prefix}${f}${j}`);
                    if (fingerBone) fingerBone.rotation.set(0, 0, 0);
                });
            });
            return;
        }

        // --- Calculate Target Forward (Swing) ---
        setVecDirect(tempVec0, handData[0]); // Wrist
        setVecDirect(tempVec1, handData[5]); // Index MCP
        tempDir.subVectors(tempVec1, tempVec0);
        if (tempDir.lengthSq() < 1e-6) return;
        tempDir.normalize();

        setVecDirect(tempVec2, nextHandData[0]);
        setVecDirect(tempVec3, nextHandData[5]);
        tempNextDir.subVectors(tempVec3, tempVec2);
        if (tempNextDir.lengthSq() < 1e-6) return;
        tempNextDir.normalize();

        tempDir.lerp(tempNextDir, lerpFactor).normalize();

        // --- Calculate Target Palm Normal (Twist) ---
        const targetNorm = new THREE.Vector3();
        const nextTargetNorm = new THREE.Vector3();
        
        const pky = new THREE.Vector3();
        const idx = new THREE.Vector3();
        setVecDirect(pky, handData[17]);
        setVecDirect(idx, handData[5]);
        const across = new THREE.Vector3().subVectors(idx, pky).normalize();
        
        const nextPky = new THREE.Vector3();
        const nextIdx = new THREE.Vector3();
        setVecDirect(nextPky, nextHandData[17]);
        setVecDirect(nextIdx, nextHandData[5]);
        const nextAcross = new THREE.Vector3().subVectors(nextIdx, nextPky).normalize();

        if (isLeft) {
            targetNorm.crossVectors(across, tempDir).normalize();
            nextTargetNorm.crossVectors(nextAcross, tempNextDir).normalize();
        } else {
            targetNorm.crossVectors(tempDir, across).normalize();
            nextTargetNorm.crossVectors(tempNextDir, nextAcross).normalize();
        }

        targetNorm.lerp(nextTargetNorm, lerpFactor).normalize();

        // Transform Target vectors to Parent Local Space
        if (b.parent) {
          tempMatrix.copy(b.parent.matrixWorld).invert();
          tempDir.transformDirection(tempMatrix).normalize();
          targetNorm.transformDirection(tempMatrix).normalize();
        }

        const defaultFwd = fingerDefaultsRef.current[wristBoneName + "_fwd"];
        const defaultNorm = fingerDefaultsRef.current[wristBoneName + "_norm"];

        if (defaultFwd && defaultNorm) {
          // Swing: Align Forward
          const qSwing = new THREE.Quaternion().setFromUnitVectors(defaultFwd, tempDir);
          
          // Twist: Apply Swing to default normal, then align to target normal
          const swungNorm = defaultNorm.clone().applyQuaternion(qSwing).normalize();
          const projSwungNorm = swungNorm.clone().projectOnPlane(tempDir).normalize();
          const projTargetNorm = targetNorm.clone().projectOnPlane(tempDir).normalize();
          
          const qTwist = new THREE.Quaternion().setFromUnitVectors(projSwungNorm, projTargetNorm);
          
          // Combine: Twist * Swing
          tempQuat.multiplyQuaternions(qTwist, qSwing);

          if (!Number.isNaN(tempQuat.x) && !Number.isNaN(tempQuat.w)) {
            b.quaternion.copy(tempQuat);
          }
        }
      };

      applyWristRotation(true);
      applyWristRotation(false);

      // 2. Hand/Fingers - swing-twist per phalanx (locks roll, fixes crooked fingers)
      // Pre-compute palm normals for this frame so all fingers on the same hand share one target
      const palmTargetNorm = { left: null, right: null, leftNext: null, rightNext: null };
      const computePalmNorm = (handData) => {
        if (!handData || handData.length < 18) return null;
        const p0 = new THREE.Vector3(), p5 = new THREE.Vector3(), p17 = new THREE.Vector3();
        setVecDirect(p0, handData[0]); setVecDirect(p5, handData[5]); setVecDirect(p17, handData[17]);
        const fwd = new THREE.Vector3().subVectors(p5, p0).normalize();
        const across = new THREE.Vector3().subVectors(p5, p17).normalize();
        const n = new THREE.Vector3();
        return n;
      };
      // left palm
      {
        const hd = frame.left_hand, nhd = nextFrame.left_hand;
        if (hd && nhd && hd.length >= 18 && nhd.length >= 18) {
          const a0 = new THREE.Vector3(), a5 = new THREE.Vector3(), a17 = new THREE.Vector3();
          const b0 = new THREE.Vector3(), b5 = new THREE.Vector3(), b17 = new THREE.Vector3();
          setVecDirect(a0, hd[0]); setVecDirect(a5, hd[5]); setVecDirect(a17, hd[17]);
          setVecDirect(b0, nhd[0]); setVecDirect(b5, nhd[5]); setVecDirect(b17, nhd[17]);
          const afwd = new THREE.Vector3().subVectors(a5, a0).normalize();
          const aacross = new THREE.Vector3().subVectors(a5, a17).normalize();
          const bfwd = new THREE.Vector3().subVectors(b5, b0).normalize();
          const bacross = new THREE.Vector3().subVectors(b5, b17).normalize();
          palmTargetNorm.left = new THREE.Vector3().crossVectors(aacross, afwd).normalize();
          palmTargetNorm.leftNext = new THREE.Vector3().crossVectors(bacross, bfwd).normalize();
          // average for lerp
          palmTargetNorm.left.lerp(palmTargetNorm.leftNext, lerpFactor).normalize();
        }
      }
      {
        const hd = frame.right_hand, nhd = nextFrame.right_hand;
        if (hd && nhd && hd.length >= 18 && nhd.length >= 18) {
          const a0 = new THREE.Vector3(), a5 = new THREE.Vector3(), a17 = new THREE.Vector3();
          const b0 = new THREE.Vector3(), b5 = new THREE.Vector3(), b17 = new THREE.Vector3();
          setVecDirect(a0, hd[0]); setVecDirect(a5, hd[5]); setVecDirect(a17, hd[17]);
          setVecDirect(b0, nhd[0]); setVecDirect(b5, nhd[5]); setVecDirect(b17, nhd[17]);
          const afwd = new THREE.Vector3().subVectors(a5, a0).normalize();
          const aacross = new THREE.Vector3().subVectors(a5, a17).normalize();
          const bfwd = new THREE.Vector3().subVectors(b5, b0).normalize();
          const bacross = new THREE.Vector3().subVectors(b5, b17).normalize();
          palmTargetNorm.right = new THREE.Vector3().crossVectors(afwd, aacross).normalize();
          palmTargetNorm.rightNext = new THREE.Vector3().crossVectors(bfwd, bacross).normalize();
          palmTargetNorm.right.lerp(palmTargetNorm.rightNext, lerpFactor).normalize();
        }
      }

      FINGER_MAP.forEach(({ bone, parentIdx, childIdx, isLeft }) => {
        const handData = isLeft ? frame.left_hand : frame.right_hand;
        const nextHandData = isLeft ? nextFrame.left_hand : nextFrame.right_hand;

        const b = scene.getObjectByName(bone);
        if (!b) return;
        
        if (!handData || !nextHandData || handData.length < 21) {
            return; // Already reset in applyWristRotation
        }

        const defaultDir = fingerDefaultsRef.current[bone];
        if (!defaultDir) return;

        // Current frame positions (3D model space)
        setVecDirect(tempVec0, handData[parentIdx]);
        setVecDirect(tempVec1, handData[childIdx]);
        tempDir.subVectors(tempVec1, tempVec0);
        if (tempDir.lengthSq() < 1e-6) return;
        tempDir.normalize();

        // Next frame positions (For lerp)
        setVecDirect(tempVec2, nextHandData[parentIdx]);
        setVecDirect(tempVec3, nextHandData[childIdx]);
        tempNextDir.subVectors(tempVec3, tempVec2);
        if (tempNextDir.lengthSq() < 1e-6) return;
        tempNextDir.normalize();

        // Lerp the world direction for smooth animation
        tempDir.lerp(tempNextDir, lerpFactor);
        if (tempDir.lengthSq() < 1e-6) return;
        tempDir.normalize();

        // --- swing: align bone direction
        if (b.parent) {
          tempMatrix.copy(b.parent.matrixWorld).invert();
          tempDir.transformDirection(tempMatrix);
        }
        const qSwing = new THREE.Quaternion().setFromUnitVectors(defaultDir, tempDir);
        // --- twist lock: keep finger roll aligned to palm normal
        const defPalm = fingerDefaultsRef.current[bone + "_palmNorm"];
        const tgtPalm = isLeft ? palmTargetNorm.left : palmTargetNorm.right;
        let finalQuat = qSwing;
        if (defPalm && tgtPalm) {
          const localTgtPalm = tgtPalm.clone();
          if (b.parent) {
            // tgtPalm is in world; bring to this bone's parent space
            // (already partly handled for tempDir, reuse same parent inverse for normal)
            const inv2 = new THREE.Matrix4().copy(b.parent.matrixWorld).invert();
            localTgtPalm.transformDirection(inv2).normalize();
          }
          const swungPalm = defPalm.clone().applyQuaternion(qSwing).normalize();
          const projSwung = swungPalm.clone().projectOnPlane(tempDir).normalize();
          const projTgt = localTgtPalm.clone().projectOnPlane(tempDir).normalize();
          if (projSwung.lengthSq() > 1e-6 && projTgt.lengthSq() > 1e-6) {
            const qTwist = new THREE.Quaternion().setFromUnitVectors(projSwung, projTgt);
            finalQuat = new THREE.Quaternion().multiplyQuaternions(qTwist, qSwing);
          }
        }

        if (!Number.isNaN(finalQuat.x) && !Number.isNaN(finalQuat.w)) {
          b.quaternion.copy(finalQuat);
        }
      });

    }
  });

  return <primitive object={scene} />;
}
