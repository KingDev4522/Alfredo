import { useEffect, useState } from "react";
import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

const HAND_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const WASM_PATH = "/wasm";

const HAND_OPTIONS = {
  runningMode: "VIDEO",
  numHands: 2,
  minHandDetectionConfidence: 0.4,
  minHandPresenceConfidence: 0.4,
  minTrackingConfidence: 0.5,
};

const POSE_OPTIONS = {
  runningMode: "VIDEO",
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

// MediaPipe's WASM graph throws an uncaught `Aborted()` RuntimeError when
// close() races graph teardown (React StrictMode double-mount, fast tab
// switches, HMR). The native resource is gone either way, so swallow close
// failures instead of crashing the page with an uncaught exception.
function safeClose(lm) {
  if (!lm) return;
  try {
    lm.close();
  } catch (err) {
    console.warn("Landmarker close() suppressed:", err?.message || err);
  }
}

function createHandWithTimeout(vision, delegate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    let isSettled = false;

    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL_PATH, delegate },
      ...HAND_OPTIONS,
    }).then((lm) => {
      if (isSettled) {
        safeClose(lm);
      } else {
        isSettled = true;
        clearTimeout(timeoutId);
        resolve(lm);
      }
    }).catch(err => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });

    timeoutId = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(new Error(`Hand ${delegate} timed out`));
      }
    }, timeoutMs);
  });
}

function createPoseWithTimeout(vision, delegate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    let isSettled = false;

    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate },
      ...POSE_OPTIONS,
    }).then((lm) => {
      if (isSettled) {
        safeClose(lm);
      } else {
        isSettled = true;
        clearTimeout(timeoutId);
        resolve(lm);
      }
    }).catch(err => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });

    timeoutId = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(new Error(`Pose ${delegate} timed out`));
      }
    }, timeoutMs);
  });
}

async function loadDelegate(vision, delegate, timeoutHand, timeoutPose) {
  const results = await Promise.allSettled([
    createHandWithTimeout(vision, delegate, timeoutHand),
    createPoseWithTimeout(vision, delegate, timeoutPose)
  ]);

  const isSuccess = results[0].status === "fulfilled" && results[1].status === "fulfilled";
  if (!isSuccess) {
    if (results[0].status === "fulfilled") safeClose(results[0].value);
    if (results[1].status === "fulfilled") safeClose(results[1].value);
    throw new Error(`Delegate ${delegate} failed: ${results.find(r => r.status === "rejected")?.reason}`);
  }
  return [results[0].value, results[1].value];
}

let visionSingletonPromise = null;
function getVision() {
  if (!visionSingletonPromise) {
    visionSingletonPromise = FilesetResolver.forVisionTasks(WASM_PATH);
  }
  return visionSingletonPromise;
}

/*
 * Shared, reference-counted task instances.
 *
 * Every consumer of this hook used to build its own pair of WASM graphs, and
 * the GPU delegate backs each graph with a real WebGL context. That made the
 * context count a function of how many components happened to be mounted, and
 * browsers cap live WebGL contexts and drop the oldest when the cap is hit —
 * which is what killed the three.js avatar with "THREE.WebGLRenderer: Context
 * Lost" while MediaPipe was running. Two components on one route, doubled
 * again by StrictMode's mount/unmount/mount in dev, was enough.
 *
 * The graphs are stateless between detectForVideo calls, so sharing one pair
 * across every consumer is safe and caps MediaPipe at two contexts for the
 * whole app.
 *
 * Release is delayed rather than immediate. StrictMode unmounts and remounts
 * in the same commit, so closing on the first unmount would tear the graphs
 * down and rebuild them on every dev mount — the exact churn this is meant to
 * remove.
 */
const RELEASE_DELAY_MS = 1500;

let shared = null; // { hand, pose, delegate }
let sharedPromise = null; // in-flight load
let consumers = 0;
let releaseTimer = null;

async function loadShared() {
  const vision = await getVision();

  let hand, pose, delegateUsed;

  try {
    // Try GPU first
    [hand, pose] = await loadDelegate(vision, "GPU", 7000, 7000);
    delegateUsed = "GPU";
  } catch (gpuError) {
    console.warn("GPU delegate failed/timed out, falling back to CPU:", gpuError);
    [hand, pose] = await loadDelegate(vision, "CPU", 20000, 20000);
    delegateUsed = "CPU";
  }

  return { hand, pose, delegate: delegateUsed };
}

function releaseShared() {
  // Clamped, so a double cleanup can never drive the counter negative and
  // silently skip the release for the next real consumer.
  consumers = Math.max(0, consumers - 1);
  if (consumers > 0) return;
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (consumers > 0) return;
    if (shared) {
      safeClose(shared.hand);
      safeClose(shared.pose);
      shared = null;
    }
    // Cleared so a later mount retries instead of awaiting a rejected promise
    // that can never settle twice.
    sharedPromise = null;
  }, RELEASE_DELAY_MS);
}

export function usePoseHandTracker() {
  const [poseLandmarker, setPoseLandmarker] = useState(null);
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeDelegate, setActiveDelegate] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    consumers += 1;
    clearTimeout(releaseTimer);

    // Already loaded by an earlier consumer: adopt it synchronously rather
    // than re-awaiting, so a second component on the same route gets its
    // landmarkers on the first render.
    if (shared) {
      setHandLandmarker(shared.hand);
      setPoseLandmarker(shared.pose);
      setActiveDelegate(shared.delegate);
      setIsLoading(false);
    } else {
      if (!sharedPromise) {
        sharedPromise = loadShared().catch((error) => {
          // Let the next mount try again instead of caching the failure.
          sharedPromise = null;
          throw error;
        });
      }

      sharedPromise
        .then((result) => {
          shared = result;
          if (isCancelled) return;
          setHandLandmarker(result.hand);
          setPoseLandmarker(result.pose);
          setActiveDelegate(result.delegate);
          setIsLoading(false);
        })
        .catch((error) => {
          if (isCancelled) return;
          setLoadError(
            "Could not load tracking models on either GPU or CPU. " +
            "Check console. Try a hard refresh."
          );
          setIsLoading(false);
          console.error("Dual Tracker failed to load:", error);
        });
    }

    return () => {
      isCancelled = true;
      releaseShared();
    };
  }, []);

  return { poseLandmarker, handLandmarker, isLoading, loadError, activeDelegate };
}
