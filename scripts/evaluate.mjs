// Optimized evaluation: precompute the full pairwise DTW distance matrix
// ONCE per hand-count bucket (since DTW distance is symmetric, this only
// needs the upper triangle — half the work of the naive approach), then
// reuse that matrix to cheaply test many different K values without
// recomputing DTW each time. Only band width and landmark weighting
// actually require a fresh matrix.
import { readFileSync, writeFileSync } from "fs";
import { dtwDistance } from "../src/lib/dtw.js";
import { fingertipWeighted, uniformWeight } from "../src/lib/recognizer.js";

const DATA_PATH = process.argv[2] || "/mnt/user-data/uploads/isl-recordings-export-2026-07-23.json";
const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
const recordings = raw.recordings;
console.log(`Loaded ${recordings.length} recordings.\n`);

// --- Flag signs with inconsistent hand-count capture ---
console.log("=== Hand-count consistency check ===");
const byBucket = { 1: [], 2: [] };
for (const r of recordings) {
  if (byBucket[r.handCount]) byBucket[r.handCount].push(r);
}
const handCountsBySign = {};
for (const r of recordings) {
  handCountsBySign[r.signId] = handCountsBySign[r.signId] || {};
  handCountsBySign[r.signId][r.handCount] = (handCountsBySign[r.signId][r.handCount] || 0) + 1;
}
let anyMixed = false;
for (const [signId, counts] of Object.entries(handCountsBySign)) {
  if (Object.keys(counts).length > 1) {
    anyMixed = true;
    console.log(`  MIXED: ${signId} — ${JSON.stringify(counts)} (these split into separate, non-competing pools)`);
  }
}
if (!anyMixed) console.log("  None — every sign captured with a consistent hand count.");
console.log(`\n1-hand bucket size: ${byBucket[1].length}, 2-hand bucket size: ${byBucket[2].length}\n`);

function buildMatrix(bucket, options) {
  const n = bucket.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dtwDistance(bucket[i].frames, bucket[j].frames, options);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

function evaluateWithMatrix(bucket, matrix, k) {
  let correct = 0;
  const confusion = {};
  const perSign = {};
  const confWhenCorrect = [];
  const confWhenWrong = [];
  const wrongWinCounts = new Array(bucket.length).fill(0); // "problematic template" tally

  for (let i = 0; i < bucket.length; i++) {
    const trueSign = bucket[i].signId;
    const dists = [];
    for (let j = 0; j < bucket.length; j++) {
      if (j === i) continue;
      dists.push({ idx: j, signId: bucket[j].signId, distance: matrix[i][j] });
    }
    dists.sort((a, b) => a.distance - b.distance);
    const nearestK = dists.slice(0, k);

    const scores = {};
    for (const { signId, distance } of nearestK) {
      scores[signId] = (scores[signId] || 0) + 1 / (distance + 0.05);
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const predicted = ranked[0][0];
    const winningEntry = nearestK.find((n) => n.signId === predicted);
    const confidence = 1 / (1 + winningEntry.distance / 0.6);

    const isCorrect = predicted === trueSign;
    if (isCorrect) correct++;
    (isCorrect ? confWhenCorrect : confWhenWrong).push(confidence);

    if (!isCorrect) {
      // The single nearest template is the one most "responsible" for
      // this wrong answer — tally it as a problematic template.
      wrongWinCounts[nearestK[0].idx]++;
    }

    confusion[trueSign] = confusion[trueSign] || {};
    confusion[trueSign][predicted] = (confusion[trueSign][predicted] || 0) + 1;
    perSign[trueSign] = perSign[trueSign] || { correct: 0, total: 0 };
    perSign[trueSign].total++;
    if (isCorrect) perSign[trueSign].correct++;
  }

  return {
    accuracy: correct / bucket.length,
    correct,
    total: bucket.length,
    confusion,
    perSign,
    confWhenCorrect,
    confWhenWrong,
    wrongWinCounts,
  };
}

function mergeResults(resultA, resultB) {
  const totalCorrect = resultA.correct + resultB.correct;
  const totalCount = resultA.total + resultB.total;
  const perSign = { ...resultA.perSign };
  for (const [sign, stats] of Object.entries(resultB.perSign)) {
    if (perSign[sign]) {
      perSign[sign] = { correct: perSign[sign].correct + stats.correct, total: perSign[sign].total + stats.total };
    } else {
      perSign[sign] = stats;
    }
  }
  const confusion = { ...resultA.confusion };
  for (const [trueSign, preds] of Object.entries(resultB.confusion)) {
    confusion[trueSign] = confusion[trueSign] || {};
    for (const [predSign, count] of Object.entries(preds)) {
      confusion[trueSign][predSign] = (confusion[trueSign][predSign] || 0) + count;
    }
  }
  return {
    accuracy: totalCorrect / totalCount,
    correct: totalCorrect,
    total: totalCount,
    perSign,
    confusion,
    confWhenCorrect: [...resultA.confWhenCorrect, ...resultB.confWhenCorrect],
    confWhenWrong: [...resultA.confWhenWrong, ...resultB.confWhenWrong],
  };
}

// --- Step 1: band-width sweep (fingertip weighting, k=1) to find the best band ---
console.log("=== Band width sweep (fingertip weighting, k=1) ===");
const bandFractions = [0.15, 0.20, 0.25, 0.30, 0.35];
let bestBand = null;
let bestBandAccuracy = -1;
const matricesByBand = {}; // cache so we don't recompute for the final chosen band

for (const bandFraction of bandFractions) {
  const options = { landmarkWeight: fingertipWeighted, bandFraction };
  const matrix1 = buildMatrix(byBucket[1], options);
  const matrix2 = byBucket[2].length > 1 ? buildMatrix(byBucket[2], options) : null;

  const result1 = evaluateWithMatrix(byBucket[1], matrix1, 1);
  const result2 = matrix2 ? evaluateWithMatrix(byBucket[2], matrix2, 1) : { accuracy: 1, correct: 0, total: 0, perSign: {}, confusion: {}, confWhenCorrect: [], confWhenWrong: [] };
  const merged = mergeResults(result1, result2);

  console.log(`  band=${bandFraction}: accuracy=${(merged.accuracy * 100).toFixed(1)}%`);
  matricesByBand[bandFraction] = { matrix1, matrix2 };

  if (merged.accuracy > bestBandAccuracy) {
    bestBandAccuracy = merged.accuracy;
    bestBand = bandFraction;
  }
}
console.log(`  => best band: ${bestBand}\n`);

// --- Step 2: K sweep at the best band width (cheap — reuses cached matrices) ---
console.log("=== K sweep (at best band width) ===");
const kValues = [1, 3, 5, 7, 9];
let bestK = 1;
let bestKAccuracy = -1;
const { matrix1: finalMatrix1, matrix2: finalMatrix2 } = matricesByBand[bestBand];

for (const k of kValues) {
  const result1 = evaluateWithMatrix(byBucket[1], finalMatrix1, k);
  const result2 = finalMatrix2 ? evaluateWithMatrix(byBucket[2], finalMatrix2, Math.min(k, byBucket[2].length - 1)) : { accuracy: 1, correct: 0, total: 0, perSign: {}, confusion: {}, confWhenCorrect: [], confWhenWrong: [] };
  const merged = mergeResults(result1, result2);
  console.log(`  k=${k}: accuracy=${(merged.accuracy * 100).toFixed(1)}%`);
  if (merged.accuracy > bestKAccuracy) {
    bestKAccuracy = merged.accuracy;
    bestK = k;
  }
}
console.log(`  => best k: ${bestK}\n`);

// --- Final report using the best (band, k) combination ---
const finalResult1 = evaluateWithMatrix(byBucket[1], finalMatrix1, bestK);
const finalResult2 = finalMatrix2 ? evaluateWithMatrix(byBucket[2], finalMatrix2, Math.min(bestK, byBucket[2].length - 1)) : { accuracy: 1, correct: 0, total: 0, perSign: {}, confusion: {}, confWhenCorrect: [], confWhenWrong: [], wrongWinCounts: [] };
const finalMerged = mergeResults(finalResult1, finalResult2);

console.log(`=== FINAL: band=${bestBand}, k=${bestK} ===`);
console.log(`Overall accuracy: ${(finalMerged.accuracy * 100).toFixed(1)}% (${finalMerged.correct}/${finalMerged.total})\n`);

console.log("=== Per-sign accuracy ===");
const perSignSorted = Object.entries(finalMerged.perSign).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
for (const [signId, stats] of perSignSorted) {
  const pct = ((stats.correct / stats.total) * 100).toFixed(0);
  console.log(`  ${signId.padEnd(14)} ${stats.correct}/${stats.total}  (${pct}%)`);
}

console.log("\n=== Confusion pairs (true -> predicted) ===");
for (const [trueSign, predictions] of Object.entries(finalMerged.confusion)) {
  for (const [predictedSign, count] of Object.entries(predictions)) {
    if (predictedSign !== trueSign) console.log(`  ${trueSign} -> ${predictedSign}: ${count}`);
  }
}

// --- Problematic individual templates (1-hand bucket, using k=1 diagnostic) ---
console.log("\n=== Individual recordings most often responsible for a wrong answer (1-hand bucket) ===");
const diag1 = evaluateWithMatrix(byBucket[1], finalMatrix1, 1);
const worstOffenders = diag1.wrongWinCounts
  .map((count, idx) => ({ idx, count, signId: byBucket[1][idx].signId, recordingId: byBucket[1][idx].id }))
  .filter((o) => o.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);
for (const o of worstOffenders) {
  console.log(`  recording id=${o.recordingId} (sign: ${o.signId}) caused ${o.count} wrong answer(s) elsewhere`);
}

// --- Confidence threshold suggestion ---
function stats(arr) {
  if (arr.length === 0) return { mean: 0, min: 0, max: 0 };
  return { mean: arr.reduce((a, b) => a + b, 0) / arr.length, min: Math.min(...arr), max: Math.max(...arr) };
}
const cStats = stats(finalMerged.confWhenCorrect);
const wStats = stats(finalMerged.confWhenWrong);
console.log("\n=== Confidence distribution ===");
console.log(`  CORRECT: mean=${cStats.mean.toFixed(3)}, min=${cStats.min.toFixed(3)}, max=${cStats.max.toFixed(3)}`);
console.log(`  WRONG:   mean=${wStats.mean.toFixed(3)}, min=${wStats.min.toFixed(3)}, max=${wStats.max.toFixed(3)}`);

let bestThreshold = 0;
let bestJ = -Infinity;
for (let t = 0; t <= 1; t += 0.02) {
  const tpr = finalMerged.confWhenCorrect.filter((c) => c >= t).length / finalMerged.confWhenCorrect.length;
  const fpr = finalMerged.confWhenWrong.filter((c) => c >= t).length / (finalMerged.confWhenWrong.length || 1);
  const J = tpr - fpr;
  if (J > bestJ) { bestJ = J; bestThreshold = t; }
}
console.log(`\nSuggested confidence threshold: ${bestThreshold.toFixed(2)}`);

writeFileSync(
  "/home/claude/isl-interpreter/evaluation-results.json",
  JSON.stringify({ bestBand, bestK, accuracy: finalMerged.accuracy, perSign: finalMerged.perSign, confusion: finalMerged.confusion, suggestedThreshold: bestThreshold, mixedHandCountSigns: Object.entries(handCountsBySign).filter(([, c]) => Object.keys(c).length > 1).map(([s]) => s) }, null, 2)
);
console.log("\nFull results written to evaluation-results.json");
