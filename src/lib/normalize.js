/**
 * Normalizes an ENTIRE recorded sequence of frames using the torso
 * as the fixed reference point and scale for the whole recording.
 *
 * THE NEW LOGIC (v3 Dual-Tracker with Split Z-Axis):
 * Origin: Midpoint between the left and right shoulders.
 * Scale: Distance between the left and right shoulders (shoulder width).
 *
 * CRITICAL Z-AXIS STRATEGY:
 * - BODY joints (shoulders, elbows, wrists): Z is flattened to 0.
 *   PoseLandmarker Z is hip-relative and incompatible with hand Z.
 * - HAND landmarks (21 points per hand): Z is PRESERVED as-is.
 *   HandLandmarker Z is wrist-relative and describes the actual 3D
 *   curvature of the fingers, which is essential for finger articulation
 *   in the avatar and for accurate DTW handshape matching.
 *
 * This mathematically anchors all hand and elbow movements relative to
 * the person's torso, making the recording completely independent of
 * how close they are to the camera or where they stand in the frame,
 * while perfectly preserving the true kinematic trajectories of the arms
 * AND the 3D finger articulation of the hands.
 */
export function normalizeSequence(rawFrames) {
  // Only use frames where the body was successfully detected to compute ref
  const validFrames = rawFrames.filter(
    (f) => f.body && f.body.left_shoulder && f.body.right_shoulder
  );

  if (validFrames.length === 0) {
    return { frames: rawFrames, normalized: false };
  }

  // 1. Calculate the reference origin (average shoulder midpoint across recording)
  const midpoints = validFrames.map((f) =>
    midpoint(f.body.left_shoulder, f.body.right_shoulder)
  );
  const refPoint = averagePoint(midpoints);

  // 2. Calculate the reference scale (average shoulder width across recording)
  const widths = validFrames.map((f) =>
    distanceBetween(f.body.left_shoulder, f.body.right_shoulder)
  );
  const refScale = safeScale(average(widths));

  // 3. Apply initial normalization to EVERY coordinate in every frame
  const baseNormalizedFrames = rawFrames.map((frame) => {
    const normalizedBody = {};
    if (frame.body) {
      for (const [joint, point] of Object.entries(frame.body)) {
        if (point) {
          normalizedBody[joint] = applyNormalization(point, refPoint, refScale);
        } else {
          normalizedBody[joint] = null;
        }
      }
    }

    return {
      body: normalizedBody,
      left_hand: frame.left_hand ? frame.left_hand.map((p) => applyHandNormalization(p, refPoint, refScale)) : null,
      right_hand: frame.right_hand ? frame.right_hand.map((p) => applyHandNormalization(p, refPoint, refScale)) : null,
    };
  });
  
  // 4. Temporal Low-Pass Filter (5-frame moving average) exclusively for Body Z
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);
  
  const finalFrames = baseNormalizedFrames.map((frame, i) => {
    const filteredBody = {};
    if (frame.body) {
      for (const joint of Object.keys(frame.body)) {
        if (!frame.body[joint]) {
          filteredBody[joint] = null;
          continue;
        }
        
        const newJoint = { x: frame.body[joint].x, y: frame.body[joint].y, z: frame.body[joint].z };
        
        // Moving average for Z-axis
        let zSum = 0;
        let validZCount = 0;
        
        for (let j = Math.max(0, i - halfWindow); j <= Math.min(baseNormalizedFrames.length - 1, i + halfWindow); j++) {
          const neighborFrame = baseNormalizedFrames[j];
          if (neighborFrame.body && neighborFrame.body[joint]) {
            zSum += neighborFrame.body[joint].z;
            validZCount++;
          }
        }
        
        if (validZCount > 0) {
          newJoint.z = round(zSum / validZCount);
        }
        
        filteredBody[joint] = newJoint;
      }
    }
    
    return {
      body: filteredBody,
      left_hand: frame.left_hand, // Hand bypasses the filter to preserve 3D volume
      right_hand: frame.right_hand,
    };
  });
  
  return { frames: finalFrames, normalized: true };
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

function safeScale(scale) {
  // Guards against division by zero
  return scale > 0.0001 ? scale : 1;
}

function applyNormalization(point, referencePoint, scale) {
  return {
    x: round((point.x - referencePoint.x) / scale),
    y: round((point.y - referencePoint.y) / scale),
    z: round((point.z - referencePoint.z) / scale), // Restored true volumetric depth relative to chest
  };
}

/**
 * Hand landmarks get X/Y normalized the same way as body joints, but Z
 * is PRESERVED relative to the wrist. However, to maintain the correct
 * spatial aspect ratio (since X and Y are divided by the shoulder scale),
 * we MUST also divide Z by the same scale. Failing to scale Z uniformly
 * squashes the 3D direction vectors and breaks the finger articulation angles.
 */
function applyHandNormalization(point, referencePoint, scale) {
  return {
    x: round((point.x - referencePoint.x) / scale),
    y: round((point.y - referencePoint.y) / scale),
    z: round(point.z / scale), // Uniformly scaled to preserve 3D angle aspect ratios
  };
}

function distanceBetween(a, b) {
  // Use only X and Y for scale calculation
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
  );
}

// Rounding to 4 decimal places keeps plenty of precision
function round(value) {
  return Math.round(value * 10000) / 10000;
}
