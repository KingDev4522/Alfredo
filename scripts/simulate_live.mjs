import { readFileSync } from "fs";
import { normalizeSequence } from "../src/lib/normalize.js";
import { createSegmenter } from "../src/lib/segmentation.js";
import { buildMergedLibrary, classifyWithPriority } from "../src/lib/libraryMerge.js";
import { fingertipWeighted, CONFIDENCE_THRESHOLD } from "../src/lib/recognizer.js";

const raw = JSON.parse(readFileSync("isl-backend/database/recordings.json", "utf-8"));
const recs = Array.isArray(raw) ? raw : raw.recordings;
const a = recs.find((r) => r.signId === "a");
const main = recs.map((r) => ({ ...r, source: "main" }));

// This is EXACTLY what LiveInterpreter builds after Supabase load.
const lib = buildMergedLibrary(main, []);
console.log("library: mainCount =", lib.mainCount, " userCount =", lib.userCount);
console.log("bucket 1 =", lib.main[1].length, " bucket 2 =", lib.main[2].length);

// This is EXACTLY what LiveInterpreter.classifyAsync does.
function trimToRecentWindow(frames, targetMs = 2000, estimatedFps = 30) {
  const targetFrameCount = Math.round((targetMs / 1000) * estimatedFps);
  if (frames.length <= targetFrameCount) return frames;
  return frames.slice(frames.length - targetFrameCount);
}

function runLivePipeline(frames, label) {
  const seg = trimToRecentWindow(frames);
  const norm = normalizeSequence(seg);
  if (!norm.normalized) {
    console.log(label, "-> NORMALIZATION FAILED");
    return;
  }
  const res = classifyWithPriority(norm.frames, lib, {
    landmarkWeight: fingertipWeighted,
    threshold: CONFIDENCE_THRESHOLD,
  });
  const ok = res.signId && res.confidence >= CONFIDENCE_THRESHOLD;
  console.log(
    `${label.padEnd(38)} -> ${String(res.signId).padEnd(6)} dist ${res.distance.toFixed(3).padStart(8)} conf ${res.confidence.toFixed(4)} ${ok ? "RECOGNIZED" : "*** REJECTED ***"}`
  );
}

console.log("\n--- full live pipeline on the recorded frames ---");
runLivePipeline(a.frames, "recorded 'a' through live path");

// Now simulate realistic live conditions: both hands tracked, slight noise.
function jitter(frames, amt, seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  return frames.map((f) => {
    const o = { body: f.body };
    for (const k of ["left_hand", "right_hand"]) {
      o[k] = f[k] ? f[k].map((p) => ({ x: p.x + rnd() * amt, y: p.y + rnd() * amt, z: p.z + rnd() * amt })) : null;
    }
    return o;
  });
}
console.log("\n--- with live tracking noise ---");
runLivePipeline(jitter(a.frames, 0.02), "2% noise");
runLivePipeline(jitter(a.frames, 0.05), "5% noise");
runLivePipeline(jitter(a.frames, 0.10), "10% noise");

// Dropout like real MediaPipe on close hands.
console.log("\n--- with realistic hand flicker ---");
const flick = a.frames.map((f, i) => (i % 4 === 0 ? { ...f, left_hand: null } : f));
runLivePipeline(flick, "25% left-hand flicker");

// What the segmenter actually emits for a held pose.
console.log("\n--- segmenter output on a held pose ---");
const seg = createSegmenter();
let out = null;
let t = 0;
for (let i = 0; i < 120; i++) {
  t += 33;
  const ev = seg.pushFrame(a.frames[i % a.frames.length], t);
  if (ev.event === "segment-ready") { out = ev.segmentFrames; break; }
}
console.log("segmenter emitted:", out ? out.length + " frames" : "NOTHING within 120 frames");
if (out) runLivePipeline(out, "segmenter output");
