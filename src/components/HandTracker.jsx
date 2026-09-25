import { useEffect, useRef, useState } from "react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { useHandLandmarker } from "../hooks/useHandLandmarker";
import { StatusBanner } from "./StatusBanner";
import { CAMERA_CONSTRAINTS } from "../lib/camera";
import { handColorFor, HAND_JOINT_COLOR } from "../lib/handColors";

const supportsVideoFrameCallback =
  typeof HTMLVideoElement !== "undefined" &&
  "requestVideoFrameCallback" in HTMLVideoElement.prototype;

// --- Adaptive performance settings ---
// If the real, measured FPS stays below LOW_FPS_THRESHOLD for this many
// consecutive processed frames, we treat it as a genuine sustained
// slowdown (not just a one-off stutter) and automatically start feeding
// the detector a smaller copy of the frame instead of the full-size one.
// This trades a small amount of detail for real speed back, automatically,
// on whatever hardware happens to be running it.
const LOW_FPS_THRESHOLD = 12;
const SUSTAINED_LOW_FPS_FRAMES = 90; // roughly 3-7 seconds depending on current fps
const SCALE_STEP = 0.8;
const MIN_SCALE = 0.5;

export function HandTracker() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const processingCanvasRef = useRef(null);
  const frameCallbackId = useRef(null);

  const previousFrameTime = useRef(performance.now());
  const recentFrameDurations = useRef([]);
  const lowFpsStreak = useRef(0);
  const processingScale = useRef(1);

  const { handLandmarker, isLoading, loadError, activeDelegate } =
    useHandLandmarker();

  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [handStatus, setHandStatus] = useState("no-hand");
  const [handCount, setHandCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [cameraInfo, setCameraInfo] = useState(null);
  const [displayScale, setDisplayScale] = useState(100);

  useEffect(() => {
    let stream;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraStatus("ready");

          const track = stream.getVideoTracks()[0];
          const settings = track.getSettings();
          setCameraInfo({
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate ? Math.round(settings.frameRate) : null,
          });
        }
      } catch (error) {
        if (error.name === "NotAllowedError") {
          setCameraStatus("camera-denied");
        } else if (error.name === "NotFoundError") {
          setCameraStatus("camera-not-found");
        } else {
          setCameraStatus("camera-error");
        }
        console.error("Camera access failed:", error);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const video = videoRef.current;
      if (frameCallbackId.current && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackId.current);
      } else if (frameCallbackId.current) {
        cancelAnimationFrame(frameCallbackId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!handLandmarker || cameraStatus !== "ready") return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);

    // This offscreen canvas is never shown on screen. It only exists so
    // that, if adaptive scaling kicks in, we can draw a smaller copy of
    // the video frame and feed THAT to the detector instead of the full
    // size video, reducing per-frame processing cost.
    if (!processingCanvasRef.current) {
      processingCanvasRef.current = document.createElement("canvas");
    }
    const processingCanvas = processingCanvasRef.current;
    const processingCtx = processingCanvas.getContext("2d", {
      willReadFrequently: false,
    });

    function getDetectionInput() {
      if (processingScale.current === 1) {
        return video;
      }

      const scaledWidth = Math.round(video.videoWidth * processingScale.current);
      const scaledHeight = Math.round(video.videoHeight * processingScale.current);

      if (
        processingCanvas.width !== scaledWidth ||
        processingCanvas.height !== scaledHeight
      ) {
        processingCanvas.width = scaledWidth;
        processingCanvas.height = scaledHeight;
      }

      processingCtx.drawImage(video, 0, 0, scaledWidth, scaledHeight);
      return processingCanvas;
    }

    function maybeAdaptQuality(currentFps) {
      if (currentFps > 0 && currentFps < LOW_FPS_THRESHOLD) {
        lowFpsStreak.current += 1;
      } else {
        lowFpsStreak.current = 0;
      }

      if (
        lowFpsStreak.current >= SUSTAINED_LOW_FPS_FRAMES &&
        processingScale.current > MIN_SCALE
      ) {
        processingScale.current = Math.max(
          MIN_SCALE,
          processingScale.current * SCALE_STEP
        );
        setDisplayScale(Math.round(processingScale.current * 100));
        lowFpsStreak.current = 0;
        console.warn(
          `Sustained low FPS detected. Reducing processing resolution to ${Math.round(
            processingScale.current * 100
          )}% to recover speed.`
        );
      }
    }

    function runDetection(nowMs) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const detectionInput = getDetectionInput();

      // Landmark coordinates from the model are always normalized (0 to 1)
      // relative to whatever image was fed in, so they line up correctly
      // on our full-size display canvas regardless of whether we just
      // detected on the full video or a downscaled copy of it.
      let result;
      try {
        result = handLandmarker.detectForVideo(detectionInput, nowMs);
      } catch (err) {
        // Landmarker closed mid-frame during tab switch/unmount - skip this
        // frame quietly instead of throwing an uncaught WASM Aborted().
        if (!runDetection.warned) {
          console.warn("detectForVideo failed:", err?.message || err);
          runDetection.warned = true;
        }
        return;
      }

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const detectedHandCount = result.landmarks.length;
      setHandCount(detectedHandCount);
      setHandStatus(detectedHandCount === 0 ? "no-hand" : "tracking");

      // Two distinct colors per hand make it visually obvious when both
      // hands are being tracked at once, rather than just drawing
      // everything the same color. Colors follow the detected handedness,
      // not detection order, so the same hand keeps the same color.
      result.landmarks.forEach((landmarks, index) => {
        const category = result.handednesses?.[index]?.[0]?.categoryName;
        const color = handColorFor(category);

        drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
          color,
          lineWidth: 3,
        });
        drawingUtils.drawLandmarks(landmarks, {
          color: HAND_JOINT_COLOR,
          lineWidth: 1,
          radius: 4,
        });
      });

      canvasCtx.restore();

      const frameDuration = nowMs - previousFrameTime.current;
      previousFrameTime.current = nowMs;

      recentFrameDurations.current.push(frameDuration);
      if (recentFrameDurations.current.length > 30) {
        recentFrameDurations.current.shift();
      }

      const averageDuration =
        recentFrameDurations.current.reduce((sum, d) => sum + d, 0) /
        recentFrameDurations.current.length;

      const currentFps = Math.round(1000 / averageDuration);
      setFps(currentFps);
      maybeAdaptQuality(currentFps);
    }

    if (supportsVideoFrameCallback) {
      const onFrame = (nowMs) => {
        if (video.readyState >= 2) {
          runDetection(nowMs);
        }
        frameCallbackId.current = video.requestVideoFrameCallback(onFrame);
      };
      frameCallbackId.current = video.requestVideoFrameCallback(onFrame);
    } else {
      const onFrame = () => {
        if (video.readyState >= 2) {
          runDetection(performance.now());
        }
        frameCallbackId.current = requestAnimationFrame(onFrame);
      };
      frameCallbackId.current = requestAnimationFrame(onFrame);
    }

    return () => {
      if (frameCallbackId.current && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackId.current);
      } else if (frameCallbackId.current) {
        cancelAnimationFrame(frameCallbackId.current);
      }
    };
  }, [handLandmarker, cameraStatus]);

  let bannerStatus = handStatus;
  let errorDetail = null;
  if (isLoading) {
    bannerStatus = "loading";
  } else if (loadError) {
    bannerStatus = "load-error";
    errorDetail = loadError;
  } else if (cameraStatus !== "ready") {
    bannerStatus = cameraStatus;
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-full max-w-3xl aspect-video bg-white/[0.03] rounded-lg overflow-hidden border border-white/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full -scale-x-100"
        />

        {cameraStatus === "ready" && !isLoading && !loadError && (
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
            <div className="rounded-md bg-black/60 px-3 py-1 font-mono text-xs text-[#55F6E5]">
              {fps} FPS (detection)
            </div>
            <div className="rounded-md bg-black/60 px-3 py-1 font-mono text-[10px] text-[#5C6478]">
              engine: {activeDelegate}
            </div>
            {cameraInfo && (
              <div className="rounded-md bg-black/60 px-3 py-1 font-mono text-[10px] text-[#5C6478]">
                camera: {cameraInfo.width}×{cameraInfo.height}
                {cameraInfo.frameRate ? ` @ ${cameraInfo.frameRate}fps` : ""}
              </div>
            )}
            {displayScale < 100 && (
              <div className="border border-[#55F6E5]/40 bg-black px-3 py-2 font-mono text-[10px] text-[#55F6E5]">
                auto-scaled to {displayScale}% for speed
              </div>
            )}
          </div>
        )}
      </div>

      <StatusBanner status={bannerStatus} errorDetail={errorDetail} handCount={handCount} />
    </div>
  );
}
