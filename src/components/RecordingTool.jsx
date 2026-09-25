import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useHandLandmarker } from "../hooks/useHandLandmarker";
import { CAMERA_CONSTRAINTS } from "../lib/camera";
import { normalizeSequence } from "../lib/normalize";
import { VOCABULARY, TARGET_REPS_PER_SIGN } from "../lib/vocabulary";
import { getAllWords, addCustomWord, removeCustomWord } from "../lib/customWords";
import {
  saveRecording,
  getCountsPerSign,
  exportAllRecordingsAsFile,
  importRecordingsFromFile,
  clearAllRecordings,
  deleteRecordingsForSign,
} from "../lib/recordingStorage";
import { SkeletonPlayback } from "./SkeletonPlayback";

gsap.registerPlugin(useGSAP);

const COUNTDOWN_SECONDS = 3;
const RECORDING_DURATION_MS = 2000;

// "idle" -> "countdown" -> "recording" -> "reviewing" -> back to "idle"
export function RecordingTool() {
  const rootRef = useRef(null); // scope for all GSAP selectors in this component
  const videoRef = useRef(null);
  const frameCallbackId = useRef(null);
  const recordingFramesRef = useRef([]);
  const recordingStartTimeRef = useRef(0);
  const isRecordingRef = useRef(false);
  const countdownNumberRef = useRef(null);
  const pulseDotRef = useRef(null);
  const reviewPanelRef = useRef(null);
  const importInputRef = useRef(null);

  const { handLandmarker, isLoading, loadError } = useHandLandmarker();

  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [allWords, setAllWords] = useState(() => getAllWords());
  const [selectedSignId, setSelectedSignId] = useState(VOCABULARY[0].id);
  const [mode, setMode] = useState("idle");
  const [countdownValue, setCountdownValue] = useState(null);
  const [liveHandCount, setLiveHandCount] = useState(0);
  const [pendingRecording, setPendingRecording] = useState(null); // { frames, handCounts }
  const [playToken, setPlayToken] = useState(0);
  const [counts, setCounts] = useState({});
  const [recordedBy, setRecordedBy] = useState("");
  const [conditionLabel, setConditionLabel] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [newWordLabel, setNewWordLabel] = useState("");
  const [removeWordId, setRemoveWordId] = useState("");
  const [importMessage, setImportMessage] = useState("");

  const selectedSign = allWords.find((w) => w.id === selectedSignId);

  function refreshWords() {
    setAllWords(getAllWords());
  }

  function handleAddCustomWord() {
    const label = newWordLabel.trim();
    if (!label) return;
    const created = addCustomWord(label);
    if (created) {
      refreshWords();
      setSelectedSignId(created.id);
      setNewWordLabel("");
      setSaveMessage(`Added "${created.label}" — record it just like any other sign.`);
    }
  }

  const customWords = allWords.filter((w) => w.category === "Custom");

  async function handleRemoveCustomWord() {
    if (!removeWordId) return;
    const word = customWords.find((w) => w.id === removeWordId);
    if (
      !confirm(
        `Remove "${word?.label || removeWordId}" and delete all ${
          counts[removeWordId] || 0
        } of its recordings? This cannot be undone.`
      )
    ) {
      return;
    }
    await deleteRecordingsForSign(removeWordId);
    removeCustomWord(removeWordId);
    refreshWords();
    refreshCounts();
    if (selectedSignId === removeWordId) {
      setSelectedSignId(VOCABULARY[0].id);
    }
    setRemoveWordId("");
    setSaveMessage(`Removed "${word?.label || removeWordId}".`);
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;
    try {
      const result = await importRecordingsFromFile(file);
      refreshCounts();
      setImportMessage(
        `Imported ${result.imported} recording(s)` +
          (result.skipped ? `, skipped ${result.skipped} invalid entr${result.skipped === 1 ? "y" : "ies"}.` : ".")
      );
    } catch (err) {
      setImportMessage(err.message || "Import failed.");
    }
  }

  const refreshCounts = useCallback(async () => {
    const latest = await getCountsPerSign();
    setCounts(latest);
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // --- Camera setup (same pattern as Phase 1's HandTracker) ---
  useEffect(() => {
    let stream;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraStatus("ready");
        }
      } catch (error) {
        setCameraStatus("camera-error");
        console.error("Camera access failed:", error);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // --- Live detection loop, running continuously while camera + model are ready ---
  useEffect(() => {
    if (!handLandmarker || cameraStatus !== "ready") return;

    const video = videoRef.current;

    function onFrame(nowMs) {
      if (video.readyState >= 2) {
        const result = handLandmarker.detectForVideo(video, nowMs);
        setLiveHandCount(result.landmarks.length);

        if (isRecordingRef.current) {
          // Store RAW landmarks during capture. Normalizing happens once,
          // over the whole sequence, in finishRecording() below — not here
          // per-frame. See normalize.js for why this matters: per-frame
          // normalization was erasing real hand motion (e.g. "Hello"
          // moving away from the head), since it re-centered every frame
          // around its own current wrist position.
          recordingFramesRef.current.push(result.landmarks);

          if (nowMs - recordingStartTimeRef.current >= RECORDING_DURATION_MS) {
            finishRecording();
          }
        }
      }
      frameCallbackId.current = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(onFrame)
        : requestAnimationFrame(onFrame);
    }

    frameCallbackId.current = video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback(onFrame)
      : requestAnimationFrame(onFrame);

    return () => {
      const v = videoRef.current;
      if (frameCallbackId.current && v?.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(frameCallbackId.current);
      } else if (frameCallbackId.current) {
        cancelAnimationFrame(frameCallbackId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handLandmarker, cameraStatus]);

  function startCountdown() {
    setSaveMessage("");
    setMode("countdown");
    setCountdownValue(COUNTDOWN_SECONDS);
  }

  // Each new countdown number punches in rather than just swapping text.
  // Depends on countdownValue so it re-fires for every tick (3, 2, 1).
  useGSAP(
    () => {
      if (mode !== "countdown" || countdownNumberRef.current == null) return;
      gsap.fromTo(
        countdownNumberRef.current,
        { scale: 1.6, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.35, ease: "back.out(2.5)" }
      );
    },
    { scope: rootRef, dependencies: [countdownValue, mode] }
  );

  // A custom infinite pulse for the "Recording…" indicator dot, instead of
  // Tailwind's generic animate-pulse. useGSAP automatically kills this
  // tween the moment mode changes away from "recording" (or on unmount),
  // since it reverts everything created in the previous run before the
  // effect body runs again.
  useGSAP(
    () => {
      if (mode !== "recording" || !pulseDotRef.current) return;
      gsap.to(pulseDotRef.current, {
        scale: 1.6,
        autoAlpha: 0.35,
        duration: 0.55,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    },
    { scope: rootRef, dependencies: [mode] }
  );

  // The review panel settles in the moment a recording finishes, rather
  // than just popping into existence.
  useGSAP(
    () => {
      if (mode !== "reviewing" || !reviewPanelRef.current) return;
      gsap.from(reviewPanelRef.current, {
        autoAlpha: 0,
        y: 16,
        scale: 0.97,
        duration: 0.4,
        ease: "power2.out",
      });
    },
    { scope: rootRef, dependencies: [mode] }
  );

  useEffect(() => {
    if (mode !== "countdown" || countdownValue === null) return;

    if (countdownValue === 0) {
      beginRecording();
      return;
    }

    const timeoutId = setTimeout(() => {
      setCountdownValue((v) => v - 1);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [mode, countdownValue]);

  function beginRecording() {
    recordingFramesRef.current = [];
    recordingStartTimeRef.current = performance.now();
    isRecordingRef.current = true;
    setMode("recording");
  }

  function finishRecording() {
    isRecordingRef.current = false;
    const rawFrames = recordingFramesRef.current;
    const handCountsSeen = rawFrames.map((frame) => frame.length);
    const normalizedFrames = normalizeSequence(rawFrames);
    setPendingRecording({ frames: normalizedFrames, handCounts: handCountsSeen });
    setPlayToken((t) => t + 1);
    setMode("reviewing");
  }

  async function keepRecording() {
    if (!pendingRecording) return;

    await saveRecording({
      signId: selectedSignId,
      recordedBy: recordedBy.trim() || "Unknown",
      conditionLabel: conditionLabel.trim() || "unspecified",
      handCount: majorityHandCount(pendingRecording.handCounts),
      frames: pendingRecording.frames,
      recordedAt: Date.now(),
    });

    setPendingRecording(null);
    setMode("idle");
    setSaveMessage(`Saved. ${selectedSign.label} now has ${(counts[selectedSignId] || 0) + 1} recording(s).`);
    refreshCounts();
  }

  function discardRecording() {
    setPendingRecording(null);
    setMode("idle");
    setSaveMessage("Discarded — try that one again.");
  }

  // Returns the most common hand count seen across the recording, which
  // is a more reliable signal than just checking the very last frame (a
  // single frame could have had a momentary dropout).
  function majorityHandCount(handCountsSeen) {
    const totals = {};
    for (const count of handCountsSeen) {
      totals[count] = (totals[count] || 0) + 1;
    }
    let best = 0;
    let bestCount = -1;
    for (const [count, total] of Object.entries(totals)) {
      if (total > bestCount) {
        bestCount = total;
        best = Number(count);
      }
    }
    return best;
  }

  const currentCount = counts[selectedSignId] || 0;
  const progressComplete = currentCount >= TARGET_REPS_PER_SIGN;

  // Warn before recording if the currently visible hand count doesn't
  // match what this specific sign needs. This is checked live, using the
  // continuously-running detection loop above, so the warning is accurate
  // right up to the moment "Start Recording" is pressed.
  const expectedHands = selectedSign.twoHanded ? 2 : 1;
  const handCountMismatch =
    mode === "idle" && cameraStatus === "ready" && liveHandCount !== expectedHands;

  return (
    <div ref={rootRef} className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: camera + controls */}
        <div className="flex flex-col gap-4">
          <div className="relative w-full aspect-video bg-white/[0.03] rounded-lg overflow-hidden border border-white/10">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover -scale-x-100"
            />

            {mode === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span
                  ref={countdownNumberRef}
                  className="text-6xl font-bold text-[#FF4D6D]"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {countdownValue}
                </span>
              </div>
            )}

            {mode === "recording" && (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-md bg-black/60 px-3 py-1">
                <span ref={pulseDotRef} className="w-2 h-2 rounded-full bg-[#FF4D6D]" />
                <span className="text-xs font-mono text-[#FF4D6D]">Recording…</span>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="text-sm text-slate-400">Loading hand tracking model…</div>
          )}
          {loadError && (
            <div className="text-sm text-rose-300">{loadError}</div>
          )}

          {handCountMismatch && (
            <div className="rounded-md border border-amber-500 bg-amber-950 px-4 py-2 text-sm text-amber-200">
              "{selectedSign.label}" needs {expectedHands === 2 ? "both hands" : "one hand"} visible —
              currently seeing {liveHandCount}. Adjust before recording.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startCountdown}
              disabled={mode !== "idle" || isLoading || cameraStatus !== "ready"}
              className="rounded-md bg-[#FF4D6D] px-5 py-2 font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Recording
            </button>

            <input
              type="text"
              placeholder="Recorded by (name)"
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              className="rounded-md bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />

            <input
              type="text"
              placeholder="Batch label (e.g. daylight, lamp, angled-left)"
              value={conditionLabel}
              onChange={(e) => setConditionLabel(e.target.value)}
              className="rounded-md bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>

          <p className="text-xs text-slate-500">
            Tip: set the batch label once per lighting/angle setup, then
            record all 25 signs through before changing it — much less
            tedious than switching per sign.
          </p>

          {saveMessage && (
            <div className="text-sm text-[#2DE2E6]">{saveMessage}</div>
          )}
        </div>

        {/* Right: sign picker + review */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Add a custom word
            </label>
            <p className="text-xs text-slate-500">
              For things with no fixed ISL sign — like your own name. Works
              immediately, no retraining needed.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newWordLabel}
                onChange={(e) => setNewWordLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomWord()}
                placeholder="Type a name or word to add"
                className="flex-1 rounded-md bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
              />
              <button
                onClick={handleAddCustomWord}
                className="rounded-md bg-[#2DE2E6] px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Add
              </button>
            </div>

            {customWords.length > 0 && (
              <div className="flex gap-2 mt-1">
                <select
                  value={removeWordId}
                  onChange={(e) => setRemoveWordId(e.target.value)}
                  className="flex-1 rounded-md bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">Remove a custom word…</option>
                  {customWords.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleRemoveCustomWord}
                  disabled={!removeWordId}
                  className="rounded-md border border-rose-800 bg-rose-950 px-4 py-2 text-sm text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <SignPicker
            words={allWords}
            selectedSignId={selectedSignId}
            onSelect={(id) => {
              setSelectedSignId(id);
              setSaveMessage("");
            }}
            counts={counts}
          />

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">{selectedSign.label}</span>
              <span
                className={`text-sm font-mono ${
                  progressComplete ? "text-[#FFB627]" : "text-slate-400"
                }`}
              >
                {progressComplete
                  ? `✓ ${currentCount} recorded`
                  : `${currentCount} / ${TARGET_REPS_PER_SIGN}`}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {selectedSign.twoHanded ? "Two-handed sign" : "One-handed sign"}
            </span>
            {currentCount > 0 && (
              <button
                onClick={async () => {
                  if (
                    confirm(
                      `Delete all ${currentCount} existing recordings for "${selectedSign.label}"? This cannot be undone.`
                    )
                  ) {
                    await deleteRecordingsForSign(selectedSignId);
                    refreshCounts();
                    setSaveMessage(`Cleared all recordings for ${selectedSign.label} — record fresh ones now.`);
                  }
                }}
                className="mt-1 self-start rounded-md border border-rose-800 bg-rose-950 px-3 py-1 text-xs text-rose-300"
              >
                Clear recordings for this sign
              </button>
            )}
          </div>

          {mode === "reviewing" && pendingRecording && (
            <div ref={reviewPanelRef} className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <span className="text-sm text-slate-300">Review this recording:</span>
              <SkeletonPlayback frames={pendingRecording.frames} isPlaying={true} playToken={playToken} />
              <div className="flex gap-3">
                <button
                  onClick={(e) => {
                    gsap.fromTo(
                      e.currentTarget,
                      { scale: 0.9 },
                      { scale: 1, duration: 0.25, ease: "back.out(3)" }
                    );
                    setPlayToken((t) => t + 1);
                  }}
                  className="rounded-md bg-white/10 hover:bg-white/15 transition-colors px-4 py-2 font-semibold text-slate-200"
                >
                  ↻ Replay
                </button>
                <button
                  onClick={keepRecording}
                  className="rounded-md bg-[#2DE2E6] px-4 py-2 font-semibold text-slate-900"
                >
                  Keep
                </button>
                <button
                  onClick={discardRecording}
                  className="rounded-md bg-white/10 hover:bg-white/15 transition-colors px-4 py-2 font-semibold text-slate-200"
                >
                  Discard & Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <OverallProgress counts={counts} words={allWords} />

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <button
            onClick={exportAllRecordingsAsFile}
            className="rounded-md bg-black/40 border border-white/10 px-4 py-2 text-sm text-slate-200"
          >
            Export all recordings (.json)
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="rounded-md bg-black/40 border border-white/10 px-4 py-2 text-sm text-slate-200"
          >
            Import recordings (.json)
          </button>
          <button
            onClick={async () => {
              if (confirm("This deletes ALL recorded data permanently. Are you sure?")) {
                await clearAllRecordings();
                refreshCounts();
                setSaveMessage("All recordings cleared.");
              }
            }}
            className="rounded-md bg-rose-950 border border-rose-700 px-4 py-2 text-sm text-rose-200"
          >
            Clear all recordings
          </button>
        </div>
        {importMessage && <p className="text-sm text-[#2DE2E6]">{importMessage}</p>}
      </div>
    </div>
  );
}

function SignPicker({ words, selectedSignId, onSelect, counts }) {
  const categories = [];
  const seen = new Set();
  for (const word of words) {
    if (!seen.has(word.category)) {
      seen.add(word.category);
      categories.push(word.category);
    }
  }
  const pickerRef = useRef(null);

  const { contextSafe } = useGSAP({ scope: pickerRef });

  const handleSelect = contextSafe((event, wordId) => {
    gsap.fromTo(
      event.currentTarget,
      { scale: 0.92 },
      { scale: 1, duration: 0.3, ease: "back.out(3)" }
    );
    onSelect(wordId);
  });

  return (
    <div ref={pickerRef} className="rounded-lg border border-white/10 bg-white/[0.03] p-4 max-h-80 overflow-y-auto">
      {categories.map((category) => (
        <div key={category} className="mb-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            {category}
          </div>
          <div className="flex flex-wrap gap-2">
            {words.filter((w) => w.category === category).map((word) => {
              const count = counts[word.id] || 0;
              const complete = count >= TARGET_REPS_PER_SIGN;
              const isSelected = word.id === selectedSignId;
              return (
                <button
                  key={word.id}
                  onClick={(e) => handleSelect(e, word.id)}
                  className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                    isSelected
                      ? "bg-[#FF4D6D] border-[#FF4D6D] text-white"
                      : complete
                      ? "bg-black/40 border-[#FFB627]/50 text-[#FFB627]"
                      : "bg-black/40 border-white/10 text-slate-300"
                  }`}
                >
                  {word.label} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function OverallProgress({ counts, words }) {
  const barFillRef = useRef(null);
  const totalTarget = words.length * TARGET_REPS_PER_SIGN;
  const totalDone = words.reduce(
    (sum, word) => sum + Math.min(counts[word.id] || 0, TARGET_REPS_PER_SIGN),
    0
  );
  const completedSigns = words.filter(
    (word) => (counts[word.id] || 0) >= TARGET_REPS_PER_SIGN
  ).length;
  const percent = totalTarget > 0 ? (totalDone / totalTarget) * 100 : 0;

  // Smoothly glides to the new fill amount whenever the recording count
  // changes, rather than snapping instantly.
  useGSAP(() => {
    if (!barFillRef.current) return;
    gsap.to(barFillRef.current, {
      width: `${percent}%`,
      duration: 0.5,
      ease: "power2.out",
    });
  }, [percent]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex justify-between text-sm text-slate-300 mb-2">
        <span>
          Overall progress: {completedSigns} / {words.length} signs complete
        </span>
        <span className="font-mono text-slate-400">
          {totalDone} / {totalTarget} recordings
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
        <div ref={barFillRef} className="h-full bg-[#2DE2E6]" style={{ width: 0 }} />
      </div>
    </div>
  );
}
