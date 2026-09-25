import { readFileSync } from "fs";
import { dtwDistance } from "../src/lib/dtw.js";
import { buildTemplateLibrary, classifySequence, fingertipWeighted, CONFIDENCE_THRESHOLD } from "../src/lib/recognizer.js";

const raw = JSON.parse(readFileSync("isl-backend/database/recordings.json", "utf-8"));
const recs = Array.isArray(raw) ? raw : raw.recordings;
const target = recs.find((r) => r.handCount === 2) || recs[0];

if (!target) {
  console.log("no 'a' recording found");
  process.exit(0);
}

console.log("template signId:", target.signId, "handCount:", target.handCount, "frames:", target.frames.length);

const lib = buildTemplateLibrary([{ ...target, source: "main" }]);

// 1. Self-match (best possible case)
const self = classifySequence(target.frames, lib, { landmarkWeight: fingertipWeighted });
console.log("SELF-MATCH  ->", self.signId, "dist", self.distance.toFixed(4), "conf", self.confidence.toFixed(4));

// 2. Cross-match every other recording against 'a' (what should NOT match)
for (const other of recs) {
  if (other === target) continue;
  const r = classifySequence(other.frames, lib, { landmarkWeight: fingertipWeighted });
  console.log(`AGAINST ${other.signId.padEnd(6)} -> dist ${r.distance.toFixed(4)} conf ${r.confidence.toFixed(4)} ${r.confidence >= CONFIDENCE_THRESHOLD ? "WOULD ACCEPT (false positive!)" : "rejected (ok)"}`);
}

// 3. Case handling check
console.log("case test: lookup 'A' vs 'a' ->", target.signId === "a" ? "ids are lowercase; see ai_pipeline upper()" : "n/a");
console.log("threshold:", CONFIDENCE_THRESHOLD);
