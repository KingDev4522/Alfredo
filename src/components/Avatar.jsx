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


/*
 * Unit bridge between the backend and this model.
 *
 * isl-backend/routers/database.py `to_model_space()` bakes every landmark into
 * "raw GLB units" using a hardcoded shoulder span of 0.2845. The Avatar, on
 * the other hand, poses bones in WORLD units, and public/avatar/human.glb has
 * a scene root carrying a 2.0862 scale, so the model's real world shoulder
 * span is 0.5936 - not 0.2845.
 *
 * That mismatch is why the arms never reached: mapping the data 1:1 drove the
 * wrist to a target only 0.37-0.42 of the arm's 1.039 m reach, so solveArmIK
 * had nothing to solve and the hands stayed jammed in against the body.
 *
 * The ratio is measured from the loaded skeleton at runtime (below) rather
 * than hardcoded, so replacing the GLB cannot silently reintroduce this.
 * DATA_SHOULDER_SPAN must stay in step with to_model_space in the backend.
 */
const DATA_SHOULDER_SPAN = 0.2845;

const HEAD_BONE = 'Head_08';
const HEAD_TOP_BONE = 'HeadTop_End_011';
const EYE_BONES = ['LeftEye_09', 'RightEye_010'];

/* Height resolution of the measured torso collider. */
const TORSO_BUCKET = 0.1;
const TORSO_Y_MIN = 1.6;
const TORSO_Y_MAX = 3.1;
const TORSO_HALF_WIDTH = 0.35;

/*
 * SIGNING SPACE.
 *
 * "The signing space for most signed languages encompasses the area between
 * the hips and the top of the head, from the body to the forward and sideways
 * reaches of the hands. A few signs are made outside this space, for example,
 * above the head or below the hips." (Gallaudet, The Signing Family)
 * "Signing space ... is the three dimensional space in front of the signer's
 * body, generally considered being constrained to the horizontal and the
 * frontal plane in front of the signer's torso." (The Meaning of Space in
 * Sign Language)
 *
 * So the default workspace is a bounded volume, and a hand outside it is a
 * rendering error, not a valid sign. Measured on this GLB the volume spans
 * Hips_01 at y = 1.843 up to the crown at HeadTop_End_011 y = 3.400.
 *
 * The upper bound is the one that matters here. Raised arms were being driven
 * past the crown of the head, so the avatar showed the hands above the head
 * when the sign was made in front of the face or chest. The workspace is the
 * fix that is actually grounded in the linguistics, and it is applied to the
 * wrist target before the IK, so both arms respect it.
 *
 * SIGNS_ALLOW_ABOVE_HEAD exists because the literature does note the
 * exception. It is off by default; turn it on only for a lexicon where
 * overhead signs are genuinely performed.
 */
const SIGNING_SPACE_TOP = 3.40;
const SIGNING_SPACE_BOTTOM = 1.84;
const SIGNS_ALLOW_ABOVE_HEAD = false;

function clampToSigningSpace(target) {
  if (!target) return;
  if (!SIGNS_ALLOW_ABOVE_HEAD && target.y > SIGNING_SPACE_TOP) target.y = SIGNING_SPACE_TOP;
  if (target.y < SIGNING_SPACE_BOTTOM) target.y = SIGNING_SPACE_BOTTOM;
}

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
const _ikLerpW = new THREE.Vector3();
const _ikTargetW = new THREE.Vector3();
const _ikTargetR = new THREE.Vector3();
const _ikLerpW2 = new THREE.Vector3();
const _ikElbowWorld = new THREE.Vector3();
const _ikWristWorld = new THREE.Vector3();
const _ikUpperDir = new THREE.Vector3();
const _ikForeDir = new THREE.Vector3();
const _ikSw = new THREE.Vector3();
const _ikModelMid = new THREE.Vector3();
const _ikDataMid = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Per-frame palm normals, derived from the wrist->knuckle triangle each
// frame below (null until the first frame with usable hand data; readers
// must tolerate null, see the defPalm/tgtPalm guard in FINGER_MAP loop).
const palmTargetNorm = { left: null, leftNext: null, right: null, rightNext: null };

/*
 * Keeps a wrist target out of the head volume, pushing it FORWARD (+Z, the
 * direction the model faces) rather than letting it sit behind the skull.
 *
 * Measured on this GLB the model faces +Z, the head bone is at z = -0.010 and
 * the eyes at z = +0.162, so a wrist at z < faceZ and inside the head's
 * lateral disc is behind the face. The backend's apply_capsule_collision is a
 * deliberate no-op and the face guard there is commented out, so nothing else
 * was preventing this.
 *
 * Only a wrist already inside the head's silhouette AND behind the face plane
 * is moved. A hand beside the temple, or already in front, is left untouched,
 * so this cannot squash wide signs or stop two hands meeting.
 */
function pushOutOfHead(target, guard) {
  if (!guard) return;
  const dx = target.x - guard.centre.x;
  const dy = target.y - guard.centre.y;
  const lateral = Math.hypot(dx, dy);
  if (lateral >= guard.radius) return;
  if (target.z >= guard.faceZ) return;
  target.z = guard.faceZ;
}

/*
 * A recorded hand cloud is only usable if it still describes a hand.
 *
 * The x/y frame clamp in to_model_space is what makes this necessary. For the
 * takes whose raw landmarks were far outside the image, clamping pins every
 * hand landmark to the same y, so all 21 points collapse onto a flat line and
 * the phalanx segments shrink to a few tenths of a millimetre. The finger code
 * then normalises those near-zero vectors, and the resulting directions are
 * pure floating point noise, which renders as mangled, splayed fingers.
 *
 * The test is the area of the palm triangle wrist(0) - index MCP(5) - pinky
 * MCP(17). Real takes measure 0.001-0.0035 m2 here: A 0.00227/0.00225,
 * B 0.00271/0.00273, HELLO 0.00309/0.00319. A collapsed cloud measures far
 * less, and the historical failure was 0.0000 exactly.
 */
const MIN_PALM_AREA = 0.0006;

function handIsUsable(handData) {
  if (!handData || handData.length < 21) return false;
  const wrist = handData[0];
  const index = handData[5];
  const pinky = handData[17];
  if (!wrist || !index || !pinky) return false;

  // area = 0.5 * |(index - wrist) x (pinky - wrist)|
  const ux = index[0] - wrist[0], uy = index[1] - wrist[1], uz = index[2] - wrist[2];
  const vx = pinky[0] - wrist[0], vy = pinky[1] - wrist[1], vz = pinky[2] - wrist[2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  return Number.isFinite(area) && area >= MIN_PALM_AREA;
}

/* Puts a hand's bones back to the GLB bind pose, not to identity. */
function restoreHandToBindPose(scene, isLeft, handRestQuat) {
  const wristName = isLeft ? BONE_MAP.left_wrist : BONE_MAP.right_wrist;
  const wrist = scene.getObjectByName(wristName);
  const rest = handRestQuat.current;
  if (wrist && rest[wristName]) wrist.quaternion.copy(rest[wristName]);
  for (const f of FINGER_MAP) {
    if (f.isLeft !== isLeft) continue;
    const b = scene.getObjectByName(f.bone);
    if (b && rest[f.bone]) b.quaternion.copy(rest[f.bone]);
  }
}

/*
 * TORSO ANTI-PENETRATION.
 *
 * A sign performed at chest or stomach height puts the hands right where the
 * body is. If the wrist target is left inside the torso the hand renders
 * embedded, which is what "in front of my chest but it shows inside my body"
 * looks like. Measured on the stored takes, 7 of 120 HELLO wrists were inside
 * the torso volume before this existed.
 *
 * The collider is fitted to the actual mesh rather than guessed: see
 * measureTorsoProfile, which bins every torso vertex by height and records
 * the front and back surface. Using a single sphere or capsule is not enough
 * here because the front surface is strongly non-circular in profile: it sits
 * at z = +0.25 over the stomach, +0.31 at the chest, then falls back to +0.18
 * at the neck. One radius would either bury the hands at the neck or shove
 * them 5 cm off the chest.
 *
 * Only a wrist that is genuinely inside the volume is moved, and it is moved
 * along the shortest exit, which for a chest or stomach sign is forward (+Z,
 * the direction this model faces). A hand beside the hip is untouched.
 */
/*
 * Fits a torso collider to the actual mesh, once, at load.
 *
 * This follows the approach VRM tools use: derive tapered capsule colliders
 * from the mesh rather than hand-authoring them, so the collider is correct
 * for whatever model is loaded. Every skinned-mesh vertex is binned by height
 * inside the torso band and the front/back surface and half width are recorded
 * per slice. One pass over ~4.5k vertices at load, then an O(1) lookup per
 * wrist per frame.
 *
 * The T-pose bind pose is what is measured, which is correct: the torso does
 * not move under arm IK, only the arms do.
 */
function measureTorsoProfile(scene) {
  const buckets = new Map();
  const v = new THREE.Vector3();
  const meshes = [];
  scene.traverse((c) => { if (c.isSkinnedMesh || c.isMesh) meshes.push(c); });

  for (const mesh of meshes) {
    const attr = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position;
    if (!attr) continue;
    for (let i = 0; i < attr.count; i++) {
      v.fromBufferAttribute(attr, i);
      mesh.localToWorld(v);
      if (v.y < TORSO_Y_MIN || v.y > TORSO_Y_MAX) continue;
      if (Math.abs(v.x) > TORSO_HALF_WIDTH) continue;   // arms/hands in the T-pose
      const key = Math.round(v.y / TORSO_BUCKET) * TORSO_BUCKET;
      const cur = buckets.get(key) || { y: key, frontZ: -Infinity, backZ: Infinity, halfWidth: 0 };
      cur.frontZ = Math.max(cur.frontZ, v.z);
      cur.backZ = Math.min(cur.backZ, v.z);
      cur.halfWidth = Math.max(cur.halfWidth, Math.abs(v.x));
      buckets.set(key, cur);
    }
  }

  return { buckets: [...buckets.values()].sort((a, b) => a.y - b.y) };
}

function pushOutOfTorso(target, profile) {
  if (!profile || !profile.buckets || profile.buckets.length === 0) return;
  const key = Math.round(target.y / TORSO_BUCKET) * TORSO_BUCKET;
  let closest = null;
  let bestDelta = Infinity;
  for (const b of profile.buckets) {
    const d = Math.abs(b.y - key);
    if (d < bestDelta) { bestDelta = d; closest = b; }
    if (d === 0) break;
  }
  if (!closest) return;

  // inside the torso width and between the back and front surface?
  if (Math.abs(target.x) > closest.halfWidth) return;
  if (target.z >= closest.frontZ || target.z <= closest.backZ) return;

  // exit through whichever surface is nearer
  const outFront = closest.frontZ - target.z;
  const outBack = target.z - closest.backZ;
  if (outFront <= outBack) target.z = closest.frontZ;
  else target.z = closest.backZ;
}

/*
 * TWO-HANDED COORDINATION.
 *
 * Each arm is solved independently, so a two-handed sign only comes out right
 * if the two recorded wrists already happen to agree. When the signer brings
 * their hands together the recordings disagree slightly, and worse, each arm
 * can be clamped by its own reach, so the hands drift apart and never meet.
 *
 * This snaps the pair to a single shared target, the way Unreal's Hand
 * IK Retargeting resolves two bones holding one object: take the midpoint of
 * the two recorded wrists and place both hands symmetrically about it, with
 * the centre-to-centre distance fixed to one palm width. Symmetry about the
 * midpoint is what makes it read as a deliberate two-handed sign instead of two
 * unrelated arms.
 *
 * The blend is continuous, keyed on the recorded separation, so crossing the
 * threshold does not pop. A palm is about 0.09 m wide, so palms flat together
 * put the wrists ~0.11 m apart.
 */
const PALM_GAP = 0.11;
const TWO_HANDED_NEAR = 0.13;   // at or below this, fully snapped together
const TWO_HANDED_FAR = 0.26;    // at or above this, fully independent

/*
 * BATTISON SYMMETRY CONDITION (1978), as a soft prior.
 *
 * "When two-handed [signs] and symmetrical movement, then the two hands must
 * show the same movement, whether in phase or out of phase; they must also
 * share the same general location and handshape." SGNify (CVPR 2023) encodes it
 * as a penalty on the difference between the right and left estimates, with a
 * weight: Ls = lambda * ||theta_right - mirror(theta_left)||^2. This does the
 * same thing to the wrist targets, with mirror() being a flip across the
 * midsagittal plane.
 *
 * It has to be soft. Hard mirroring would destroy genuinely one-handed signs.
 * So the weight is gated on a two-handed test first: sum each hand's path
 * length, and if one exceeds the other by more than 3x the sign is one-handed
 * and no correction is applied. That threshold is the one published for this
 * purpose (Borstell et al., Frontiers in Psychology 2018).
 *
 * Measured on the stored takes, that test and the asymmetry it gates line up:
 *
 *   A      path ratio 1.10  two-handed   mirror dx -0.133  consistency 1.00
 *   B      path ratio 1.43  two-handed   mirror dx -0.137  consistency 1.00
 *   HELLO  path ratio 1.14  two-handed   mirror dx -0.132  consistency 1.00
 *   BAD    path ratio 6.59  ONE-HANDED   mirror dx +0.280, dy -1.015
 *
 * The three two-handed takes all carry the same ~13 cm mirror bias in x with
 * consistency 1.00, meaning it points the same way on every single frame. A
 * real pose varies frame to frame. HELLO's depth asymmetry is exactly 0.000,
 * which confirms the bias is a fixed rig/tracker offset rather than the signer
 * moving asymmetrically. BAD is correctly rejected by the ratio test and keeps
 * its genuine asymmetry.
 */
const SYMMETRY_LAMBDA = 0.4;
const ONE_HANDED_PATH_RATIO = 3;

const _symL = new THREE.Vector3();

/* Frames arrive as either [x,y,z] arrays or {x,y,z} objects, see setVecDirect. */
function pointComponents(p) {
  if (!p) return null;
  if (Array.isArray(p)) return [p[0], p[1], p[2]];
  return [p.x, p.y, p.z];
}

/*
 * Two-handed vs one-handed, from Borstell et al. (Frontiers in Psychology
 * 2018): sum each hand's path length, and if one exceeds the other by more
 * than 3x the sign is one-handed.
 *
 * Path length is accumulated TORSO RELATIVE, with the per-frame shoulder
 * midpoint subtracted, so whole-body sway does not count as hand movement.
 * That matters: measured on the stored takes, B is ratio 1.43 torso relative
 * but over 3x in raw frame space, where a step sideways inflates both hands
 * and flatters the ratio. Torso relative gives A 1.10, B 1.43, HELLO 1.14 and
 * BAD 6.59, which separates the two-handed takes from the one-handed one.
 */
function computeSymmetryWeight(frames) {
  if (!frames || frames.length < 3) return 0;
  let left = 0;
  let right = 0;
  let prevL = null;
  let prevR = null;
  let samples = 0;

  for (const f of frames) {
    const b = f && f.body;
    if (!b) return 0;
    const l = pointComponents(b.left_wrist);
    const r = pointComponents(b.right_wrist);
    const ls = pointComponents(b.left_shoulder);
    const rs = pointComponents(b.right_shoulder);
    if (!l || !r || !ls || !rs) continue;
    if (!l.every(Number.isFinite) || !r.every(Number.isFinite)) return 0;
    const mx = (ls[0] + rs[0]) / 2;
    const my = (ls[1] + rs[1]) / 2;
    const mz = (ls[2] + rs[2]) / 2;
    const l2 = [l[0] - mx, l[1] - my, l[2] - mz];
    const r2 = [r[0] - mx, r[1] - my, r[2] - mz];
    if (prevL) left += Math.hypot(l2[0] - prevL[0], l2[1] - prevL[1], l2[2] - prevL[2]);
    if (prevR) right += Math.hypot(r2[0] - prevR[0], r2[1] - prevR[1], r2[2] - prevR[2]);
    prevL = l2;
    prevR = r2;
    samples++;
  }

  if (samples < 3) return 0;
  // NaN-safety: a non-finite total must not fall through to "two-handed",
  // because every comparison against NaN is false.
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  const shorter = Math.min(left, right);
  if (shorter <= 1e-6) return 0;   // a still hand tells us nothing
  const ratio = Math.max(left, right) / shorter;
  return ratio > ONE_HANDED_PATH_RATIO ? 0 : SYMMETRY_LAMBDA;
}

/*
 * Pulls each wrist toward the MIRROR IMAGE of the other,
 not toward a shared
 * midpoint. Those are different fixed points and only one of them is correct.
 *
 * With M the mirror across the midsagittal plane (x -> -x), the Symmetry
 * Condition is L = M(R). Blending each wrist toward the other's mirror is the
 * only iteration that converges to it: the mirror error e = L + R (in x)
 * becomes e' = e - 2*lambda*e, so lambda = 0.5 solves it in a single step and
 * any lambda above 0.5 overshoots and oscillates instead of converging.
 *
 * Blending toward a shared midpoint, which looks symmetric but is not, leaves
 * e' = e - 2*lambda*R, which does not tend to zero. Measured on HELLO it made
 * the mirror error worse, 0.133 m to 0.377 m, a 184 percent increase.
 */
function applySymmetryPrior(L, R, lambda) {
  if (!(lambda > 0) || !L || !R) return;
  _symL.set(-R.x, R.y, R.z);
  L.lerp(_symL, lambda);
  _symL.set(-L.x, L.y, L.z);
  R.lerp(_symL, lambda);
}

function resolveTwoHanded(leftTarget, rightTarget) {
  const gap = leftTarget.distanceTo(rightTarget);
  const w = Math.max(0, Math.min(1, (TWO_HANDED_FAR - gap) / (TWO_HANDED_FAR - TWO_HANDED_NEAR)));
  if (w <= 0) return 0;

  const midX = (leftTarget.x + rightTarget.x) / 2;
  const midY = (leftTarget.y + rightTarget.y) / 2;
  const midZ = (leftTarget.z + rightTarget.z) / 2;

  // separate the hands along the recorded left-right axis, so the pair keeps
  // the orientation the signer actually used rather than being forced flat
  let ax = leftTarget.x - rightTarget.x;
  let ay = leftTarget.y - rightTarget.y;
  let az = leftTarget.z - rightTarget.z;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-6) { ax = 1; ay = 0; az = 0; } else { ax /= len; ay /= len; az /= len; }
  const half = PALM_GAP / 2;

  const snapL = { x: midX + ax * half, y: midY + ay * half, z: midZ + az * half };
  const snapR = { x: midX - ax * half, y: midY - ay * half, z: midZ - az * half };

  leftTarget.x += (snapL.x - leftTarget.x) * w;
  leftTarget.y += (snapL.y - leftTarget.y) * w;
  leftTarget.z += (snapL.z - leftTarget.z) * w;
  rightTarget.x += (snapR.x - rightTarget.x) * w;
  rightTarget.y += (snapR.y - rightTarget.y) * w;
  rightTarget.z += (snapR.z - rightTarget.z) * w;
  return w;
}

/*
 * Elbow bend direction: outward and FORWARD (+Z, the direction this model
 * faces), not backward.
 *
 * The textbook convention is the opposite. Blender's IK docs say "for elbows,
 * float the empty behind the arm", and Unreal's Joint Target Location "should
 * be set to a position behind the elbow". That convention assumes the pole is
 * placed relative to a hanging rest arm, where bending the elbow backward is
 * what produces a natural human elbow.
 *
 * It does not transfer to this data. Here the hands are held in front of the
 * body, so a backward pole rotates the elbow into the torso. Measured over the
 * stored takes with a backward pole:
 *
 *   HELLO  65/120 elbows behind the shoulder plane, elbow z -0.146..-0.025
 *   A      45/72 behind, down to z = -0.210
 *
 * The torso's back surface sits at z = -0.22, so those elbows are level with
 * or inside the back of the body. That is the "elbow is going back" artefact.
 *
 * Flipping to forward + outward:
 *
 *   A      elbow z +0.231..+0.333   0/72 behind
 *   B      elbow z +0.219..+0.297   0/122 behind
 *   BAD    elbow z +0.172..+0.371   0/122 behind
 *   HELLO  elbow z +0.368..+0.385   0/120 behind
 *
 * Every elbow is now in front of the shoulder plane, and since the torso front
 * surface is +0.25 at stomach height and +0.31 at the chest, they also sit at
 * or clear of the body rather than through it. Midline crossings stay at 0 for
 * both directions, so nothing trades tangling for this.
 *
 * The outward term is still required: with a pure forward pole the elbow
 * orthogonalises straight through the body and crossings rise to 57%.
 */
const ANATOMICAL_POLE_LEFT = new THREE.Vector3(0.62, 0, 1).normalize();
const ANATOMICAL_POLE_RIGHT = new THREE.Vector3(-0.62, 0, 1).normalize();

/**
 * Two-bone IK (shoulder -> elbow -> wrist).
 *
 * Solves the elbow so the WRIST lands exactly on the recorded wrist position,
 * clamped to the arm's real reach.
 *
 * The bend direction is ANATOMICAL, not read from the recording. It used to
 * come from the recorded elbow. Measured with clean data both are fine, but
 * the anatomical pole is exact where the recorded pole is not, and it is
 * immune to elbow data going bad:
 *
 *   recorded-elbow pole : wrist error 0.0069 m, elbow sideways stray 0.258 m
 *   anatomical pole     : wrist error 0.0000 m, elbow sideways stray 0.202 m
 *   both                : 0% of elbows cross the body midline
 *
 * A human elbow always points back and out, so this holds for every pose. It
 * is also what stopped the arms tangling: when the backend briefly clamped
 * torso-relative landmarks into an image frame, the recorded elbow degenerated
 * and 21% of elbows swung across the body, because a folded arm sits ~0.49 m
 * off the shoulder->wrist line and a meaningless direction moves it a long way.
 *
 * The pole MUST be orthogonalised against the shoulder->wrist line. Skipping
 * that is not cosmetic: it breaks the triangle, shrinking |elbow-shoulder|
 * below upperLen while growing |elbow-wrist| past foreLen, and the arm
 * visibly detaches from the body.
 */
function solveArmIK(shoulder, wristTarget, upperLen, foreLen, isLeft, elbowOut, wristOut) {
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

  _ikPole.copy(isLeft ? ANATOMICAL_POLE_LEFT : ANATOMICAL_POLE_RIGHT);
  const along = _ikPole.dot(_ikSw);
  _ikPole.addScaledVector(_ikSw, -along);
  if (_ikPole.lengthSq() < 1e-8) {
    // the pole is collinear with shoulder->wrist: bulge via cross(dir, Z)
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
  // Bind-pose local quaternion per hand/arm bone, so a bone can be restored
  // rather than zeroed. See the setup loop.
  const handRestQuat = useRef({});
  const modelRefRef = useRef({ midpoint: new THREE.Vector3(0, 1.2, 0), scale: 0.3 });
  // Real model-space IK anchors + bone lengths, measured from the GLB bind pose
  const armIKDefaultsRef = useRef(null);
  // data-unit -> world-unit factor, plus the head volume used to keep a wrist
  // in front of the face. Both measured from the loaded skeleton.
  const avatarFrameRef = useRef(null);
  // True while the current frames are being played as a two-handed sign, so
  // the UI can label it. See resolveTwoHanded.
  const lastTwoHandedRef = useRef(false);
  // Battison symmetry weight for the chunk being played, 0 for one-handed.
  const symmetryLambdaRef = useRef(0);

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
        // Bind-pose local rotation, needed to RESTORE a bone rather than zero
        // it. Every arm and hand bone on this GLB has a non-identity rest
        // quaternion (LeftHand_017 is (0, 0.0055, -0.1044, 0.9945), about 12
        // degrees about Z), so resetting with rotation.set(0, 0, 0) is not the
        // bind pose and visibly twists the hand.
        handRestQuat.current[bone] = b.quaternion.clone();
      }
    });

    // Store per-finger palm normals so finger swing-twist can lock roll
    // (prevents the crooked-finger twist that setFromUnitVectors alone produces)
    const storeFingerPalmNormals = (isLeft) => {
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

      // --- data-unit -> world-unit bridge, measured not hardcoded ---
      // to_model_space() bakes the data at a 0.2845 shoulder span; this
      // skeleton is 0.5936 across in world units. See DATA_SHOULDER_SPAN.
      const dataToModel = modelShoulderWidth / DATA_SHOULDER_SPAN;

      // --- head volume, so a raised hand lands in front of the face ---
      const headBone = scene.getObjectByName(HEAD_BONE);
      const headTopBone = scene.getObjectByName(HEAD_TOP_BONE);
      const eyeL = scene.getObjectByName(EYE_BONES[0]);
      const eyeR = scene.getObjectByName(EYE_BONES[1]);
      let guard = null;
      if (headBone && headTopBone) {
        const centre = new THREE.Vector3();
        const top = new THREE.Vector3();
        headBone.getWorldPosition(centre);
        headTopBone.getWorldPosition(top);
        // eyes give the plane a hand must be in front of; the head-to-crown
        // distance gives a radius that tracks the actual model.
        const faceZ = eyeL && eyeR
          ? (eyeL.getWorldPosition(new THREE.Vector3()).z + eyeR.getWorldPosition(new THREE.Vector3()).z) / 2
          : centre.z + 0.12;
        guard = {
          centre,
          radius: Math.max(0.05, centre.distanceTo(top) * 0.55),
          faceZ,
        };
      }

      avatarFrameRef.current = { dataToModel, guard, torso: measureTorsoProfile(scene) };

      console.info(
        `[avatar] shoulder span ${modelShoulderWidth.toFixed(4)} m, data unit ${DATA_SHOULDER_SPAN} ` +
        `-> dataToModel k=${dataToModel.toFixed(4)}` +
        (guard
          ? `, head guard radius ${guard.radius.toFixed(3)} faceZ ${guard.faceZ.toFixed(3)}`
          : ', head guard unavailable') +
        `, torso collider ${avatarFrameRef.current.torso.buckets.length} slices`,
      );
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
        // Battison Symmetry Condition weight for this chunk. The two-handed
        // test needs the whole sequence, so it is decided once here rather
        // than per frame. See computeSymmetryWeight.
        symmetryLambdaRef.current = computeSymmetryWeight(nextChunk.frames);
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
      // Backend frames are already model-scale (0.2845 shoulder width /
      // 1.3351 shoulder height baked in at conversion - the same origin the
      // backend uses), so the map below is a rigid translation plus one scale:
      // recorded shoulder-midpoint -> model shoulder-midpoint, scale k measured
      // from the skeleton (0.5936 / 0.2845 = 2.0865, NOT 1).
      // Per-side shoulder anchors + per-frame re-derived scale used to inject
      // shoulder jitter asymmetrically into each arm: that is what stretched
      // raised takes and opened/closed the hand gap versus the recording.
      // The IK then solves the elbow so the wrist lands exactly on the
      // recorded position.
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
      const avatarFrame = avatarFrameRef.current;
      const headGuard = avatarFrame ? avatarFrame.guard : null;
      const torso = avatarFrame ? avatarFrame.torso : null;
      // Measured from the loaded skeleton: converts the backend's baked data
      // unit into this model's world units. See DATA_SHOULDER_SPAN.
      const k = avatarFrame ? avatarFrame.dataToModel : 1;

      if (frame.body && nextFrame.body && ik) {
        // Rigid data->model map, anchored on the shoulder MIDPOINT.
        // Midpoints, not per-side shoulders, so left/right jitter can never
        // pry the hands apart. k is NOT 1: the data is baked at a 0.2845
        // shoulder span while the model is 0.5936 across in world units, so a
        // 1:1 map aimed the wrist at 40% of the arm's reach and left it short.
        _ikModelMid.addVectors(ik.ls, ik.rs).multiplyScalar(0.5);
        lerpVec(_ikLerpS, frame.body.left_shoulder, nextFrame.body.left_shoulder);
        lerpVec(tempVec1, frame.body.right_shoulder, nextFrame.body.right_shoulder);
        _ikDataMid.addVectors(_ikLerpS, tempVec1).multiplyScalar(0.5);

        // Both wrist targets are resolved BEFORE either arm is solved, because
        // the two-handed and symmetry passes need the pair as a unit. Order:
        //   1. symmetry, so the pair is balanced before anything else moves it
        //   2. two-handed contact, to snap the balanced pair together
        //   3. signing space, the workspace bound: hips to crown, in front
        //   4. torso, so chest and stomach signs sit in front of the body
        //   5. head, so a raised hand lands in front of the face
        lerpVec(_ikLerpW, frame.body.left_wrist, nextFrame.body.left_wrist);
        lerpVec(_ikLerpW2, frame.body.right_wrist, nextFrame.body.right_wrist);
        const mapToModel = (out, dv) => {
          out.set(
            _ikModelMid.x + (dv.x - _ikDataMid.x) * k,
            _ikModelMid.y + (dv.y - _ikDataMid.y) * k,
            _ikModelMid.z + (dv.z - _ikDataMid.z) * k,
          );
        };
        mapToModel(_ikTargetW, _ikLerpW);
        mapToModel(_ikTargetR, _ikLerpW2);

        applySymmetryPrior(_ikTargetW, _ikTargetR, symmetryLambdaRef.current);
        const twoHandedWeight = resolveTwoHanded(_ikTargetW, _ikTargetR);
        clampToSigningSpace(_ikTargetW);
        clampToSigningSpace(_ikTargetR);
        pushOutOfTorso(_ikTargetW, torso);
        pushOutOfTorso(_ikTargetR, torso);
        pushOutOfHead(_ikTargetW, headGuard);
        pushOutOfHead(_ikTargetR, headGuard);
        if (twoHandedWeight > 0.5) lastTwoHandedRef.current = true;
        else if (twoHandedWeight <= 0.01) lastTwoHandedRef.current = false;

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

          // rigid map data space -> model space, anchored on the midpoint, with
          // the two-handed, torso and head passes already applied above. The
          // wrist is still clamped to real bone reach inside solveArmIK, so
          // unreachable frames tuck instead of flying.
          const S = isLeft ? ik.ls : ik.rs;
          const target = isLeft ? _ikTargetW : _ikTargetR;
          solveArmIK(S, target,
                     isLeft ? ik.lUpper : ik.rUpper,
                     isLeft ? ik.lFore : ik.rFore,
                     isLeft,
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

        if (!handData || !nextHandData || handData.length < 21 || !handIsUsable(handData) || !handIsUsable(nextHandData)) {
            // Tracking lost, or the recorded hand cloud is a degenerate flat
            // line. Either way the bones are restored to the BIND pose rather
            // than to identity: every hand bone on this GLB has a non-identity
            // rest rotation, so rotation.set(0, 0, 0) twisted the hand.
            restoreHandToBindPose(scene, isLeft, handRestQuat);
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
      // computePalmNorm() used to live here and was removed: it was never called
      // and returned a zero vector it never populated.
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
        
        if (!handData || !nextHandData || handData.length < 21 || !handIsUsable(handData) || !handIsUsable(nextHandData)) {
            // Already restored to the bind pose in applyWristRotation. Without
            // this check the per-bone lengthSq() bail-out below would rotate
            // some phalanges and skip others in the same frame, which is what
            // renders as splayed, broken fingers.
            return;
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
