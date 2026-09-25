import { useEffect, useRef } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import { handColorFor, HAND_JOINT_COLOR, BODY_COLOR } from "../lib/handColors";

const CANVAS_SIZE = 320;

// Maps our normalized landmark units (where 1 unit ≈ one wrist-to-
// middle-fingertip distance) to on-screen pixels. This number is just a
// visual choice for how large the replayed hand looks - it has no effect
// on the actual recorded data.
const PIXELS_PER_UNIT = 70;
const PLAYBACK_FPS = 30;

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
 * frames: the recording's frame array, e.g. recording.frames - each frame
 * is an array of hands, each hand is an array of 21 {x, y, z} points.
 * isPlaying: whether to animate through frames or just show frame 0.
 * playToken: bump this (e.g. an incrementing number) to force playback to
 * restart from frame 0 on demand, even if isPlaying never changes - this
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
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const frame = frames[frameIndex];
      if (!frame) return;

      const handsToDraw = [];
      if (Array.isArray(frame)) {
        if (frame.length > 0) handsToDraw.push({ landmarks: frame[0], category: "Right" });
        if (frame.length > 1) handsToDraw.push({ landmarks: frame[1], category: "Left" });
      } else {
        if (frame.left_hand) handsToDraw.push({ landmarks: frame.left_hand, category: "Left" });
        if (frame.right_hand) handsToDraw.push({ landmarks: frame.right_hand, category: "Right" });
      }

      if (frame.body) {
        ctx.strokeStyle = BODY_COLOR;
        ctx.lineWidth = 2;
        
        const drawBodyLine = (joint1, joint2) => {
          if (frame.body[joint1] && frame.body[joint2]) {
            const p1 = toPixel(frame.body[joint1]);
            const p2 = toPixel(frame.body[joint2]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        };

        // Shoulders
        drawBodyLine('left_shoulder', 'right_shoulder');
        
        // Left arm
        drawBodyLine('left_shoulder', 'left_elbow');
        if (frame.left_hand && frame.left_hand[0]) {
          if (frame.body.left_elbow) {
            const p1 = toPixel(frame.body.left_elbow);
            const p2 = toPixel(frame.left_hand[0]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        } else {
          drawBodyLine('left_elbow', 'left_wrist');
        }

        // Right arm
        drawBodyLine('right_shoulder', 'right_elbow');
        if (frame.right_hand && frame.right_hand[0]) {
          if (frame.body.right_elbow) {
            const p1 = toPixel(frame.body.right_elbow);
            const p2 = toPixel(frame.right_hand[0]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        } else {
          drawBodyLine('right_elbow', 'right_wrist');
        }

        ctx.fillStyle = BODY_COLOR;
        for (const joint of ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist']) {
          if (frame.body[joint]) {
            if (joint === 'left_wrist' && frame.left_hand) continue;
            if (joint === 'right_wrist' && frame.right_hand) continue;
            const p = toPixel(frame.body[joint]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      handsToDraw.forEach(({ landmarks, category }) => {
        const color = handColorFor(category);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (const connection of HandLandmarker.HAND_CONNECTIONS) {
          const start = toPixel(landmarks[connection.start]);
          const end = toPixel(landmarks[connection.end]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }

        ctx.fillStyle = HAND_JOINT_COLOR;
        for (const point of landmarks) {
          const p = toPixel(point);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    if (!frames || frames.length === 0) {
      ctx.fillStyle = "#050505";
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
      className="cyber-skeleton-frame"
      role="img"
      aria-label="Recorded hand skeleton playback"
    >
      Recorded hand skeleton
    </canvas>
  );
}
