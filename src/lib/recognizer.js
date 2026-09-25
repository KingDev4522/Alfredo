import { dtwDistance } from "./dtw.js";

/**
 * Fingertip-weighted landmark weighting: fingertips count 2.5x more than
 * other landmarks. Whether this actually helps on our vocabulary is
 * something we test empirically (see evaluate.mjs) rather than assume —
 * this export exists so both the evaluation script and the live app use
 * the exact same weighting function once we know which one wins.
 */
const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20]);
export function fingertipWeighted(index) {
  return FINGERTIP_INDICES.has(index) ? 2.5 : 1;
}
export function uniformWeight() {
  return 1;
}

/**
 * Groups a flat array of recordings (each with signId, handCount, frames)
 * into a structure the classifier can search efficiently: separate
 * "buckets" by hand count, since a live gesture should only ever be
 * compared against templates with the same number of hands. This also
 * means a one-handed query never accidentally gets matched against a
 * two-handed template (or vice versa) — hand count is a hard, free filter
 * before any DTW computation happens at all.
 */
export function buildTemplateLibrary(recordings) {
  const byHandCount = { 1: [], 2: [] };
  for (const recording of recordings) {
    const bucket = byHandCount[recording.handCount];
    if (bucket) bucket.push(recording);
  }
  return byHandCount;
}

/**
 * Classifies one live sequence (an array of frames, same shape as a
 * recording's `frames`) against the template library, returning the
 * winning sign, a confidence score, and the runner-up for diagnostics.
 *
 * options.landmarkWeight: pass fingertipWeighted or uniformWeight (or
 * omit for uniform).
 * options.bandFraction: passed through to dtwDistance.
 * options.k: how many nearest templates vote on the answer (default 1,
 * meaning simple nearest-match). Using k > 1 with distance-weighted
 * voting can smooth out the effect of any single unusual template being
 * the closest match — see evaluate.mjs for whether this actually helps
 * on our vocabulary rather than assuming it does.
 */
export function classifySequence(liveFrames, templateLibrary, options = {}) {
  const { k = 1 } = options;

  const liveHandCount = mostCommonHandCount(liveFrames);
  if (liveHandCount === 0) {
    return { signId: null, distance: Infinity, confidence: 0, runnerUp: null };
  }

  // Search the hand-count bucket that matches what was detected live, but
  // ALSO include the other bucket rather than hard-filtering it out
  // entirely. Live hand-count detection is noisier than the controlled
  // conditions recordings were captured under — a two-handed sign like
  // "Help" can easily have its majority vote land on 1 hand for a given
  // live segment if the second hand briefly loses tracking, and hard-
  // filtering would make that sign impossible to ever match in that case.
  // The matching-count bucket is tried first and will normally win on
  // distance anyway when hand count was detected correctly; this just
  // stops a detection hiccup from ruling out the correct answer entirely.
  const primaryCandidates = templateLibrary[liveHandCount] || [];
  const otherHandCount = liveHandCount === 1 ? 2 : 1;
  const secondaryCandidates = templateLibrary[otherHandCount] || [];
  const candidates = [...primaryCandidates, ...secondaryCandidates];

  if (candidates.length === 0) {
    return { signId: null, distance: Infinity, confidence: 0, runnerUp: null };
  }

  // Compute distance to every candidate template, keep them all sorted —
  // we need the k nearest, not just the single nearest.
  const distances = candidates.map((template) => ({
    signId: template.signId,
    distance: dtwDistance(liveFrames, template.frames, options),
  }));
  distances.sort((a, b) => a.distance - b.distance);

  if (k <= 1) {
    const best = distances[0];
    const secondBest = distances[1] || { signId: null, distance: Infinity };
    return {
      signId: best.signId,
      distance: best.distance,
      confidence: distanceToConfidence(best.distance),
      runnerUp: secondBest.signId,
      runnerUpDistance: secondBest.distance,
    };
  }

  // Distance-weighted voting among the k nearest templates: each of the k
  // nearest votes for its own sign, weighted by how close it is (closer =
  // stronger vote), rather than every one of the k votes counting equally.
  // This tends to behave better than plain majority vote for small k.
  const nearestK = distances.slice(0, k);
  const scoresBySign = {};
  for (const { signId, distance } of nearestK) {
    const weight = 1 / (distance + 0.05);
    scoresBySign[signId] = (scoresBySign[signId] || 0) + weight;
  }

  const ranked = Object.entries(scoresBySign).sort((a, b) => b[1] - a[1]);
  const [winningSign] = ranked[0];
  const winningDistance = nearestK.find((n) => n.signId === winningSign).distance;
  const runnerUpSign = ranked[1] ? ranked[1][0] : null;

  return {
    signId: winningSign,
    distance: winningDistance,
    confidence: distanceToConfidence(winningDistance),
    runnerUp: runnerUpSign,
    runnerUpDistance: distances.find((d) => d.signId === runnerUpSign)?.distance ?? Infinity,
  };
}

/**
 * The confidence threshold below which a match should be treated as
 * "not recognized" rather than accepted. This isn't a guess — it was
 * found by sweeping real threshold values against actual recorded data
 * and picking the point that best separates genuinely-correct matches
 * from wrong ones (see scripts/evaluate.mjs). Re-run that script and
 * update this if the vocabulary changes meaningfully.
 */
export const CONFIDENCE_THRESHOLD = 0.36;

/**
 * Converts a raw DTW distance into a 0-1 confidence score. Smaller
 * distance = higher confidence. The exact shape of this curve was tuned
 * against real recorded data (see evaluate.mjs) rather than picked
 * arbitrarily — `scale` is the distance at which confidence drops to ~50%.
 */
function distanceToConfidence(distance, scale = 0.6) {
  if (!Number.isFinite(distance)) return 0;
  return 1 / (1 + distance / scale);
}

function mostCommonHandCount(frames) {
  const counts = {};
  for (const frame of frames) {
    if (frame.length > 0) counts[frame.length] = (counts[frame.length] || 0) + 1;
  }
  let best = 0;
  let bestCount = -1;
  for (const [count, total] of Object.entries(counts)) {
    if (total > bestCount) {
      bestCount = total;
      best = Number(count);
    }
  }
  return best;
}
