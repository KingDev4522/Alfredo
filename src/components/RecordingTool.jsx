import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawingUtils, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { usePoseHandTracker } from "../hooks/usePoseHandTracker";
import { CAMERA_CONSTRAINTS } from "../lib/camera";
import { handColorFor, BODY_COLOR } from "../lib/handColors";
import { normalizeSequence } from "../lib/normalize";
import { VOCABULARY, TARGET_REPS_PER_SIGN } from "../lib/vocabulary";
import { getAllWords, addCustomWord, removeCustomWord, syncCustomWordsWithDatabase } from "../lib/customWords";
import {
  saveRecording,
  saveToLegacyFile,
  syncLegacyFileToMain,
  syncSupabaseToLegacyFile,
  getCountsPerSign,
  getCountsSplit,
  exportAllRecordingsAsFile,
  importRecordingsFromFile,
  clearAllRecordings,
  deleteRecordingsForSign,
} from "../lib/recordingStorage";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { SkeletonPlayback } from "./SkeletonPlayback";
import { PublishModal } from "./PublishModal";

gsap.registerPlugin(useGSAP);

const COUNTDOWN_SECONDS = 3;
const RECORDING_DURATION_MS = 2000;

// "idle" -> "countdown" -> "recording" -> "reviewing" -> back to "idle"
export function RecordingTool() {
  const rootRef = useRef(null); // scope for all GSAP selectors in this component
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameCallbackId = useRef(null);
  const recordingFramesRef = useRef([]);
  const recordingStartTimeRef = useRef(0);
  const isRecordingRef = useRef(false);
  const countdownNumberRef = useRef(null);
  const pulseDotRef = useRef(null);
  const reviewPanelRef = useRef(null);
  const importInputRef = useRef(null);

  const { poseLandmarker, handLandmarker, isLoading, loadError } = usePoseHandTracker();

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
  // PRD 02 v2 §5.4 - admin publish target + double-confirm modal.
  // Locked rule: the admin account always defaults to Shared Main; every other
  // account always saves to its own space (no toggle rendered for non-admins).
  const { isAdmin } = useAuth();
  const [saveTarget, setSaveTarget] = useState("mine"); // 'mine' | 'main' (admin only)
  const [showPublish, setShowPublish] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [splitCounts, setSplitCounts] = useState({ shared: {}, mine: {} });

  useEffect(() => {
    if (isAdmin) setSaveTarget("main");
    else setSaveTarget("mine");
  }, [isAdmin]);

  const selectedSign = allWords.find((w) => w.id === selectedSignId) ?? VOCABULARY[0];

  async function refreshWords(isMounted = () => true) {
    const success = await syncCustomWordsWithDatabase();
    if (isMounted()) {
      if (!success) {
        setSaveMessage("Warning: Failed to sync words with backend database.");
      }
      setAllWords(getAllWords());
    }
  }

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await refreshWords(() => mounted);
      } catch (err) {
        console.warn("Backend sync failed, continuing offline:", err);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  function handleAddCustomWord() {
    const label = newWordLabel.trim();
    if (!label) return;
    const created = addCustomWord(label);
    if (created) {
      // addCustomWord already wrote to localStorage synchronously, so refresh
      // the word list NOW. Selecting the new id before the list contains it
      // makes selectedSign undefined and crashes the render (black screen).
      setAllWords(getAllWords());
      setSelectedSignId(created.id);
      setNewWordLabel("");
      setSaveMessage(`Added "${created.label}". Record it just like any other sign.`);
      refreshWords();
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
    // Admin importing while targeting Shared Main lands in Main (with confirm).
    const target = isAdmin && saveTarget === "main" ? "main" : "mine";
    if (target === "main" && !confirm("Import this file into the shared Main database (visible to everyone)?")) {
      return;
    }
    try {
      const result = await importRecordingsFromFile(file, target);
      await refreshWords();
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
    try {
      const latest = await getCountsPerSign();
      setCounts(latest);
      if (isSupabaseConfigured) {
        setSplitCounts(await getCountsSplit());
      }
    } catch (err) {
      console.warn("Backend count fetch failed:", err);
    }
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
    if (!poseLandmarker || !handLandmarker || cameraStatus !== "ready") return;

    const video = videoRef.current;

    function scheduleNext() {
      frameCallbackId.current = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(onFrame)
        : requestAnimationFrame(onFrame);
    }

    function onFrame(nowMs) {
      if (video.readyState >= 2) {
        let poseResult;
        let handResult;
        try {
          poseResult = poseLandmarker.detectForVideo(video, nowMs);
          handResult = handLandmarker.detectForVideo(video, nowMs);
        } catch (err) {
          // Landmarker closed mid-frame during tab switch/unmount - stop this
          // loop quietly instead of throwing an uncaught WASM Aborted().
          console.warn("detectForVideo failed, stopping frame loop:", err?.message || err);
          return;
        }

        // Bail out when values are unchanged - otherwise this 30-60fps loop
        // re-renders RecordingTool (and the PublishModal child) every frame,
        // which used to wipe the modal's typed text and yank focus.
        const nextHandCount = handResult.landmarks.length;
        setLiveHandCount((prev) => (prev === nextHandCount ? prev : nextHandCount));

        let leftHand = null;
        let rightHand = null;
        handResult.handednesses.forEach((h, i) => {
          if (h[0].categoryName === "Left") leftHand = handResult.landmarks[i];
          if (h[0].categoryName === "Right") rightHand = handResult.landmarks[i];
        });

        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const canvasCtx = canvas.getContext("2d");
          const drawingUtils = new DrawingUtils(canvasCtx);

          canvasCtx.save();
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (poseResult.landmarks && poseResult.landmarks.length > 0) {
            const body = poseResult.landmarks[0];
            canvasCtx.strokeStyle = BODY_COLOR;
            canvasCtx.lineWidth = 4;
            
            const toPixel = (landmark) => ({
              x: landmark.x * canvas.width,
              y: landmark.y * canvas.height
            });

            const drawLine = (p1, p2) => {
              if (!p1 || !p2) return;
              const px1 = toPixel(p1);
              const px2 = toPixel(p2);
              canvasCtx.beginPath();
              canvasCtx.moveTo(px1.x, px1.y);
              canvasCtx.lineTo(px2.x, px2.y);
              canvasCtx.stroke();
            };

            // Shoulders
            drawLine(body[11], body[12]);
            // Left arm
            drawLine(body[11], body[13]);
            drawLine(body[13], leftHand ? leftHand[0] : body[15]);
            // Right arm
            drawLine(body[12], body[14]);
            drawLine(body[14], rightHand ? rightHand[0] : body[16]);

            // Draw joints
            canvasCtx.fillStyle = BODY_COLOR;
            [11, 12, 13, 14].forEach(idx => {
              if (body[idx]) {
                const px = toPixel(body[idx]);
                canvasCtx.beginPath();
                canvasCtx.arc(px.x, px.y, 4, 0, 2 * Math.PI);
                canvasCtx.fill();
              }
            });
            if (!leftHand && body[15]) {
              const px = toPixel(body[15]);
              canvasCtx.beginPath();
              canvasCtx.arc(px.x, px.y, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            }
            if (!rightHand && body[16]) {
              const px = toPixel(body[16]);
              canvasCtx.beginPath();
              canvasCtx.arc(px.x, px.y, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            }
          }

          handResult.landmarks.forEach((landmarks, idx) => {
            const category = handResult.handednesses[idx][0].categoryName;
            const handColor = handColorFor(category);

            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: handColor,
              lineWidth: 3,
            });
            drawingUtils.drawLandmarks(landmarks, { color: handColor, lineWidth: 1, radius: 4 });
          });
          canvasCtx.restore();
        }

        if (isRecordingRef.current) {
          // Store RAW landmarks during capture. Normalizing happens once,
          // over the whole sequence, in finishRecording() below.
          recordingFramesRef.current.push({
            body: {
              left_shoulder:  poseResult.landmarks[0]?.[11] || null,
              left_elbow:     poseResult.landmarks[0]?.[13] || null,
              left_wrist:     poseResult.landmarks[0]?.[15] || null,
              right_shoulder: poseResult.landmarks[0]?.[12] || null,
              right_elbow:    poseResult.landmarks[0]?.[14] || null,
              right_wrist:    poseResult.landmarks[0]?.[16] || null,
            },
            left_hand: leftHand,
            right_hand: rightHand
          });

          if (nowMs - recordingStartTimeRef.current >= RECORDING_DURATION_MS) {
            finishRecording();
          }
        }
      }
      scheduleNext();
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
  }, [poseLandmarker, handLandmarker, cameraStatus]);

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
    
    const handCountsSeen = rawFrames.map((frame) => {
      let count = 0;
      if (frame.left_hand && frame.left_hand.length > 0) count++;
      if (frame.right_hand && frame.right_hand.length > 0) count++;
      return count;
    });

    const result = normalizeSequence(rawFrames);
    
    if (!result.normalized) {
      setSaveMessage("Discarded: Shoulders not visible enough to anchor the recording.");
      setMode("idle");
      return;
    }

    setPendingRecording({ frames: result.frames, handCounts: handCountsSeen });
    setPlayToken((t) => t + 1);
    setMode("reviewing");
  }

  async function keepRecording() {
    if (!pendingRecording) return;

    // Admin publishing to Main requires double-confirm modal (PRD 02 v2 §5.4).
    if (isAdmin && saveTarget === "main") {
      setShowPublish(true);
      return;
    }

    await saveRecording({
      signId: selectedSignId,
      recordedBy: recordedBy.trim() || "Unknown",
      conditionLabel: conditionLabel.trim() || "unspecified",
      handCount: majorityHandCount(pendingRecording.handCounts),
      frames: pendingRecording.frames,
      recordedAt: Date.now(),
    }, "mine");

    setPendingRecording(null);
    setMode("idle");
    setSaveMessage(`Saved to My Space. ${selectedSign.label} now has ${(counts[selectedSignId] || 0) + 1} recording(s).`);
    refreshCounts();
  }

  // Stable callbacks: PublishModal must not receive a new function identity
  // on every camera-frame re-render, or its effects would re-run and clear input.
  const handleClosePublish = useCallback(() => {
    setShowPublish(false);
  }, []);

  const confirmPublishToMain = useCallback(async () => {
    if (!pendingRecording) return;
    setPublishBusy(true);
    try {
      // PRD 05 dual-write: same payload object goes to Supabase Main AND the
      // GitHub-tracked localhost file, in the identical app format.
      const payload = {
        signId: selectedSignId,
        recordedBy: recordedBy.trim() || "Unknown",
        conditionLabel: conditionLabel.trim() || "unspecified",
        handCount: majorityHandCount(pendingRecording.handCounts),
        frames: pendingRecording.frames,
        recordedAt: Date.now(),
      };
      await saveRecording(payload, "main");
      let fileNote = "";
      try {
        await saveToLegacyFile(payload);
      } catch {
        fileNote = " (localhost file unreachable. Supabase copy is safe; sync later.)";
      }
      setPendingRecording(null);
      setMode("idle");
      setShowPublish(false);
      setSaveMessage(`Published to Main and the GitHub-tracked file. Visible to all users.${fileNote}`);
      refreshCounts();
    } catch (err) {
      setSaveMessage(err.message || "Publish failed.");
    } finally {
      setPublishBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecording, selectedSignId, recordedBy, conditionLabel, refreshCounts]);

  // One-click bridge: push everything currently in the localhost file to Main.
  // For recordings made while the Supabase API was blind. Admin only.
  async function handleSyncFileToMain() {
    if (!confirm("Push ALL localhost-file recordings into the shared Main database?")) return;
    setSaveMessage("Syncing localhost file → Main…");
    try {
      const { pushed } = await syncLegacyFileToMain();
      setSaveMessage(`Synced ${pushed} recording(s) from localhost file → Main.`);
      refreshCounts();
    } catch (err) {
      setSaveMessage(err.message || "Sync failed.");
    }
  }

  // Reverse bridge: pull Supabase (Main + My Space) into the localhost file so
  // the Translate avatar can play them. Without this, words saved to My Space
  // never reach the file-derived gloss and the avatar stands still. Admin only.
  async function handleSyncSupabaseToFile() {
    if (!confirm("Pull Supabase recordings (Main + My Space) into the localhost file for the avatar?")) return;
    setSaveMessage("Syncing Supabase → localhost file…");
    try {
      const { imported, skipped } = await syncSupabaseToLegacyFile();
      setSaveMessage(
        imported === 0
          ? "Nothing new. Every Supabase sign is already in the localhost file."
          : `Synced ${imported} new sign(s) into the localhost file for the avatar.` +
            (skipped ? ` Skipped ${skipped} already present.` : "")
      );
      refreshCounts();
    } catch (err) {
      setSaveMessage(err.message || "Sync failed.");
    }
  }

  function discardRecording() {
    setPendingRecording(null);
    setMode("idle");
    setSaveMessage("Discarded. Try that one again.");
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

  const sharedCount = isSupabaseConfigured ? splitCounts.shared?.[selectedSignId] || 0 : 0;
  const personalCount = isSupabaseConfigured ? splitCounts.mine?.[selectedSignId] || 0 : counts[selectedSignId] || 0;
  const progressCount = isSupabaseConfigured ? personalCount : counts[selectedSignId] || 0;
  const progressComplete = progressCount >= TARGET_REPS_PER_SIGN;
  const deleteScopeCount = isAdmin && saveTarget === "main" ? sharedCount : personalCount;

  // Warn before recording if the currently visible hand count doesn't
  // match what this specific sign needs. This is checked live, using the
  // continuously-running detection loop above, so the warning is accurate
  // right up to the moment "Start Recording" is pressed.
  const expectedHands = selectedSign.twoHanded ? 2 : 1;
  const handCountMismatch =
    mode === "idle" && cameraStatus === "ready" && liveHandCount !== expectedHands;

  return (
    <div ref={rootRef} className="flex w-full max-w-6xl flex-col gap-6">
      <div className="cyber-recording-grid grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: camera + controls */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="cyber-camera-stage relative aspect-video w-full overflow-hidden border border-white/10 bg-white/[0.03]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover -scale-x-100"
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100" />

            {mode === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span
                  ref={countdownNumberRef}
                  className="text-6xl font-bold text-[#FFB000]"
                >
                  {countdownValue}
                </span>
              </div>
            )}

            {mode === "recording" && (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-md bg-black/60 px-3 py-1">
                <span ref={pulseDotRef} className="w-2 h-2 rounded-full bg-[#FFB000]" />
                <span className="text-xs font-mono text-[#FFB000]">Recording…</span>
              </div>
            )}

          </div>

          {isLoading && (
            <div className="text-sm text-slate-400">Loading hand tracking model…</div>
          )}
          {loadError && (
            <div className="text-sm text-[#FFB000]" role="alert">{loadError}</div>
          )}

          {handCountMismatch && (
            <div className="border border-[#FFB000] bg-black px-4 py-3 font-mono text-sm text-[#FFB000]" role="alert">
              "{selectedSign.label}" needs {expectedHands === 2 ? "both hands" : "one hand"} visible.
              Currently seeing {liveHandCount}. Adjust before recording.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startCountdown}
              disabled={mode !== "idle" || isLoading || cameraStatus !== "ready"}
              className="border border-[#FFB000] bg-[#FFB000] px-5 py-2 font-semibold text-[#050505] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Recording
            </button>

            <input
              type="text"
              aria-label="Recorded by name"
              placeholder="Recorded by (name)"
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              className="cyber-field flex-1"
            />

            <input
              type="text"
              placeholder="Batch label (e.g. daylight, lamp, angled-left)"
              value={conditionLabel}
              onChange={(e) => setConditionLabel(e.target.value)}
              className="cyber-field flex-1"
            />
          </div>

          <p className="text-xs text-slate-500">
            Tip: set the batch label once per lighting/angle setup, then
            record all 25 signs through before changing it. This is much less
            tedious than switching per sign.
          </p>

          {saveMessage && (
            <div className="text-sm text-[#C8FF00]" role="status">{saveMessage}</div>
          )}

          {isAdmin && isSupabaseConfigured && (
            <div className="flex flex-wrap items-center gap-2 border border-[#FFB000]/40 bg-black px-3 py-2">
              <span className="text-xs text-amber-200">Save to:</span>
              <button
                onClick={() => setSaveTarget("mine")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${saveTarget === "mine" ? "bg-[#55F6E5] text-slate-900" : "bg-white/10 text-slate-300"}`}
              >
                My Space
              </button>
              <button
                onClick={() => setSaveTarget("main")}
                className={`px-3 py-2 text-xs font-semibold ${saveTarget === "main" ? "bg-[#FFB000] text-[#050505]" : "bg-black text-slate-300"}`}
              >
                Shared Main
              </button>
            </div>
          )}
          {isSupabaseConfigured && !isAdmin && (
            <p className="text-xs text-slate-500">Saving to My Space. Only admins can publish to Shared Main.</p>
          )}
        </div>

        {/* Right: sign picker + review */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="cyber-panel flex flex-col gap-3 p-4">
            <label className="cyber-login__label" htmlFor="custom-word-label">
              Add a custom word
            </label>
            <p className="text-xs text-slate-500">
              For things with no fixed ISL sign, such as your own name. Works
              immediately without retraining.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                id="custom-word-label"
                type="text"
                value={newWordLabel}
                onChange={(e) => setNewWordLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomWord()}
                placeholder="Type a name or word to add"
                className="cyber-field"
              />
              <button
                onClick={handleAddCustomWord}
                className="cyber-button cyber-button--live"
              >
                Add
              </button>
            </div>

            {customWords.length > 0 && (
              <div className="flex gap-2 mt-1">
                <select
                  aria-label="Custom word to remove"
                  value={removeWordId}
                  onChange={(e) => setRemoveWordId(e.target.value)}
                  className="cyber-field"
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
                  className="cyber-button cyber-button--danger disabled:cursor-not-allowed disabled:opacity-40"
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
            splitCounts={splitCounts}
            isSupabaseConfigured={isSupabaseConfigured}
          />

          <div className="cyber-panel flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">{selectedSign.label}</span>
              <span
                className={`text-sm font-mono ${
                  progressComplete ? "text-[#C8FF00]" : "text-slate-400"
                }`}
              >
                {progressComplete
                  ? `${progressCount} personal reps complete`
                  : `${progressCount} / ${TARGET_REPS_PER_SIGN} personal reps`}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {selectedSign.twoHanded ? "Two-handed sign" : "One-handed sign"}
              {isSupabaseConfigured && (
                <span className="ml-2 font-mono">
                  ({splitCounts.shared?.[selectedSignId] || 0} shared + {splitCounts.mine?.[selectedSignId] || 0} yours)
                </span>
              )}
            </span>
            {deleteScopeCount > 0 && (
              <button
                onClick={async () => {
                  const mainTarget = isAdmin && saveTarget === "main";
                  const targetCount = deleteScopeCount;
                  if (
                    confirm(
                      mainTarget
                        ? `Delete all ${targetCount} SHARED recordings for "${selectedSign.label}"? Everyone loses them and the file mirror changes too.`
                        : `Delete all ${targetCount} of YOUR recordings for "${selectedSign.label}"? Shared signs stay untouched.`
                    )
                  ) {
                    try {
                      await deleteRecordingsForSign(selectedSignId, mainTarget ? "main" : "mine");
                      refreshCounts();
                      setSaveMessage(`Cleared ${mainTarget ? "shared" : "your"} recordings for ${selectedSign.label}. Record fresh ones now.`);
                    } catch (err) {
                      setSaveMessage(err.message || "Clear failed.");
                    }
                  }
                }}
                className="cyber-button cyber-button--danger mt-1 self-start"
              >
                Clear recordings for this sign
              </button>
            )}
          </div>

          {mode === "reviewing" && pendingRecording && (
            <div ref={reviewPanelRef} className="cyber-panel flex flex-col items-center gap-3 p-4">
              <span className="cyber-page__eyebrow self-start !mb-0">Review take</span>
              <SkeletonPlayback frames={pendingRecording.frames} isPlaying={true} playToken={playToken} />
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={(e) => {
                    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                      gsap.fromTo(
                        e.currentTarget,
                        { scale: 0.9 },
                        { scale: 1, duration: 0.25, ease: "back.out(3)" },
                      );
                    }
                    setPlayToken((t) => t + 1);
                  }}
                  className="cyber-button"
                >
                  Replay
                </button>
                <button
                  onClick={keepRecording}
                  className="cyber-button cyber-button--complete"
                >
                  {isAdmin && saveTarget === "main" ? "Publish to Everyone" : "Keep"}
                </button>
                <button
                  onClick={discardRecording}
                  className="cyber-button"
                >
                  Discard & Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <OverallProgress
        counts={counts}
        words={allWords}
        splitCounts={splitCounts}
        isSupabaseConfigured={isSupabaseConfigured}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportAllRecordingsAsFile}
            className="cyber-button"
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
            className="cyber-button"
          >
            Import recordings (.json)
          </button>
          {isAdmin && isSupabaseConfigured && (
            <button
              onClick={handleSyncFileToMain}
              title="Push everything in the localhost GitHub-tracked file into Supabase Main (for recordings made while the API was blind)"
              className="cyber-button cyber-button--primary"
            >
              Sync localhost file → Main
            </button>
          )}
          {isSupabaseConfigured && (
            <button
              onClick={handleSyncSupabaseToFile}
              title="Pull Supabase Main + My Space recordings into the localhost file so the Translate avatar can play them"
              className="cyber-button cyber-button--primary"
            >
              Sync Supabase → localhost file
            </button>
          )}
          <button
            onClick={async () => {
              const scope = isSupabaseConfigured
                ? "all of YOUR recordings (shared Main signs and the localhost file are untouched)"
                : "ALL recorded data in the localhost file";
              if (confirm(`This deletes ${scope} permanently. Are you sure?`)) {
                try {
                  await clearAllRecordings();
                  refreshCounts();
                  setSaveMessage("Cleared.");
                } catch (err) {
                  setSaveMessage(err.message || "Clear failed.");
                }
              }
            }}
            className="cyber-button cyber-button--danger"
          >
            Clear all recordings
          </button>
        </div>
        {importMessage && <p className="text-sm text-[#C8FF00]" role="status">{importMessage}</p>}
      </div>

      <PublishModal
        open={showPublish}
        signLabel={selectedSign?.label || selectedSignId}
        count={1}
        busy={publishBusy}
        onCancel={handleClosePublish}
        onConfirm={confirmPublishToMain}
      />
    </div>
  );
}

function SignPicker({
  words,
  selectedSignId,
  onSelect,
  counts,
  splitCounts,
  isSupabaseConfigured,
}) {
  const categories = [...new Set(words.map((word) => word.category))];

  return (
    <section className="cyber-panel max-h-96 overflow-y-auto p-4" aria-label="Sign picker">
      {categories.map((category) => (
        <div key={category} className="mb-5 last:mb-0">
          <div className="cyber-login__label mb-2">{category}</div>
          <div className="flex flex-wrap gap-2">
            {words
              .filter((word) => word.category === category)
              .map((word) => {
                const totalCount = counts[word.id] || 0;
                const shared = isSupabaseConfigured ? splitCounts.shared?.[word.id] || 0 : 0;
                const mine = isSupabaseConfigured
                  ? splitCounts.mine?.[word.id] || 0
                  : totalCount;
                const complete = mine >= TARGET_REPS_PER_SIGN;
                const selected = word.id === selectedSignId;

                return (
                  <button
                    key={word.id}
                    type="button"
                    onClick={() => onSelect(word.id)}
                    className={`border px-3 py-2 text-left text-xs ${
                      selected
                        ? "border-[#FFB000] bg-[#FFB000] text-[#050505]"
                        : complete
                          ? "border-[#C8FF00]/60 bg-black text-[#C8FF00]"
                          : "border-white/10 bg-black text-slate-300"
                    }`}
                  >
                    <span className="block font-semibold">{word.label}</span>
                    <span className="mt-1 block font-mono text-[10px] opacity-70">
                      {isSupabaseConfigured ? `SHARED ${shared} + YOURS ${mine}` : `${totalCount} REPS`}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}

function OverallProgress({ counts, words, splitCounts, isSupabaseConfigured }) {
  const getPersonalCount = (wordId) =>
    isSupabaseConfigured ? splitCounts.mine?.[wordId] || 0 : counts[wordId] || 0;
  const totalTarget = words.length * TARGET_REPS_PER_SIGN;
  const totalDone = words.reduce(
    (sum, word) => sum + Math.min(getPersonalCount(word.id), TARGET_REPS_PER_SIGN),
    0,
  );
  const completedSigns = words.filter(
    (word) => getPersonalCount(word.id) >= TARGET_REPS_PER_SIGN,
  ).length;
  const percent = totalTarget > 0 ? (totalDone / totalTarget) * 100 : 0;

  return (
    <section className="cyber-panel p-4" aria-label="Personal recording progress">
      <div className="mb-2 flex flex-col justify-between gap-1 text-sm text-slate-300 sm:flex-row">
        <span>Personal capture: {completedSigns} / {words.length} signs complete</span>
        <span className="font-mono text-slate-400">
          {totalDone} / {totalTarget} reps
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden bg-black/40"
        role="progressbar"
        aria-label="Personal recording progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(percent)}
      >
        <div
          className="h-full bg-[#FFB000] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}