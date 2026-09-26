/**
 * Feature 2 — cheap shape prefilter in front of DTW (Interpreter only).
 *
 * WHY: motion DTW scans EVERY take linearly (~50ms today, grows with each
 * recording). This scores all takes with a 63-number shape signature first
 * (~100x cheaper than DTW) and only runs full DTW on survivors.
 *
 * WHAT "shape" means: mean wrist-relative finger vectors across the take —
 * position-free, so it survives the "hand can be anywhere" rule. Two takes
 * of one sign share a shape; different signs (usually) don't.
 *
 * SAFETY (measured, not assumed):
 * - Same-sign shape distance on real takes: ~0.04; cross-sign: ~0.045+.
 *   The margin is THIN, so the default gate (0.12, ~3x the cross-sign max
 *   seen) is deliberately generous, and an emptied pool falls back to a
 *   FULL search instead of returning nothing. The prefilter can only ever
 *   *skip* work, never change a "no match" into thin air.
 * - scripts/evaluate.mjs reports skip-rate + accuracy with/without the
 *   gate: re-tune PREFILTER_GATE there as the vocabulary grows. If the
 *   gate ever costs accuracy, raise it — cost scales with survivors.
 */

export const PREFILTER_GATE = 0.12;

// Signature cache: takes are long-lived library objects, keyed by identity.
const sigCache = new WeakMap();

function handPresent(hand) {
  return hand && hand.length === 21;
}

/**
 * Mean wrist-relative finger shape, per side.
 * Returns { left: [...63] | null, right: [...63] | null }.
 * A side counts only if present in at least half the frames.
 */
export function takeShapeSignature(frames) {
  const out = { left: null, right: null };
  if (!Array.isArray(frames) || frames.length === 0) return out;
  for (const side of ["left", "right"]) {
    const handKey = side === "left" ? "left_hand" : "right_hand";
    const samples = [];
    for (const f of frames) {
      const h = f && f[handKey];
      if (handPresent(h)) {
        const w = h[0];
        const wz = w.z ?? 0;
        const vec = [];
        for (let i = 0; i < 21; i++) {
          vec.push(h[i].x - w.x, h[i].y - w.y, (h[i].z ?? 0) - wz);
        }
        samples.push(vec);
      }
    }
    if (samples.length >= Math.max(1, Math.floor(frames.length / 2))) {
      const mean = new Array(63).fill(0);
      for (const s of samples) {
        for (let i = 0; i < 63; i++) mean[i] += s[i];
      }
      for (let i = 0; i < 63; i++) mean[i] /= samples.length;
      out[side] = mean;
    }
  }
  return out;
}

export function signatureFor(take) {
  if (!take) return { left: null, right: null };
  let sig = sigCache.get(take);
  if (!sig) {
    sig = takeShapeSignature(take.frames);
    sigCache.set(take, sig);
  }
  return sig;
}

function sideDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < 63; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum) / 21;
}

/**
 * Mean per-landmark RMS over the sides both signatures share.
 * No shared side (e.g. 1-hand live vs 2-hand take with only the other
 * hand...) -> Infinity, i.e. never prefilter-passes on shape alone.
 * (Hand-count gating already happens in the recognizer buckets.)
 */
export function shapeDistance(sigA, sigB) {
  const sides = ["left", "right"].filter((s) => sigA[s] && sigB[s]);
  if (sides.length === 0) return Infinity;
  let total = 0;
  for (const s of sides) total += sideDistance(sigA[s], sigB[s]);
  return total / sides.length;
}

/**
 * Split takes into survivors + skipped. NEVER returns an empty survivor
 * list: if the gate kills everything, everyone survives (full search).
 */
export function prefilterTakes(liveFrames, takes, gate = PREFILTER_GATE) {
  const liveSig = takeShapeSignature(liveFrames);
  const scored = takes.map((take) => ({
    take,
    dist: shapeDistance(liveSig, signatureFor(take)),
  }));
  let kept = scored.filter((s) => s.dist <= gate);
  if (kept.length === 0) kept = scored; // fallback: full search
  return {
    kept: kept.map((s) => s.take),
    skipped: takes.length - kept.length,
    gate,
  };
}
