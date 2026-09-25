export function StatusBanner({ status, errorDetail, handCount }) {
  const messages = {
    loading: {
      text: "Loading hand tracking model.",
      tone: "live",
    },
    "load-error": {
      text:
        errorDetail || "Could not load the tracking model. Check the connection and reload.",
      tone: "error",
    },
    "camera-denied": {
      text: "Camera access was denied. Allow camera access in the browser and reload.",
      tone: "error",
    },
    "camera-not-found": {
      text: "No camera was found on this device.",
      tone: "error",
    },
    "camera-error": {
      text: "The camera could not start. Close other camera apps and reload.",
      tone: "error",
    },
    "no-hand": {
      text: "No hand detected. Hold one or both hands in frame.",
      tone: "live",
    },
    tracking: {
      text: handCount === 2 ? "Tracking both hands." : "Tracking one hand.",
      tone: "success",
    },
  };

  const current = messages[status] ?? messages.loading;
  const toneClass = {
    live: "border-[#55F6E5]/50 text-[#55F6E5]",
    error: "border-[#FFB000]/60 text-[#FFB000]",
    success: "border-[#C8FF00]/60 text-[#C8FF00]",
  }[current.tone];

  return (
    <div
      className={`border bg-black px-4 py-3 font-mono text-xs ${toneClass}`}
      role={current.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {current.text}
    </div>
  );
}
