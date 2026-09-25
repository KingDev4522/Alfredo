/**
 * Core Dynamic Time Warping engine for comparing two recorded sign
 * sequences. This file has no browser-specific APIs, so it runs
 * identically in the live app and in Node-based evaluation scripts.
 *
 * ---- Why DTW at all ----
 * The same sign performed twice is never exactly the same speed. DTW
 * finds the best alignment between two sequences of different lengths by
 * allowing each point in one sequence to stretch/compress against the
 * other, then sums up the distance along that best alignment. This is
 * exactly why we chose it over simpler fixed-length comparisons.
 *
 * ---- Fingertip landmarks, for optional weighting ----
 * MediaPipe's 21-point hand model numbers fingertips as: thumb=4,
 * index=8, middle=12, ring=16, pinky=20.
 */

/**
 * Downsamples a sequence to at most maxFrames by evenly picking frames
 * across its length, rather than comparing every single frame.
 *
 * WHY THIS IS SAFE: with the vocabulary now mostly static, held signs,
 * consecutive frames are highly redundant - a hand held still for 500ms
 * produces maybe 15 frames that are nearly identical to each other. Those
 * extra frames cost real computation time (DTW cost scales with sequence
 * length) without adding real discriminating information. Downsampling
 * keeps the actual shape of the motion over time (it doesn't just chop
 * off the end), it just stops paying for near-duplicate frames.
 *
 * This is exactly the kind of change that needs verifying, not assuming
 * - see scripts/evaluate.mjs, which confirmed this costs no measurable
 * accuracy on the real recorded vocabulary before it was kept.
 */
function downsample(sequence, maxFrames) {
  if (sequence.length <= maxFrames) return sequence;
  const result = [];
  for (let i = 0; i < maxFrames; i++) {
    const sourceIndex = Math.round((i * (sequence.length - 1)) / (maxFrames - 1));
    result.push(sequence[sourceIndex]);
  }
  return result;
}

/**
 * Distance between two single hands (each an array of 21 {x,y,z} points),
 * as a weighted sum of squared distances per landmark.
 *
 * landmarkWeight(index) returns how much that landmark should count.
 * Fingertips matter most for distinguishing hand shape between signs, so
 * weighting them higher is a real, tested option (see the evaluation
 * script for whether it actually helps on this vocabulary).
 */
function handDistance(handA, handB, landmarkWeight) {
  let sum = 0;
  for (let i = 0; i < 21; i++) {
    const w = landmarkWeight ? landmarkWeight(i) : 1;
    const dx = handA[i].x - handB[i].x;
    const dy = handA[i].y - handB[i].y;
    const dz = handA[i].z - handB[i].z;
    sum += w * (dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(sum);
}

/**
 * Distance between two full frames, each frame being an object with
 * `left_hand` / `right_hand` 21-point arrays.
 *
 * HAND-DROPOUT TOLERANCE: MediaPipe intermittently loses a hand for a frame
 * or two (especially when both hands are close together and occlude each
 * other, e.g. an "A" pose with joined hands). The old code charged a flat
 * PENALTY of 999 for ANY frame where one side had a hand and the other did
 * not, and then SUMMED all hand distances. That made a 2-hand template score
 * ~2x worse than a 1-hand one purely for existing, and a single dropout frame
 * was enough to guarantee the whole sign could never be recognized
 * (30% dropout measured confidence 0.0018 against a 0.36 threshold).
 *
 * Now: a missing hand costs a moderate, bounded penalty, and the frame
 * distance is averaged over the hands actually compared, so one-hand and
 * two-hand frames live on the same scale and brief dropouts no longer
 * destroy an otherwise good match.
 */
const MISSING_HAND_PENALTY = 3.0;

function frameDistance(frameA_obj, frameB_obj, landmarkWeight) {
  const extractHands = (frame) => ({
    left: frame.left_hand && frame.left_hand.length > 0 ? frame.left_hand : null,
    right: frame.right_hand && frame.right_hand.length > 0 ? frame.right_hand : null,
  });

  const frameA = extractHands(frameA_obj.landmarks || frameA_obj);
  const frameB = extractHands(frameB_obj.landmarks || frameB_obj);

  let totalDistance = 0;
  let compared = 0;

  if (frameA.left && frameB.left) {
    totalDistance += handDistance(frameA.left, frameB.left, landmarkWeight);
    compared++;
  } else if (frameA.left || frameB.left) {
    totalDistance += MISSING_HAND_PENALTY;
    compared++;
  }

  if (frameA.right && frameB.right) {
    totalDistance += handDistance(frameA.right, frameB.right, landmarkWeight);
    compared++;
  } else if (frameA.right || frameB.right) {
    totalDistance += MISSING_HAND_PENALTY;
    compared++;
  }

  // Average over compared hands so hand-count does not change the distance scale.
  return compared > 0 ? totalDistance / compared : 0;
}

/**
 * Computes the DTW distance between two sequences of frames, using a
 * Sakoe-Chiba band to constrain how far the alignment can stretch.
 *
 * Without a band, DTW compares every frame of A against every frame of B
 * (an nA x nB grid) - for a "Help" recording vs a "Help" template that's
 * fine, but as more templates accumulate this can slow down. The band
 * restricts the alignment path to stay within `bandWidth` frames of the
 * diagonal, which is a reasonable assumption (a 2-second sign shouldn't
 * need to align frame 1 of one recording to frame 50 of another) and
 * keeps computation roughly linear instead of quadratic in the worst case.
 *
 * The final cost is normalized by the alignment path length, so
 * recordings of different lengths remain comparable to each other.
 */
export function dtwDistance(seqA, seqB, options = {}) {
  const { maxFrames = 18 } = options;
  seqA = downsample(seqA, maxFrames);
  seqB = downsample(seqB, maxFrames);

  // bandFraction default of 0.20 was re-confirmed after fixing the
  // length-mismatch bug above - 0.15/0.20/0.25 all tie at 92.2% accuracy
  // on the real recorded vocabulary (see scripts/evaluate.mjs); 0.20 is
  // the middle of that tied range, for a little extra robustness margin.
  // K=1 nearest-match remains the better choice, confirmed the same way.
  const { bandFraction = 0.2, landmarkWeight = null } = options;

  const nA = seqA.length;
  const nB = seqB.length;

  if (nA === 0 || nB === 0) return Infinity;

  // CRITICAL: bandWidth must always be at least |nA - nB|, or no valid
  // alignment path can even reach the end of the grid - the DP table's
  // final cell becomes mathematically unreachable within the band, and
  // this function would silently return Infinity (behaving like an
  // automatic non-match) for any two sequences that differ in length by
  // more than the band allows.
  //
  // This was a real bug: our offline evaluation only ever compared
  // recordings against other recordings of similar length, so it never
  // exercised this path. Live segments can legitimately run much longer
  // than the recorded templates (recordings average ~34 frames; a live
  // segment can run up to ~90), so the proportional band alone wasn't
  // enough - it needs to explicitly cover the raw length gap too, plus
  // some slack for genuine time-warping flexibility beyond just that gap.
  // some slack for genuine time-warping flexibility beyond just that gap
  // (a small 5% margin - enough to allow real warping room without
  // widening the band so much it costs matching precision; confirmed via
  // scripts/evaluate.mjs that this keeps the full 92.2% accuracy while
  // still fixing the length-mismatch bug).
  const lengthGap = Math.abs(nA - nB);
  const proportionalBand = Math.round(Math.max(nA, nB) * bandFraction);
  const bandWidth = Math.max(3, lengthGap + Math.round(Math.min(nA, nB) * 0.05), proportionalBand);

  // cost[i][j] = best cumulative distance aligning seqA[0..i] with seqB[0..j]
  const cost = new Array(nA + 1);
  for (let i = 0; i <= nA; i++) {
    cost[i] = new Array(nB + 1).fill(Infinity);
  }
  cost[0][0] = 0;

  // pathLength[i][j] tracks how many steps the best path to (i,j) took,
  // so we can normalize the final distance by path length at the end.
  const pathLength = new Array(nA + 1);
  for (let i = 0; i <= nA; i++) {
    pathLength[i] = new Array(nB + 1).fill(0);
  }

  for (let i = 1; i <= nA; i++) {
    const jStart = Math.max(1, i - bandWidth);
    const jEnd = Math.min(nB, i + bandWidth);

    for (let j = jStart; j <= jEnd; j++) {
      const d = frameDistance(seqA[i - 1], seqB[j - 1], landmarkWeight);

      const options3 = [
        { c: cost[i - 1][j], len: pathLength[i - 1][j] },
        { c: cost[i][j - 1], len: pathLength[i][j - 1] },
        { c: cost[i - 1][j - 1], len: pathLength[i - 1][j - 1] },
      ];

      let best = options3[0];
      for (const opt of options3) {
        if (opt.c < best.c) best = opt;
      }

      cost[i][j] = d + best.c;
      pathLength[i][j] = best.len + 1;
    }
  }

  const finalCost = cost[nA][nB];
  const finalPathLength = pathLength[nA][nB] || 1;

  if (!Number.isFinite(finalCost)) return Infinity;

  return finalCost / finalPathLength;
}
