/**
 * PRD 18 — static fast-path matcher for the Interpreter tab ONLY.
 *
 * Same method as motion, different granularity:
 * - Motion (dtw.js): whole ~60-frame sequence vs whole sequence, speed-invariant.
 * - Static (here): ONE live frame vs representative template frames, box test.
 *
 * Joint set is identical to motion: wrist + finger landmarks only. The 4
 * shoulder/elbow joints are never compared here (interpreter rule). X, Y AND
 * Z must all pass per point. Tolerances are normalized shoulder-width units
 * measured from real recordings (see PRD 18 §6-7):
 * - jitter/frame is ~0.003 (fingers) / ~0.03-0.05 (body wrist);
 * - cross-sign gaps are ~0.08+ (fingers) / ~0.40+ (wrist) / ~0.09+ (finger Z).
 */

// Per-point box tolerances: |dx|<=X AND |dy|<=Y AND |dz|<=Z must ALL pass.
export const STATIC_TOLERANCE = {
  finger: { x: 0.1, y: 0.1, z: 0.05 },
  wrist: { x: 0.15, y: 0.15, z: 0.3 },
};

// Fraction of finger points that must hit for a frame to count.
export const STATIC_HIT_RATIO = 0.8;

// How many representative frames to keep per static take (evenly spaced).
// A static take is ~60 near-identical frames; 5 reps cover drift without
// paying 60x per live-frame check.
export const STATIC_REPS_PER_TAKE = 5;

// Throttle: check one live frame out of every N (camera runs 15-30fps;
// every 6th frame ≈ 3-5 checks/sec — instant feel, negligible cost).
export const STATIC_EVERY_N_FRAMES = 6;

function inBox(a, b, tol) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= tol.x &&
    Math.abs(a.y - b.y) <= tol.y &&
    Math.abs((a.z ?? 0) - (b.z ?? 0)) <= tol.z
  );
}

function handCountOf(frame) {
  let n = 0;
  if (frame.left_hand && frame.left_hand.length > 0) n++;
  if (frame.right_hand && frame.right_hand.length > 0) n++;
  return n;
}

/**
 * Does one live frame match one template frame?
 * Wrists: every VISIBLE wrist pair must hit (a 2-hand template needs both).
 * Fingers: >= STATIC_HIT_RATIO of comparable points must hit.
 * lm0 (hand base) always has z=0 on both sides — X/Y only, Z skipped.
 */
export function staticFrameHits(liveFrame, tplFrame) {
  // Hand count must match exactly — a 1-hand live frame never matches a
  // 2-hand static take (same gate motion uses, but hard here: static boxes
  // are absolute, so cross-count matches would be pure position luck).
  if (handCountOf(liveFrame) !== handCountOf(tplFrame)) return null;

  const liveBody = liveFrame.body || {};
  const tplBody = tplFrame.body || {};
  let wristsCompared = 0;
  for (const key of ["left_wrist", "right_wrist"]) {
    const l = liveBody[key];
    const t = tplBody[key];
    if (l && t) {
      wristsCompared++;
      if (!inBox(l, t, STATIC_TOLERANCE.wrist)) return null;
    } else if (t) {
      // Template has this wrist but live doesn't — no match.
      return null;
    }
  }
  if (wristsCompared === 0) return null;

  let hits = 0;
  let compared = 0;
  for (const hk of ["left_hand", "right_hand"]) {
    const live = liveFrame[hk];
    const tpl = tplFrame[hk];
    if (!tpl || tpl.length === 0) continue;
    if (!live || live.length === 0) return null;
    for (let i = 0; i < 21; i++) {
      const lp = live[i];
      const tp = tpl[i];
      if (!lp || !tp) continue;
      compared++;
      if (i === 0) {
        // lm0 z is identically 0 (wrist origin) — X/Y only.
        if (
          Math.abs(lp.x - tp.x) <= STATIC_TOLERANCE.finger.x &&
          Math.abs(lp.y - tp.y) <= STATIC_TOLERANCE.finger.y
        ) {
          hits++;
        }
      } else if (inBox(lp, tp, STATIC_TOLERANCE.finger)) {
        hits++;
      }
    }
  }
  if (compared === 0) return null;
  const ratio = hits / compared;
  return ratio >= STATIC_HIT_RATIO ? { ratio, hits, compared } : null;
}

/**
 * Pick representative frames from a static take (evenly spaced middle).
 * Static takes are held poses; reps cover slow drift across the 2 seconds.
 */
export function staticRepsForTake(frames, maxReps = STATIC_REPS_PER_TAKE) {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  if (frames.length <= maxReps) return frames;
  const out = [];
  for (let i = 0; i < maxReps; i++) {
    const idx = Math.round((i * (frames.length - 1)) / (maxReps - 1));
    out.push(frames[idx]);
  }
  return out;
}

/**
 * Split a template library into { staticIndex, motionLibrary }.
 * Handles both shapes: plain {1:[],2:[]} (legacy/offline) and merged
 * {user:{1,2}, main:{1,2}} (Supabase). Old rows without a flag read as
 * motion (same default as recordingStorage.toAppShape).
 *
 * staticIndex is a FLAT ordered list — Main takes first (hard Main-wins),
 * then personal — of { signId, handCount, source, reps }.
 * motionLibrary keeps the original bucketed shape minus static takes, so
 * the DTW path searches exactly what it searched before.
 */
export function splitStaticMotion(templateLibrary) {
  const isMerged =
    templateLibrary && templateLibrary.user && templateLibrary.main;
  const buckets = isMerged
    ? [
        { bucket: templateLibrary.main, source: "shared" },
        { bucket: templateLibrary.user, source: "you" },
      ]
    : [{ bucket: templateLibrary || { 1: [], 2: [] }, source: null }];

  const staticIndex = [];
  const motionBuckets = isMerged
    ? { user: { 1: [], 2: [] }, main: { 1: [], 2: [] } }
    : { 1: [], 2: [] };

  for (const { bucket, source } of buckets) {
    for (const handCount of [1, 2]) {
      const takes = (bucket && bucket[handCount]) || [];
      for (const take of takes) {
        const type =
          take.recordingType === "static" ? "static" : "motion";
        if (type === "static") {
          staticIndex.push({
            signId: take.signId,
            handCount: take.handCount ?? handCount,
            source,
            reps: staticRepsForTake(take.frames),
          });
        } else if (isMerged) {
          const key = source === "shared" ? "main" : "user";
          motionBuckets[key][handCount].push(take);
        } else {
          motionBuckets[handCount].push(take);
        }
      }
    }
  }

  return { staticIndex, motionLibrary: motionBuckets, isMerged };
}

/**
 * Match ONE live frame against the static index.
 * Returns the winning { signId, source, ratio } or null.
 * Ordering: Main takes before personal (index order), best hit-ratio wins.
 */
export function matchStaticLiveFrame(liveFrame, staticIndex) {
  if (!liveFrame || !Array.isArray(staticIndex) || staticIndex.length === 0) {
    return null;
  }
  const liveCount = handCountOf(liveFrame);
  if (liveCount === 0) return null;

  let best = null;
  for (const entry of staticIndex) {
    if ((entry.handCount ?? 0) !== liveCount) continue;
    for (const rep of entry.reps) {
      const hit = staticFrameHits(liveFrame, rep);
      if (hit && (!best || hit.ratio > best.ratio)) {
        best = {
          signId: entry.signId,
          source: entry.source,
          ratio: hit.ratio,
        };
        if (hit.ratio >= 1) return best; // perfect — can't be beaten
      }
    }
  }
  return best;
}
