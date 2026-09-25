import { useEffect, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// This is the official, free, Google-hosted hand tracking model file.
// It is downloaded once by the browser the first time the app runs, and
// after that the browser will typically cache it, so this is the only
// piece of the whole app that needs an internet connection at all.
const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// The WASM runtime itself (the actual hand-tracking engine) is bundled
// locally inside the /public/wasm folder of this project, instead of being
// pulled from a CDN every time.
const WASM_PATH = "/wasm";

// numHands is 2. "Help" in our vocabulary is naturally two-handed in ISL
// (verified against ISLRTC - Sorry, Thank You, and Pain turned out to be
// one-handed, contrary to an earlier assumption), so we still need two
// hands trackable at once, just for a smaller set than originally thought.
//
// This sounds like "double the work" compared to one hand, but it mostly
// isn't. The expensive step - searching the entire frame to find a hand
// at all - runs once per frame either way, and finds up to numHands hands
// in that same single pass. Going from 1 to 2 mainly adds one extra cheap
// landmark pass for the second hand, not a second full search. Combined
// with everything else already in place (GPU delegate, lower resolution,
// frame-accurate timing), tracking both hands should stay fast.
const DETECTION_OPTIONS = {
  runningMode: "VIDEO",
  numHands: 2,
  minHandDetectionConfidence: 0.4,
  minHandPresenceConfidence: 0.4,
  minTrackingConfidence: 0.5,
};

/**
 * Tries to create a HandLandmarker using a specific delegate ("GPU" or
 * "CPU"), but gives up and rejects if it takes longer than timeoutMs.
 * This is what lets us attempt the fast path (GPU) without risking an
 * infinite hang if a particular machine's GPU delegate misbehaves.
 */
function createWithTimeout(vision, delegate, timeoutMs) {
  const creation = HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_ASSET_PATH,
      delegate,
    },
    ...DETECTION_OPTIONS,
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`${delegate} delegate timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  return Promise.race([creation, timeout]);
}

/**
 * Loads the MediaPipe Hand Landmarker, preferring the GPU delegate for
 * speed, and automatically falling back to CPU if GPU fails or hangs on
 * this particular machine. Exposes which delegate actually ended up
 * running, so the UI can show it.
 */
export function useHandLandmarker() {
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeDelegate, setActiveDelegate] = useState(null);

  useEffect(() => {
    // In development, React intentionally runs this effect twice in a row
    // to surface bugs. We don't block the second run - each run tracks
    // its own cancellation independently, so whichever one finishes while
    // still "active" is the one that updates state. This is the correct
    // pattern; trying to block the second run entirely is what caused the
    // earlier bug where a successful load got silently discarded.
    let isCancelled = false;

    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

        let landmarker;
        let delegateUsed;

        try {
          // Try the fast path first. 7 seconds is enough time for a normal
          // GPU init, but short enough that a hanging/broken GPU delegate
          // doesn't waste much time before we fall back.
          landmarker = await createWithTimeout(vision, "GPU", 7000);
          delegateUsed = "GPU";
        } catch (gpuError) {
          console.warn(
            "GPU delegate failed or timed out, falling back to CPU:",
            gpuError
          );
          landmarker = await createWithTimeout(vision, "CPU", 20000);
          delegateUsed = "CPU";
        }

        if (!isCancelled) {
          setHandLandmarker(landmarker);
          setActiveDelegate(delegateUsed);
          setIsLoading(false);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            "Could not load the hand tracking model on either GPU or CPU. " +
              "Open the browser console (F12) to see the exact error. " +
              "This usually means no internet connection on first load. " +
              "try a hard refresh (Ctrl+Shift+R) once connected."
          );
          setIsLoading(false);
        }
        console.error("Hand Landmarker failed to load on both delegates:", error);
      }
    }

    loadModel();

    return () => {
      isCancelled = true;
    };
  }, []);

  return { handLandmarker, isLoading, loadError, activeDelegate };
}
