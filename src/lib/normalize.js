/**
 * Normalizes an ENTIRE recorded sequence of hand landmark frames using one
 * fixed reference point and one fixed scale for the whole recording — not
 * recalculated fresh on every frame.
 *
 * WHY THIS MATTERS — read this before changing anything here:
 *
 * An earlier version of this normalized each frame independently, re-
 * centering every single frame around that frame's own current wrist
 * position. That works fine for signs where the meaning lives entirely in
 * the hand's shape (finger positions, orientation) and the hand barely
 * translates through space. But it silently breaks any sign whose meaning
 * depends on the hand MOVING — for example "Hello," where a flat hand
 * starts near the head and moves outward. Re-centering every frame around
 * its own current wrist position makes the hand's shape relative to itself
 * look identical whether it's near the head or far away, so the motion
 * gets erased and playback looks like the hand never moved at all.
 *
 * Since DTW's whole advantage is comparing motion TRAJECTORIES over time,
 * per-frame normalization was undermining the exact reason we chose DTW in
 * the first place.
 *
 * THE FIX: compute ONE reference point and ONE scale for the entire
 * recording (from the whole sequence), then apply that same fixed
 * reference/scale to every frame. This keeps the sign independent of
 * WHERE in the camera frame it happened and HOW CLOSE to the camera the
 * person was standing, while fully preserving how the hand(s) actually
 * moved during the sign — which is exactly what we want DTW comparing.
 *
 * Two-handed signs (only "Help" in our vocabulary, per ISLRTC verification —
 * Sorry, Thank You, and Pain turned out to be one-handed) use the midpoint
 * between
 * both wrists as the reference point, and the average of each hand's own
 * wrist-to-middle-fingertip distance as the scale — not the distance
 * between the two wrists, since hands moving together/apart is often part
 * of the sign's meaning and shouldn't be normalized away.
 */
export function normalizeSequence(rawFrames) {
  const handCounts = rawFrames.map((f) => f.length).filter((c) => c > 0);
  if (handCounts.length === 0) {
    return rawFrames.map(() => []);
  }

  const majorityCount = mostCommonValue(handCounts);
  // Only use frames matching the sign's real hand count to compute the
  // reference — ignores stray single-frame detection dropouts so they
  // don't skew the reference point or scale.
  const referenceFrames = rawFrames.filter((f) => f.length === majorityCount);

  let refPoint, refScale;

  if (majorityCount === 1) {
    refPoint = averagePoint(referenceFrames.map((f) => f[0][0])); // wrist
    refScale = average(referenceFrames.map((f) => handScale(f[0])));
  } else {
    refPoint = averagePoint(
      referenceFrames.map((f) => midpoint(f[0][0], f[1][0]))
    );
    refScale = average(
      referenceFrames.map((f) => (handScale(f[0]) + handScale(f[1])) / 2)
    );
  }

  const safeRefScale = safeScale(refScale);

  return rawFrames.map((frame) =>
    frame.map((hand) => applyNormalization(hand, refPoint, safeRefScale))
  );
}

function mostCommonValue(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  let best = values[0];
  let bestCount = -1;
  for (const [value, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = Number(value);
    }
  }
  return best;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function averagePoint(points) {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function average(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function handScale(hand) {
  return distanceBetween(hand[0], hand[12]); // wrist to middle fingertip
}

function safeScale(scale) {
  // Guards against division by zero in a degenerate/invalid recording.
  return scale > 0.0001 ? scale : 1;
}

function applyNormalization(hand, referencePoint, scale) {
  return hand.map((point) => ({
    x: round((point.x - referencePoint.x) / scale),
    y: round((point.y - referencePoint.y) / scale),
    z: round((point.z - referencePoint.z) / scale),
  }));
}

function distanceBetween(a, b) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)
  );
}

// Rounding to 4 decimal places keeps plenty of precision for this purpose
// while meaningfully reducing the size of stored/exported recordings,
// since we'll be saving thousands of these numbers per recording.
function round(value) {
  return Math.round(value * 10000) / 10000;
}
