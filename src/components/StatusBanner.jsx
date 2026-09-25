/**
 * Shows one clear message at a time depending on what's currently
 * happening with the camera and hand detection.
 *
 * status is one of:
 *   "loading"           - the tracking model is still downloading/starting
 *   "load-error"        - the tracking model failed to load
 *   "camera-denied"     - the user said no to the camera permission prompt
 *   "camera-not-found"  - there is no camera on this device
 *   "camera-error"      - some other camera problem occurred
 *   "no-hand"           - camera and model are working, but no hand is visible
 *   "tracking"          - one or two hands are visible and being tracked;
 *                         handCount says exactly how many
 *
 * Two hands is a completely normal, expected state now (for two-handed
 * signs), not a warning — so there is no "too many hands" error case
 * anymore. The model is configured to track at most 2 hands, so that's
 * the maximum that can ever be reported here.
 */
export function StatusBanner({ status, errorDetail, handCount }) {
  const trackingText =
    handCount === 2 ? "Tracking both hands" : "Tracking one hand";

  const messages = {
    loading: {
      text: "Loading hand tracking model…",
      tone: "neutral",
    },
    "load-error": {
      text:
        errorDetail ||
        "Could not load the hand tracking model. Check your internet connection and reload.",
      tone: "error",
    },
    "camera-denied": {
      text:
        "Camera access was denied. This app cannot work without it — please allow camera access and reload the page.",
      tone: "error",
    },
    "camera-not-found": {
      text: "No camera was found on this device.",
      tone: "error",
    },
    "camera-error": {
      text: "Something went wrong accessing the camera. Try reloading the page.",
      tone: "error",
    },
    "no-hand": {
      text: "No hand detected — hold one or both hands up in frame.",
      tone: "neutral",
    },
    tracking: {
      text: trackingText,
      tone: "success",
    },
  };

  const current = messages[status] ?? messages.loading;

  const toneClasses = {
    neutral: "bg-slate-800 text-slate-200 border-slate-600",
    error: "bg-rose-950 text-rose-200 border-rose-500",
    warning: "bg-amber-950 text-amber-200 border-amber-500",
    success: "bg-cyan-950 text-cyan-200 border-cyan-500",
  };

  return (
    <div
      className={`rounded-md border px-4 py-2 text-sm font-medium ${toneClasses[current.tone]}`}
    >
      {current.text}
    </div>
  );
}
