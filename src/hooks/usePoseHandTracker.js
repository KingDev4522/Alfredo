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

export function usePoseHandTracker() {
  const [poseLandmarker, setPoseLandmarker] = useState(null);
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeDelegate, setActiveDelegate] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    let localHand = null;
    let localPose = null;

    async function loadModels() {
      try {
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

        if (!isCancelled) {
          localHand = hand;
          localPose = pose;
          setHandLandmarker(hand);
          setPoseLandmarker(pose);
          setActiveDelegate(delegateUsed);
          setIsLoading(false);
        } else {
          safeClose(hand);
          safeClose(pose);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            "Could not load tracking models on either GPU or CPU. " +
            "Check console. Try a hard refresh."
          );
          setIsLoading(false);
        }
        console.error("Dual Tracker failed to load:", error);
      }
    }

    loadModels();

    return () => {
      isCancelled = true;
      safeClose(localHand);
      safeClose(localPose);
      localHand = null;
      localPose = null;
    };
  }, []);

  return { poseLandmarker, handLandmarker, isLoading, loadError, activeDelegate };
}
