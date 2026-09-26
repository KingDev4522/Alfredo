import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { usePoseHandTracker } from "../hooks/usePoseHandTracker";
import { CAMERA_CONSTRAINTS } from "../lib/camera";
import { handColorFor, BODY_COLOR } from "../lib/handColors";
import { normalizeSequence } from "../lib/normalize";
import { VOCABULARY, TARGET_REPS_PER_SIGN } from "../lib/vocabulary";
import { getAllWords, addCustomWord, removeCustomWord, syncCustomWordsWithDatabase, slugify } from "../lib/customWords";
import {
  saveRecording,
  saveToLegacyFile,
  syncLegacyFileToMain,
  syncSupabaseToLegacyFile,
  getCountsPerSign,
  getCountsSplit,
  getMainSignSet,
  isSignInMainSet,
  exportAllRecordingsAsFile,
  importRecordingsFromFile,
  clearAllRecordings,
  deleteRecordingsForSign,
} from "../lib/recordingStorage";
import { isSupabaseConfigured, API_DB_URL } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { SkeletonPlayback } from "./SkeletonPlayback";
import { PublishModal } from "./PublishModal";
import { PanelGlow } from "./PanelGlow";

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
  // Tracks per-hand visibility for the on-screen legend. The value is
  // deliberately write-only here (nothing reads it yet); it exists so the
  // per-frame update below never throws a ReferenceError.
  const [, setLiveSeenHands] = useState({});
  const [pendingRecording, setPendingRecording] = useState(null); // { frames, handCounts, recordingType: 'static' | 'motion' }
  const [playToken, setPlayToken] = useState(0);
  const [counts, setCounts] = useState({});
  const [recordedBy, setRecordedBy] = useState("");
  const [conditionLabel, setConditionLabel] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [newWordLabel, setNewWordLabel] = useState("");
  const [removeWordId, setRemoveWordId] = useState("");
  const [importMessage, setImportMessage] = useState("");
  // PRD 18 — required Static/Motion choice, stored PER WORD.
  //
  // Static vs motion is a property of the sign, not of the take and not a
  // global setting: every take of "Water" is a static pose, every take of
  // "Hello" is motion. This used to be one scalar for the whole session,
  // which meant a type picked for one sign silently carried over to the next
  // and up to 15 takes could be written to the database mislabelled. The
  // gate was satisfied, so nothing errored — the data was just wrong.
  //
  // Keyed by sign id it is picked once per sign, cannot leak to another
  // sign, and still survives switching back and forth while batch recording.
  const [recordingTypeBySign, setRecordingTypeBySign] = useState({}); // { [signId]: 'static' | 'motion' }
  // Derived, so the pre-record gate (startCountdown) keeps working with no
  // change at the call site.
  const recordingType = recordingTypeBySign[selectedSignId] || null;

  // Latest-value refs for the always-on camera loop below.
  //
  // The detection loop subscribes ONCE (deps: landmarkers + cameraStatus) and
  // runs at 30-60fps. finishRecording() is called from inside that loop, so a
  // direct call would invoke the closure from the render the loop started in —
  // typically signId "hello" + recordingType null — no matter what the user
  // picked since. The take was then stamped with the wrong sign and a null
  // classification, which is exactly the "I chose Static but it says I did
  // not" failure. These refs always hold the current render's values, and the
  // loop calls through finishRecordingRef so it runs the LATEST closure.
  const selectedSignIdRef = useRef(selectedSignId);
  const recordingTypeBySignRef = useRef(recordingTypeBySign);
  useEffect(() => {
    selectedSignIdRef.current = selectedSignId;
    recordingTypeBySignRef.current = recordingTypeBySign;
  }, [selectedSignId, recordingTypeBySign]);
  const finishRecordingRef = useRef(null);

  /*
   * A pending take owns its own sign and its own classification.
   *
   * Both used to be read from live component state at save time, which meant
   * a take could be filed against whichever word happened to be selected when
   * the user pressed Keep, and a take whose classification went missing was
   * permanently unsaveable: the classifier lives in the left column, so from
   * the review panel there was no way out of it. The sign is snapshotted into
   * the take at record time, and the classification is resolved through the
   * take's own sign so it can be set or corrected from either column.
   */
  function takeSignId(take) {
    return take?.signId || selectedSignId;
  }
  function takeRecordingType(take) {
    if (!take) return null;
    if (take.recordingType === "static" || take.recordingType === "motion") {
      return take.recordingType;
    }
    return recordingTypeBySign[takeSignId(take)] || null;
  }
  function chooseRecordingType(value, signId = selectedSignId) {
    setRecordingTypeBySign((current) => ({ ...current, [signId]: value }));
    // Keep any pending take for this sign in step, so classifying from the
    // review panel also unblocks Keep and Publish there.
    setPendingRecording((current) =>
      current && takeSignId(current) === signId ? { ...current, recordingType: value } : current,
    );
    setSaveMessage("");
  }
  // PRD 02 v2 §5.4 - admin publish target + double-confirm modal.
  // Locked rule: the admin account always defaults to Shared Main; every other
  // account always saves to its own space (no toggle rendered for non-admins).
  const { isAdmin } = useAuth();
  const [saveTarget, setSaveTarget] = useState("mine"); // 'mine' | 'main' (admin only)
  const [showPublish, setShowPublish] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [splitCounts, setSplitCounts] = useState({ shared: {}, mine: {} });
  // Upper-cased signIds owned by Shared Main. Non-admin takes for these words
  // are blocked (hard Main-wins): Interpreter + avatar ignore them anyway.
  const [mainSignSet, setMainSignSet] = useState(new Set());
  // Localhost-file bridge availability. Both sync buttons below shell out to
  // the FastAPI backend on this machine; on any other machine (a friend's
  // demo phone/laptop) that URL is their own empty localhost, so showing the
  // buttons only produces "backend offline" errors. Probed once on mount and
  // used purely to hide them — every other save path already degrades
  // gracefully when the file backend is unreachable.
  const [fileBackendOnline, setFileBackendOnline] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function probeFileBackend() {
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${API_DB_URL}/recordings`, { signal: ctrl.signal });
        window.clearTimeout(timer);
        if (!cancelled) setFileBackendOnline(res.ok);
      } catch {
        if (!cancelled) setFileBackendOnline(false);
      }
    }
    probeFileBackend();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isAdmin) setSaveTarget("main");
    else setSaveTarget("mine");
  }, [isAdmin]);

  const selectedSign = allWords.find((w) => w.id === selectedSignId) ?? VOCABULARY[0];
  // Labels for any sign, not just the selected one. A pending take carries
  // its own sign id, which can differ from selectedSignId, so the save and
  // publish messages and the review header need to resolve a label from an
  // arbitrary id rather than reading the selected one.
  const signLabelById = useMemo(
    () => Object.fromEntries(allWords.map((w) => [w.id, w.label])),
    [allWords],
  );

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
    // Non-admin guard: a "new" word that already lives in Shared Main (same
    // slug, case-insensitive) must not become a shadow custom entry.
    if (!isAdmin && isSupabaseConfigured && isSignInMainSet(slugify(label), mainSignSet)) {
      setSaveMessage(
        `"${label.trim()}" is already in the Shared Main database. The Interpreter and the Translate avatar always use the admin version, so it cannot be added as a personal word.`
      );
      return;
    }
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
          (result.skipped ? `, skipped ${result.skipped} invalid entr${result.skipped === 1 ? "y" : "ies"}` : "") +
          (result.blockedMain ? `, blocked ${result.blockedMain} already in Shared Main` : "") +
          "."
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
        setMainSignSet(await getMainSignSet());
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
        const nextLeft = !!leftHand;
        const nextRight = !!rightHand;
        setLiveSeenHands((prev) =>
          prev.Left === nextLeft && prev.Right === nextRight
            ? prev
            : { Left: nextLeft, Right: nextRight },
        );

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
            // Through the ref: runs the latest render's closure (current
            // signId + classification), not the stale one from loop setup.
            finishRecordingRef.current?.();
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
    // PRD 18: Static/Motion choice is required BEFORE recording. No default.
    if (recordingType !== "static" && recordingType !== "motion") {
      setSaveMessage("Pick Static or Motion first — every recording must be classified.");
      return;
    }
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
    // recordingType is a dep on purpose so the countdown closure sees the
    // current classification. Harmless to re-run: the option buttons are
    // disabled during countdown/recording, so this cannot change mid-countdown.
    // (The actual take stamp reads from refs in finishRecording, so even the
    // 2-second capture window after the countdown cannot go stale.)
  }, [mode, countdownValue, recordingType]);

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

    // The live frame aspect matters: MediaPipe scales x by width and y by
    // height, so a non-square frame stretches the vertical axis relative to
    // the horizontal one. See the header note in lib/normalize.js.
    const v = videoRef.current;
    const aspect = v && v.videoWidth > 0 && v.videoHeight > 0
      ? v.videoWidth / v.videoHeight
      : undefined;
    const result = normalizeSequence(rawFrames, aspect);
    
    if (!result.normalized) {
      setSaveMessage("Discarded: Shoulders not visible enough to anchor the recording.");
      setMode("idle");
      return;
    }

    // signId + classification are snapshotted with the frames, read from the
    // latest-value refs (never from a stale camera-loop closure). The review
    // header, Keep and Publish all resolve through the take's own sign, so a
    // take can never be filed under the wrong word or lose its Static/Motion
    // flag between Start and Keep.
    const liveSignId = selectedSignIdRef.current;
    const liveType = recordingTypeBySignRef.current[liveSignId] || null;
    setPendingRecording({
      frames: result.frames,
      handCounts: handCountsSeen,
      signId: liveSignId,
      recordingType: liveType,
    });
    setPlayToken((t) => t + 1);
    setMode("reviewing");
  }
  // Assigned every render so the camera loop always invokes the closure above
  // with current state, even though the loop itself subscribed long ago.
  finishRecordingRef.current = finishRecording;

  async function keepRecording() {
    if (!pendingRecording) return;
    // PRD 18: the classification flag travels with the take. Resolved through
    // the take's own sign, and settable from the review panel, so a take that
    // lost its classification is recoverable instead of a dead end.
    const type = takeRecordingType(pendingRecording);
    if (type !== "static" && type !== "motion") {
      setSaveMessage("Classify this take as Static or Motion before keeping it.");
      return;
    }

    const signId = takeSignId(pendingRecording);

    // Admin publishing to Main requires double-confirm modal (PRD 02 v2 §5.4).
    if (isAdmin && saveTarget === "main") {
      setShowPublish(true);
      return;
    }

    // Hard Main-wins: a non-admin personal take for a Main-owned word is dead
    // on arrival (Interpreter + avatar always play the admin golden), so block
    // the save with a clear message instead of storing a shadow row.
    if (!isAdmin && isSupabaseConfigured && isSignInMainSet(signId, mainSignSet)) {
      setSaveMessage(
        `"${signLabelById[signId] || signId}" is already in the Shared Main database. The Interpreter and the Translate avatar always use the admin version, so this take was NOT saved. Add a genuinely new word to record something personal.`
      );
      return;
    }

    try {
      await saveRecording({
        signId,
        recordedBy: recordedBy.trim() || "Unknown",
        conditionLabel: conditionLabel.trim() || "unspecified",
        handCount: majorityHandCount(pendingRecording.handCounts),
        recordingType: type,
        frames: pendingRecording.frames,
        recordedAt: Date.now(),
      }, "mine");
    } catch (err) {
      setSaveMessage(err.message || "Save failed.");
      return;
    }

    setPendingRecording(null);
    setMode("idle");
    setSaveMessage(`Saved to My Space. ${signLabelById[signId] || signId} now has ${(counts[signId] || 0) + 1} recording(s).`);
    refreshCounts();
  }

  // Stable callbacks: PublishModal must not receive a new function identity
  // on every camera-frame re-render, or its effects would re-run and clear input.
  const handleClosePublish = useCallback(() => {
    setShowPublish(false);
  }, []);

  const confirmPublishToMain = useCallback(async () => {
    if (!pendingRecording) return;
    // Resolved the same way as keepRecording, so a take classified from the
    // review panel publishes correctly instead of re-failing here. Reads the
    // ref (never a stale closure): the callback is memoized, so the state
    // value it closed over would otherwise be one render behind the review
    // classifier and Publish would re-fail right after classifying.
    const takeId = pendingRecording.signId || selectedSignIdRef.current;
    const type =
      pendingRecording.recordingType === "static" || pendingRecording.recordingType === "motion"
        ? pendingRecording.recordingType
        : recordingTypeBySignRef.current[takeId] || null;
    if (type !== "static" && type !== "motion") {
      // Keep the modal open but make the failure visible: the page message
      // sits behind the overlay, so surface it on the modal's own status via
      // the page message AND a forced close would lose the take context.
      // Closing is worse (take stays, user confused); instead report inline
      // by closing the modal so the message is readable next to the review
      // classifier that can fix it.
      setShowPublish(false);
      setSaveMessage("Classify this take as Static or Motion before publishing it.");
      setPublishBusy(false);
      return;
    }
    setPublishBusy(true);
    try {
      const signId = takeId;
      // PRD 05 dual-write: same payload object goes to Supabase Main AND the
      // GitHub-tracked localhost file, in the identical app format.
      const payload = {
        signId,
        recordedBy: recordedBy.trim() || "Unknown",
        conditionLabel: conditionLabel.trim() || "unspecified",
        handCount: majorityHandCount(pendingRecording.handCounts),
        recordingType: type,
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
  }, [pendingRecording, recordedBy, conditionLabel, refreshCounts]);

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

  // Reverse bridge: pull Shared MAIN into the localhost file so the Translate
  // avatar can play it. Personal My-Space takes are never synced: the avatar
  // always plays the admin Main golden. Available to all signed-in users
  // (local-file write is per-machine, no shared mutation).
  async function handleSyncSupabaseToFile() {
    if (!confirm("Pull Shared Main recordings into the localhost file for the avatar?")) return;
    setSaveMessage("Syncing Supabase → localhost file…");
    try {
      const { imported, skipped } = await syncSupabaseToLegacyFile();
      setSaveMessage(
        imported === 0
          ? "Nothing new. Every Shared Main sign is already in the localhost file."
          : `Synced ${imported} new Shared Main sign(s) into the localhost file for the avatar.` +
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

  // Hard Main-wins for non-admins: the selected word already has an admin
  // golden, so a personal take would never be shown anywhere.
  const mainProtected =
    !isAdmin && isSupabaseConfigured && isSignInMainSet(selectedSignId, mainSignSet);

  return (
    <div ref={rootRef} className="flex w-full flex-col gap-6">
      <div className="cyber-recording-grid grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        {/* Left: camera + controls */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          {/* gi-stage pins this back to solid black in index.css so the
              glass pass does not repaint the MediaPipe viewport. Nothing
              inside the video/canvas pair is touched. */}
          <div className="cyber-camera-stage gi-stage relative aspect-video w-full overflow-hidden border border-white/10 bg-white/[0.03]">
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

          {mainProtected && (
            <div className="border border-[#FFB000] bg-black px-4 py-3 font-mono text-sm text-[#FFB000]" role="alert">
              "{selectedSign.label}" is already in the Shared Main database. The Interpreter and the
              Translate avatar always play the admin version, so you cannot record or override it
              from My Space. Add a genuinely new word to record something personal.
            </div>
          )}

          {/*
            PRD 18: required classification, no default — Start is blocked
            until the current sign is classified.

            Rendered as a segmented pair rather than two bare buttons. The
            previous version styled the unselected state as `bg-black
            text-slate-300` with no border, so on a black card the two
            options were indistinguishable from the labels beside them and
            read as plain text. Each option now carries its own border and
            surface, and the selected one fills in the page's accent for that
            type: amber for static, cyan for motion, matching the colours
            already used for those two outcomes in the review panel.

            The label names the sign, because the choice is per sign and it
            needs to be obvious which one you are about to classify.
          */}
          <div
            className="flex flex-wrap items-center gap-3 border border-white/10 bg-black/40 px-3 py-2.5"
            role="radiogroup"
            aria-label={`Recording type for ${selectedSign.label}`}
          >
            <span className="text-xs text-slate-300">
              Type for <span className="font-semibold text-white">{selectedSign.label}</span>{" "}
              <span className="text-[#FFB000]">*required</span>
            </span>

            <div className="flex flex-wrap gap-2">
              {/*
                Enabled in "idle" AND "reviewing". The take carries its own
                sign, and chooseRecordingType() pushes the choice into the
                pending take when the signs match — so re-classifying from
                this left column also unblocks Keep/Publish. Only the live
                capture windows (countdown/recording) lock it, since the take
                is being written then. Previously disabled in review, which
                left an unclassified take with no way out from this column.
              */}
              <button
                type="button"
                role="radio"
                aria-checked={recordingType === "static"}
                onClick={() => {
                  const targetId = pendingRecording ? takeSignId(pendingRecording) : selectedSignId;
                  chooseRecordingType("static", targetId);
                  setSaveMessage("");
                }}
                disabled={mode === "countdown" || mode === "recording"}
                title={mode === "reviewing" ? "Re-classify this take — updates Keep/Publish too" : undefined}
                className={`rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  recordingType === "static"
                    ? "border-[#FFB000] bg-[#FFB000] text-[#050505]"
                    : "border-white/20 bg-black text-slate-300 hover:border-[#FFB000]/70 hover:text-white"
                }`}
              >
                Static <span className="font-normal opacity-70">(one pose)</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={recordingType === "motion"}
                onClick={() => {
                  const targetId = pendingRecording ? takeSignId(pendingRecording) : selectedSignId;
                  chooseRecordingType("motion", targetId);
                  setSaveMessage("");
                }}
                disabled={mode === "countdown" || mode === "recording"}
                title={mode === "reviewing" ? "Re-classify this take — updates Keep/Publish too" : undefined}
                className={`rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  recordingType === "motion"
                    ? "border-[#55F6E5] bg-[#55F6E5] text-slate-900"
                    : "border-white/20 bg-black text-slate-300 hover:border-[#55F6E5]/70 hover:text-white"
                }`}
              >
                Motion <span className="font-normal opacity-70">(movement)</span>
              </button>
            </div>

            {!recordingType && mode === "idle" ? (
              <span className="text-xs text-slate-500">Pick one before Start Recording.</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startCountdown}
              disabled={mode !== "idle" || isLoading || cameraStatus !== "ready"}
              title={!recordingType ? "Pick Static or Motion first" : undefined}
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
          <PanelGlow>
          <div className="flex flex-col gap-3 p-5 sm:p-6">
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
          </PanelGlow>

          <SignPicker
            words={allWords}
            selectedSignId={selectedSignId}
            /* Locked while a take is pending. The take now carries its own
               sign id, so this is defence in depth rather than the fix — but
               changing the selected word mid-review made the header, the
               progress panel and the take disagree about what you were
               looking at. */
            disabled={mode === "reviewing" || mode === "recording" || mode === "countdown"}
            onSelect={(id) => {
              setSelectedSignId(id);
              setSaveMessage("");
            }}
            counts={counts}
            splitCounts={splitCounts}
            isSupabaseConfigured={isSupabaseConfigured}
            mainSignSet={mainSignSet}
            isAdmin={isAdmin}
          />

          <PanelGlow>
          <div className="flex flex-col gap-3 p-5 sm:p-6">
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
            {mainProtected && (
              <span className="font-mono text-xs text-[#FFB000]" role="note">
                MAIN-LOCKED: personal takes for this word are never used. Interpreter + avatar always play Shared Main.
              </span>
            )}
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
          </PanelGlow>

          {mode === "reviewing" && pendingRecording && (
            /*
             * The ref sits on this wrapper, not on the PanelGlow, because
             * PanelGlow does not forward refs. It has to be the outermost
             * animated node: the entrance tween uses autoAlpha, and if it
             * only covered the inner content the card frame would sit
             * there fully opaque while its contents faded in.
             */
            <div ref={reviewPanelRef}>
            <PanelGlow>
            <div className="flex flex-col items-center gap-3 p-5 sm:p-6">
              <span className="ss-eyebrow self-start !mb-0">
                Review take
                <span className="ml-2 font-mono text-xs text-slate-400">
                  ({takeRecordingType(pendingRecording) === "static"
                    ? "Static"
                    : takeRecordingType(pendingRecording) === "motion"
                      ? "Motion"
                      : "unclassified"}
                  {" // "}
                  {signLabelById[takeSignId(pendingRecording)] || takeSignId(pendingRecording)})
                </span>
              </span>

              {/*
                The classifier, repeated here on purpose.

                It is also in the left column, before recording, because you
                need to know what kind of take you are capturing. But the
                decision that matters is made here, with the take in front of
                you — so it has to be reachable here too. It used to exist
                only in the other column while Keep and Publish both refused
                an unclassified take, which left no way out of the screen.
              */}
              <div
                className="flex w-full flex-wrap items-center justify-center gap-2 border border-white/10 bg-black/40 px-3 py-2.5"
                role="radiogroup"
                aria-label="Classify this take"
              >
                <span className="text-xs text-slate-300">
                  Classify as <span className="text-[#FFB000]">*required</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={takeRecordingType(pendingRecording) === "static"}
                    onClick={() => chooseRecordingType("static", takeSignId(pendingRecording))}
                    className={`rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition-colors ${
                      takeRecordingType(pendingRecording) === "static"
                        ? "border-[#FFB000] bg-[#FFB000] text-[#050505]"
                        : "border-white/20 bg-black text-slate-300 hover:border-[#FFB000]/70 hover:text-white"
                    }`}
                  >
                    Static
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={takeRecordingType(pendingRecording) === "motion"}
                    onClick={() => chooseRecordingType("motion", takeSignId(pendingRecording))}
                    className={`rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition-colors ${
                      takeRecordingType(pendingRecording) === "motion"
                        ? "border-[#55F6E5] bg-[#55F6E5] text-slate-900"
                        : "border-white/20 bg-black text-slate-300 hover:border-[#55F6E5]/70 hover:text-white"
                    }`}
                  >
                    Motion
                  </button>
                </div>
              </div>
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
                  disabled={mainProtected}
                  title={mainProtected ? "This word is already in Shared Main and cannot be overridden." : undefined}
                  className="cyber-button cyber-button--complete disabled:cursor-not-allowed disabled:opacity-40"
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
            </PanelGlow>
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
          {isAdmin && isSupabaseConfigured && fileBackendOnline && (
            <button
              onClick={handleSyncFileToMain}
              title="Push everything in the localhost GitHub-tracked file into Supabase Main (for recordings made while the API was blind)"
              className="cyber-button cyber-button--primary"
            >
              Sync localhost file → Main
            </button>
          )}
          {isSupabaseConfigured && fileBackendOnline && (
            <button
              onClick={handleSyncSupabaseToFile}
              title="Pull Shared Main recordings into the localhost file so the Translate avatar can play them (personal takes are never synced)"
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
        signLabel={
          signLabelById[pendingRecording?.signId || selectedSignId]
            || selectedSign?.label
            || pendingRecording?.signId
            || selectedSignId
        }
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
  mainSignSet = new Set(),
  isAdmin = false,
  disabled = false,
}) {
  const categories = [...new Set(words.map((word) => word.category))];

  return (
    <PanelGlow>
    {/*
      The max-height and the overflow live on the inner div, not on the
      PanelGlow card. Putting them on the card would clip the outer glow,
      which is the whole effect.
    */}
    <section className="max-h-96 overflow-y-auto p-5 sm:p-6" aria-label="Sign picker">
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
                const mainLocked =
                  !isAdmin && isSupabaseConfigured && mainSignSet.has(String(word.id).toUpperCase());

                return (
                  <button
                    key={word.id}
                    type="button"
                    onClick={() => onSelect(word.id)}
                    disabled={disabled}
                    title={disabled ? "Keep or discard the take in review first." : mainLocked ? "Already in Shared Main. Interpreter and avatar always use the admin version; personal takes are blocked." : undefined}
                    className={`border px-3 py-2 text-left text-xs ${
                      selected
                        ? "border-[#FFB000] bg-[#FFB000] text-[#050505]"
                        : complete
                          ? "border-[#C8FF00]/60 bg-black text-[#C8FF00]"
                          : "border-white/10 bg-black text-slate-300"
                    }`}
                  >
                    <span className="block font-semibold">{word.label}{mainLocked ? " 🔒" : ""}</span>
                    <span className="mt-1 block font-mono text-[10px] opacity-70">
                      {isSupabaseConfigured ? `SHARED ${shared} + YOURS ${mine}` : `${totalCount} REPS`}
                    </span>
                    {mainLocked && (
                      <span className="mt-1 block font-mono text-[10px] text-[#FFB000]">
                        MAIN-LOCKED
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
    </PanelGlow>
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
    <PanelGlow>
    <section className="p-5 sm:p-6" aria-label="Personal recording progress">
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
          className="gi-bar-amber h-full bg-[#FFB000] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
    </PanelGlow>
  );
}