import { readFileSync } from "fs";
import { classifySequence, fingertipWeighted, CONFIDENCE_THRESHOLD } from "../src/lib/recognizer.js";
import { buildTemplateLibrary } from "../src/lib/recognizer.js";

const raw = JSON.parse(readFileSync("isl-backend/database/recordings.json", "utf-8"));
const recs = Array.isArray(raw) ? raw : raw.recordings;
const tpl = recs.find((r) => r.handCount === 2) || recs[0];
const lib = buildTemplateLibrary([tpl]);

function clone(frames) {
  return frames.map((f) => ({ ...f }));
}

function dropHand(frames, which) {
  return frames.map((f) => ({ ...f, [which]: null }));
}

function jitter(frames, amt, seed = 1) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  return frames.map((f) => {
    const out = { body: f.body };
    for (const k of ["left_hand", "right_hand"]) {
      out[k] = f[k] ? f[k].map((p) => ({ x: p.x + rnd() * amt, y: p.y + rnd() * amt, z: p.z + rnd() * amt })) : null;
    }
    return out;
  });
}

function report(name, frames) {
  const r = classifySequence(frames, lib, { landmarkWeight: fingertipWeighted });
  const ok = r.confidence >= CONFIDENCE_THRESHOLD;
  console.log(
    `${name.padEnd(34)} dist ${r.distance.toFixed(3).padStart(10)}  conf ${r.confidence.toFixed(4)}  ${ok ? "RECOGNIZED" : "*** REJECTED ***"}`
  );
}

console.log("threshold =", CONFIDENCE_THRESHOLD, "\n");
report("exact replay", clone(tpl.frames));
report("jitter 1%", jitter(tpl.frames, 0.01));
report("jitter 3%", jitter(tpl.frames, 0.03));
report("jitter 5%", jitter(tpl.frames, 0.05));
console.log("");
report("left hand LOST", dropHand(tpl.frames, "left_hand"));
report("right hand LOST", dropHand(tpl.frames, "right_hand"));
console.log("");
report("left hand 50% dropout", clone(tpl.frames).map((f, i) => (i % 2 === 0 ? { ...f, left_hand: null } : f)));
report("left hand 30% dropout", clone(tpl.frames).map((f, i) => (i % 3 === 0 ? { ...f, left_hand: null } : f)));
