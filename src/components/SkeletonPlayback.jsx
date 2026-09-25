import { useEffect, useRef } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";

const CANVAS_SIZE = 320;

// Maps our normalized landmark units (where 1 unit ≈ one wrist-to-
// middle-fingertip distance) to on-screen pixels. This number is just a
// visual choice for how large the replayed hand looks — it has no effect
// on the actual recorded data.
const PIXELS_PER_UNIT = 70;
const PLAYBACK_FPS = 30;

const HAND_COLORS = ["#2DE2E6", "#FFB627"];

/**
 * Replays a recorded, normalized sign as an animated skeleton.
 *
 * We deliberately do NOT reuse MediaPipe's own DrawingUtils here, because
 * DrawingUtils expects landmark coordinates in the original 0-1 image
 * range and scales them to canvas size automatically. Our recorded
 * coordinates have already been normalized into a completely different
 * space (centered on the wrist or hand midpoint, scaled by hand size, and
 * can be negative), so we draw manually with our own pixel mapping
 * instead.
 *
 * frames: the recording's frame array, e.g. recording.frames — each frame
 * is an array of hands, each hand is an array of 21 {x, y, z} points.
 * isPlaying: whether to animate through frames or just show frame 0.
 * playToken: bump this (e.g. an incrementing number) to force playback to
 * restart from frame 0 on demand, even if isPlaying never changes — this
 * is what powers a "Replay" button.
 * onFinished: called once playback reaches the end of the frames array.
 */
export function SkeletonPlayback({ frames, isPlaying, playToken = 0, onFinished }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function toPixel(point) {
      return {
        x: CANVAS_SIZE / 2 + point.x * PIXELS_PER_UNIT,
        y: CANVAS_SIZE / 2 + point.y * PIXELS_PER_UNIT,
      };
    }

    function drawFrame(frameIndex) {
      ctx.fillStyle = "#0A0E1A";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const frame = frames[frameIndex];
      if (!frame) return;

      frame.forEach((hand, handIndex) => {
        const color = HAND_COLORS[handIndex % HAND_COLORS.length];

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (const connection of HandLandmarker.HAND_CONNECTIONS) {
          const start = toPixel(hand[connection.start]);
          const end = toPixel(hand[connection.end]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }

        ctx.fillStyle = "#FF4D6D";
        for (const point of hand) {
          const p = toPixel(point);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    if (!frames || frames.length === 0) {
      ctx.fillStyle = "#0A0E1A";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      return;
    }

    if (!isPlaying) {
      drawFrame(0);
      return;
    }

    let frameIndex = 0;
    drawFrame(0);

    const intervalId = setInterval(() => {
      frameIndex += 1;
      if (frameIndex >= frames.length) {
        clearInterval(intervalId);
        if (onFinished) onFinished();
        return;
      }
      drawFrame(frameIndex);
    }, 1000 / PLAYBACK_FPS);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, isPlaying, playToken]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="rounded-lg border border-slate-700"
    />
  );
}
