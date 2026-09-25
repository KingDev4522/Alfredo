// Shared camera constraints, used by both the Phase 1 tracker view and the
// Phase 2 recording tool, so the two stay consistent with each other.
//
// 640x480 keeps per-frame processing cost low (the model crops down
// internally regardless of input size, so higher resolution mostly adds
// overhead, not accuracy). frameRate is requested explicitly at 30,
// since some webcam drivers silently drop to a lower rate in dim
// lighting unless asked otherwise.
export const CAMERA_CONSTRAINTS = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30, min: 15 },
    facingMode: "user",
  },
  audio: false,
};
