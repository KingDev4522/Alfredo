/**
 * Detects sign BOUNDARIES during continuous, natural signing - no
 * countdown, no "press record." This is the piece that makes live
 * interpretation actually work: Phase 2's recording tool always knew
 * exactly when a sign started and ended (the countdown told it), but
 * live use just has someone signing naturally, one word after another.
 *
 * THE APPROACH: track how much the hand(s) are moving, frame to frame.
 * While the hand is actively moving, we're presumably mid-sign. When
 * movement drops and stays low for a short confirmation window, that's
 * a natural pause between signs - exactly how people actually sign in
 * sequence. The frames from the last boundary up to that pause become
 * one candidate sign, which gets handed off to the recognizer.
 *
 * IMPORTANT - these thresholds are a reasonable starting point, not
 * something we could validate against the recorded dataset (that data
 * was all pre-segmented by the countdown, so it can't tell us how fast
 * real continuous signing moves). Expect to tune movementThreshold and
 * pauseConfirmMs after testing with an actual camera - see the Settings
 * note in the live interpreter UI.
 *
 * KNOWN FIX APPLIED: minSegmentMs was originally 250ms, which was too
 * short - many signs are essentially a static handshape held in place,
 * not a translating motion, so they satisfied "moved, then paused"
 * almost instantly, firing tiny near-empty segments repeatedly rather
 * than one real ~2-second segment matching the training data's scale.
 * minSegmentMs was raised to 1200ms as a floor matching that scale.
 *
 * SPEED PASS: now that the vocabulary is fully one-handed and mostly
 * static (confirmed working well), minSegmentMs and pauseConfirmMs have
 * been brought back down for a much snappier feel. This is safe now in
 * a way it wasn't before: the live interpreter separately suppresses a
 * sign from being added to the sentence twice in a row, so even if a
 * held static sign causes the segmenter to fire again while still held,
 * it no longer shows up as a duplicate in the sentence - it just quietly
 * keeps confirming the same word instead of spamming it. That decoupling
 * is what makes it safe to prioritize speed here.
 */
export function createSegmenter(options = {}) {
  const {
    movementThreshold = 0.005, // avg per-landmark displacement per frame (reduced from 0.05)
    pauseConfirmMs = 350, // stillness duration that confirms "sign ended"
    minSegmentMs = 550, // floor - enough frames for a real comparison, fast to trigger
    maxSegmentMs = 3000, // force-finalize if no pause is ever detected
  } = options;

  let state = "idle"; // "idle" | "accumulating"
  let bufferFrames = [];
  let bufferStartTime = null;
  let lastMoveTime = null;
  let previousCentroid = null;
  let centroidBuffer = [];
  const CENTROID_WINDOW = 3;

  function reset() {
    state = "idle";
    bufferFrames = [];
    bufferStartTime = null;
    lastMoveTime = null;
    previousCentroid = null;
    centroidBuffer = [];
  }

  function computeCentroid(frame) {
    let sumX = 0, sumY = 0, sumZ = 0, count = 0;
    const hands = [frame.left_hand, frame.right_hand].filter(Boolean);
    for (const hand of hands) {
      for (const point of hand) {
        sumX += point.x;
        sumY += point.y;
        sumZ += point.z;
        count++;
      }
    }
    if (count === 0) return null;
    return { x: sumX / count, y: sumY / count, z: sumZ / count };
  }

  function getSmoothedCentroid(centroid) {
    if (!centroid) return null;
    centroidBuffer.push(centroid);
    if (centroidBuffer.length > CENTROID_WINDOW) {
      centroidBuffer.shift();
    }
    const sum = centroidBuffer.reduce((acc, val) => ({
      x: acc.x + val.x,
      y: acc.y + val.y,
      z: acc.z + val.z
    }), {x:0, y:0, z:0});
    return {
      x: sum.x / centroidBuffer.length,
      y: sum.y / centroidBuffer.length,
      z: sum.z / centroidBuffer.length
    };
  }

  function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  /**
   * Call once per detected frame with the unified frame object 
   * { body, left_hand, right_hand } and the current timestamp in ms.
   *
   * Returns { event: "none" } most of the time, or
   * { event: "segment-ready", segmentFrames } the moment a completed
   * sign's frames are ready to be classified.
   */
  function pushFrame(frame, timestampMs) {
    const hasHands = frame.left_hand || frame.right_hand;

    if (!hasHands) {
      if (state === "accumulating" && timestampMs - bufferStartTime >= minSegmentMs) {
        const finished = bufferFrames;
        reset();
        return { event: "segment-ready", segmentFrames: finished };
      }
      reset();
      return { event: "none" };
    }

    const rawCentroid = computeCentroid(frame);
    const centroid = getSmoothedCentroid(rawCentroid);

    if (state === "idle") {
      state = "accumulating";
      bufferFrames = [frame];
      bufferStartTime = timestampMs;
      lastMoveTime = timestampMs;
      previousCentroid = centroid;
      return { event: "none" };
    }

    bufferFrames.push(frame);

    const displacement = previousCentroid && centroid ? distance(centroid, previousCentroid) : 0;
    previousCentroid = centroid;
    if (displacement > movementThreshold) {
      lastMoveTime = timestampMs;
    }

    const elapsed = timestampMs - bufferStartTime;
    const stillFor = timestampMs - lastMoveTime;

    if (elapsed >= minSegmentMs && stillFor >= pauseConfirmMs) {
      const finished = bufferFrames;
      reset();
      return { event: "segment-ready", segmentFrames: finished };
    }

    if (elapsed >= maxSegmentMs) {
      const finished = bufferFrames;
      reset();
      return { event: "segment-ready", segmentFrames: finished };
    }

    return { event: "none" };
  }

  function getBufferedMs(nowMs) {
    return bufferStartTime ? nowMs - bufferStartTime : 0;
  }

  function getStateLabel() {
    return state;
  }

  return { pushFrame, reset, getBufferedMs, getStateLabel };
}
