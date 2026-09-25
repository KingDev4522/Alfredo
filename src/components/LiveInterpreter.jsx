import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { ArrowsOut } from "@phosphor-icons/react/dist/icons/ArrowsOut";
import { BorderBeam } from "border-beam";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/icons/ArrowsClockwise";
import { Eye } from "@phosphor-icons/react/dist/icons/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/icons/EyeSlash";
import { Waveform } from "@phosphor-icons/react/dist/icons/Waveform";
import { FileText } from "@phosphor-icons/react/dist/icons/FileText";
import { SpeakerHigh } from "@phosphor-icons/react/dist/icons/SpeakerHigh";
import { Copy } from "@phosphor-icons/react/dist/icons/Copy";
import { Trash } from "@phosphor-icons/react/dist/icons/Trash";
import { Gear } from "@phosphor-icons/react/dist/icons/Gear";
import { Play } from "@phosphor-icons/react/dist/icons/Play";
import { usePoseHandTracker } from "../hooks/usePoseHandTracker";
import { CAMERA_CONSTRAINTS } from "../lib/camera";
import { handColorFor, BODY_COLOR } from "../lib/handColors";
import { normalizeSequence } from "../lib/normalize";
import { createSegmenter } from "../lib/segmentation";
import {
  buildTemplateLibrary,
  classifySequence,
  fingertipWeighted,
  CONFIDENCE_THRESHOLD,
} from "../lib/recognizer";
import { buildMergedLibrary, classifyWithPriority } from "../lib/libraryMerge";
import { getAllRecordings, getMainRecordings, getMyRecordings } from "../lib/recordingStorage";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { getAllWords, syncCustomWordsWithDatabase } from "../lib/customWords";
import { buildSpokenPhrases, phrasesToSpeechText } from "../lib/sentenceGrammar";
import { buildSpokenPhrasesWithAI, translateToHindi } from "../lib/sentenceAI";

gsap.registerPlugin(useGSAP);

// signLabelById is computed inside the component (not here at module
// scope) so it picks up custom words added after the page first loaded - 
// this module only ever runs once per page load, but the component
// remounts fresh each time you switch to this tab.

// How long the hands need to be absent from frame before the sentence
// auto-speaks - this is the trigger you asked for: keep signing and words
// keep accumulating, then drop your hands when the sentence is complete
// and it speaks. Long enough that briefly repositioning your hand between
// signs doesn't falsely trigger it, short enough it doesn't feel laggy.
const HANDS_ABSENT_SPEAK_MS = 900;

export function LiveInterpreter() {
  const [allWords, setAllWords] = useState(() => getAllWords());
  const signLabelById = Object.fromEntries(allWords.map((w) => [w.id, w.label]));

  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameCallbackId = useRef(null);
  const segmenterRef = useRef(null);
  const handsAbsentSinceRef = useRef(null);
  const hasTriggeredSpeechForAbsenceRef = useRef(false);
  const sentenceWordsRef = useRef([]);
  const autoGrammarEnabledRef = useRef(true);
  const hindiEnabledRef = useRef(false);
  const wordChipRef = useRef(null);
  const liveWordRef = useRef(null);
  const confidenceBarRef = useRef(null);

  const { poseLandmarker, handLandmarker, isLoading: modelLoading } = usePoseHandTracker();
  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [templateLibrary, setTemplateLibrary] = useState(null);
  const [templateCount, setTemplateCount] = useState(0);
  // Overlay toggle, wired to the canvas draw below.
  const [showLandmarks, setShowLandmarks] = useState(true);
  // BorderBeam is continuous motion, so it must honour the OS setting.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [liveStatus, setLiveStatus] = useState("watching"); // watching | capturing | recognized | rejected
  const [bufferedMs, setBufferedMs] = useState(0);
  const [liveWord, setLiveWord] = useState(null); // { signId, confidence }
  const [sentenceWords, setSentenceWords] = useState([]); // array of signIds
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoGrammarEnabled, setAutoGrammarEnabled] = useState(true);
  const [hindiEnabled, setHindiEnabled] = useState(false);

  // Sub-Phase 2B: Persistent Transcript State
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [copyStatus, setCopyStatus] = useState("");

  async function loadTemplates() {
    try {
      if (isSupabaseConfigured) {
        // Hard Main-wins: overlapping words always resolve to the admin Main
        // golden (see libraryMerge.classifyWithPriority). Personal takes only
        // cover novel words Main cannot match.
        const [main, mine] = await Promise.all([getMainRecordings(), getMyRecordings()]);
        setTemplateLibrary(buildMergedLibrary(main, mine));
        setTemplateCount(main.length + mine.length);
      } else {
        const recordings = await getAllRecordings();
        setTemplateLibrary(buildTemplateLibrary(recordings));
        setTemplateCount(recordings.length);
      }
    } catch (err) {
      console.error("Failed to load templates (backend might be offline):", err);
      setTemplateLibrary(buildTemplateLibrary([]));
      setTemplateCount(0);
    }
  }

  useEffect(() => {
    async function init() {
      const updated = await syncCustomWordsWithDatabase();
      if (updated) {
        setAllWords(getAllWords());
      }
      loadTemplates();
    }
    init();
  }, []);

  useEffect(() => {
    sentenceWordsRef.current = sentenceWords;
  }, [sentenceWords]);

  useEffect(() => {
    autoGrammarEnabledRef.current = autoGrammarEnabled;
  }, [autoGrammarEnabled]);

  useEffect(() => {
    hindiEnabledRef.current = hindiEnabled;
  }, [hindiEnabled]);

  // --- Camera setup (same pattern as HandTracker/RecordingTool) ---
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
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Main detection + segmentation + recognition loop ---
  useEffect(() => {
    if (!poseLandmarker || !handLandmarker || cameraStatus !== "ready" || !templateLibrary) return;

    segmenterRef.current = createSegmenter();

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);

    // Recordings were captured already in position (the countdown gave
    // time to get set before the 2-second window started), so they
    // mostly contain the clean, held sign. Live segments have no such
    // luxury - they capture the raise-your-hand-into-position motion at
    // the very start too, which the templates never had to deal with.
    // Trimming to the final ~2 seconds biases toward the settled,
    // comparable portion instead of the whole raw buffer.
    function trimToRecentWindow(frames, targetMs = 2000, estimatedFps = 30) {
      const targetFrameCount = Math.round((targetMs / 1000) * estimatedFps);
      if (frames.length <= targetFrameCount) return frames;
      return frames.slice(frames.length - targetFrameCount);
    }

    async function classifyAsync(rawSegmentFrames) {
      const segmentFrames = trimToRecentWindow(rawSegmentFrames);
      // Live frame aspect, so the vertical axis is not stretched relative to
      // the horizontal one. See the header note in lib/normalize.js.
      const v = videoRef.current;
      const aspect = v && v.videoWidth > 0 && v.videoHeight > 0
        ? v.videoWidth / v.videoHeight
        : undefined;
      const normalizationResult = normalizeSequence(segmentFrames, aspect);

      if (!normalizationResult.normalized) {
        setLiveStatus("rejected");
        setLiveWord(null);
        return;
      }

      // Hard Main-wins when merged library present, else legacy path.
      // All templates (motion or still, 1-hand or 2-hand) participate; nothing is excluded.
      const isMerged = templateLibrary && templateLibrary.user && templateLibrary.main;
      const result = isMerged
        ? classifyWithPriority(normalizationResult.frames, templateLibrary, {
            landmarkWeight: fingertipWeighted,
            threshold: CONFIDENCE_THRESHOLD,
          })
        : classifySequence(normalizationResult.frames, templateLibrary, {
            landmarkWeight: fingertipWeighted,
          });

      if (result.signId && result.confidence >= CONFIDENCE_THRESHOLD) {
        setLiveStatus("recognized");
        setLiveWord({ signId: result.signId, confidence: result.confidence, source: result.source });

        const lastWord = sentenceWordsRef.current[sentenceWordsRef.current.length - 1];
        if (result.signId !== lastWord) {
          setSentenceWords((prev) => [...prev, result.signId]);
        }
        return;
      }

      // Step 2: No match found
      setLiveStatus("rejected");
      setLiveWord(null);
    }

    function scheduleNext() {
      frameCallbackId.current = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(onFrame)
        : requestAnimationFrame(onFrame);
    }

    function onFrame(nowMs) {
      if (video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

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

        let leftHand = null;
        let rightHand = null;
        handResult.handednesses.forEach((h, i) => {
          if (h[0].categoryName === "Left") leftHand = handResult.landmarks[i];
          if (h[0].categoryName === "Right") rightHand = handResult.landmarks[i];
        });
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
          if (!showLandmarks) return;
          const category = handResult.handednesses[idx][0].categoryName;
          const handColor = handColorFor(category);

          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: handColor,
            lineWidth: 3,
          });
          drawingUtils.drawLandmarks(landmarks, { color: handColor, lineWidth: 1, radius: 4 });
        });
        canvasCtx.restore();

        const frameObj = {
          body: {
            left_shoulder: poseResult.landmarks[0]?.[11] || null,
            left_elbow: poseResult.landmarks[0]?.[13] || null,
            left_wrist: poseResult.landmarks[0]?.[15] || null,
            right_shoulder: poseResult.landmarks[0]?.[12] || null,
            right_elbow: poseResult.landmarks[0]?.[14] || null,
            right_wrist: poseResult.landmarks[0]?.[16] || null,
          },
          left_hand: leftHand,
          right_hand: rightHand
        };

        const segEvent = segmenterRef.current.pushFrame(frameObj, nowMs);
        if (segEvent.event === "segment-ready") {
          // FIRE-AND-FORGET: Does not block the frame loop
          classifyAsync(segEvent.segmentFrames);
          setBufferedMs(0);
        }

        if (handResult.landmarks.length === 0) {
          setLiveStatus("watching");
          setBufferedMs(0);

          if (handsAbsentSinceRef.current === null) {
            handsAbsentSinceRef.current = nowMs;
          }
          const absentFor = nowMs - handsAbsentSinceRef.current;

          if (
            absentFor >= HANDS_ABSENT_SPEAK_MS &&
            !hasTriggeredSpeechForAbsenceRef.current &&
            sentenceWordsRef.current.length > 0
          ) {
            hasTriggeredSpeechForAbsenceRef.current = true;
            speakSentence();
          }
        } else {
          // Hands are back in frame - reset so the next time they leave
          // can trigger speech again.
          handsAbsentSinceRef.current = null;
          hasTriggeredSpeechForAbsenceRef.current = false;

          if (segEvent.event !== "segment-ready" && segmenterRef.current.getStateLabel() === "accumulating") {
            setLiveStatus("capturing");
            setBufferedMs(segmenterRef.current.getBufferedMs(nowMs));
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
  }, [poseLandmarker, handLandmarker, cameraStatus, templateLibrary]);

  async function speakSentence() {
    const current = sentenceWordsRef.current;
    if (current.length === 0) return;

    // Hardcoded grammar first (instant, offline). If any word has no rule
    // and auto-sentences are on, ask the backend AI (Groq -> Gemini
    // fallbacks); on any failure the grammar result is spoken unchanged.
    let phrases;
    if (autoGrammarEnabledRef.current) {
      ({ phrases } = await buildSpokenPhrasesWithAI(current, { autoGrammar: true }));
    } else {
      phrases = buildSpokenPhrases(current, { autoGrammar: false });
    }
    const text = phrasesToSpeechText(phrases);

    // Hindi toggle: translate the finished English sentence, then speak it
    // with a Hindi voice. ANY translation failure falls back to speaking
    // the English text - translation must never break speech.
    let spokenText = text;
    if (hindiEnabledRef.current && text) {
      try {
        spokenText = await translateToHindi(text);
      } catch (err) {
        console.warn("[LiveInterpreter] Hindi translation failed, speaking English:", err?.message || err);
      }
    }
    const speakingHindi = spokenText !== text;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    if (speakingHindi) {
      utterance.lang = "hi-IN";
      const hindiVoice = pickHindiVoice();
      if (hindiVoice) utterance.voice = hindiVoice;
    }
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    // Sub-Phase 2B: Push to persistent transcript history before clearing.
    // Stores what was actually spoken (Hindi when the toggle was on).
    setTranscriptHistory((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: spokenText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    // Clear after speaking - this was the bug causing repeated
    // sentences: the words previously stayed in the list, so the next
    // trigger re-spoke everything from the start plus whatever was new.
    sentenceWordsRef.current = [];
    setSentenceWords([]);
  }

  // Best-effort Hindi voice for speech synthesis: exact hi-IN match first,
  // then any Hindi voice. Chrome loads voices asynchronously, so this is
  // resolved at speak time (by then the user has interacted and voices are
  // loaded). Null = speak Hindi text with the default voice instead.
  function pickHindiVoice() {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return null;
      const voices = synth.getVoices() || [];
      return (
        voices.find((v) => (v.lang || "").toLowerCase() === "hi-in") ||
        voices.find((v) => (v.lang || "").toLowerCase().startsWith("hi")) ||
        null
      );
    } catch {
      return null;
    }
  }

  function clearSentence() {
    sentenceWordsRef.current = [];
    setSentenceWords([]);
    setLiveWord(null);
    setLiveStatus("watching");
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    handsAbsentSinceRef.current = null;
    hasTriggeredSpeechForAbsenceRef.current = false;
  }

  // --- GSAP: pop in each newly recognized word chip ---
  useGSAP(
    () => {
      if (!wordChipRef.current) return;
      gsap.fromTo(
        wordChipRef.current,
        { scale: 0.7, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.3, ease: "back.out(3)" }
      );
    },
    { scope: rootRef, dependencies: [sentenceWords.length] }
  );

  // --- GSAP: live word + confidence bar animate in on each recognition ---
  useGSAP(
    () => {
      if (liveStatus !== "recognized" || !liveWordRef.current) return;
      gsap.fromTo(
        liveWordRef.current,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }
      );
      if (confidenceBarRef.current && liveWord) {
        gsap.fromTo(
          confidenceBarRef.current,
          { width: "0%" },
          { width: `${Math.round(liveWord.confidence * 100)}%`, duration: 0.4, ease: "power2.out" }
        );
      }
    },
    { scope: rootRef, dependencies: [liveStatus, liveWord] }
  );

  const previewPhrases = buildSpokenPhrases(sentenceWords, { autoGrammar: autoGrammarEnabled });
  const previewText = phrasesToSpeechText(previewPhrases);

  return (
    <div
      ref={rootRef}
      className="ref-page cyber-interpreter-grid grid w-full grid-cols-1 items-start gap-5 lg:grid-cols-[1.12fr_0.88fr]"
    >
      {/* Visual column: camera + load notices */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-24">
        {/*
          The camera is the point of this page, so it gets the room. It used to
          live in a 1152px max-width grid at 1.1fr, which capped the stage at
          roughly 610x343. It now fills the page container and takes 1.12 of
          2.0 columns, about 820x512 at a 1560px container, and the frame is
          16:10 rather than 16:9 so the signer is not cropped at the top of the
          head. The video uses object-cover, so the aspect change crops rather
          than distorts.
        */}
        <div className="ref-panel relative aspect-[4/3] w-full overflow-hidden bg-[#0b0a09] sm:aspect-video lg:aspect-[16/10]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />

          {isSpeaking && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-white/15 bg-[#100f0d]/75 px-3 py-1.5 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ref-live)]" />
              <span className="font-mono text-[11px] text-white">Speaking</span>
            </div>
          )}

          {/* Camera state, as a pill, top-left. */}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/15 bg-[#100f0d]/75 px-3 py-1.5 backdrop-blur-md">
            <span
              className={`h-1.5 w-1.5 rounded-full ${cameraStatus === "ready" ? "bg-[var(--ref-live)]" : "bg-[var(--ref-faint)]"}`}
            />
            <span className="font-mono text-[11px] text-white">
              {cameraStatus === "ready" ? "Camera active" : "Starting camera"}
            </span>
          </div>

          {/* Capture tools, bottom-left, matching the reference. */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const el = videoRef.current;
                if (!el) return;
                if (el.requestFullscreen) el.requestFullscreen();
                else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
              }}
              className="ref-icon-btn"
              aria-label="Fullscreen camera"
              title="Fullscreen"
            >
              <ArrowsOut size={16} weight="regular" />
            </button>
            <button
              type="button"
              onClick={loadTemplates}
              className="ref-icon-btn"
              aria-label={`Reload recordings, ${templateCount} loaded`}
              title={`Reload recordings (${templateCount})`}
            >
              <ArrowsClockwise size={16} weight="regular" />
            </button>
            <button
              type="button"
              onClick={() => setShowLandmarks((v) => !v)}
              className="ref-icon-btn"
              aria-pressed={showLandmarks}
              aria-label={showLandmarks ? "Hide hand landmarks" : "Show hand landmarks"}
              title={showLandmarks ? "Hide landmarks" : "Show landmarks"}
            >
              {showLandmarks ? (
                <Eye size={16} weight="regular" />
              ) : (
                <EyeSlash size={16} weight="regular" />
              )}
            </button>
          </div>
        </div>

        {(modelLoading || !templateLibrary) && (
          <p className="text-center text-sm text-slate-400">Loading recognizer…</p>
        )}

        {templateLibrary && templateCount === 0 && (
          <p className="text-center text-sm text-amber-300">
            No recorded signs found yet. Record some on the Record page first.
          </p>
        )}
      </div>

      {/* Content column: status, sentence, transcript, controls */}
      <div className="flex min-w-0 flex-col gap-4">
      {/* Live recognition status */}
      <div
        className="ref-panel flex min-h-[5.5rem] flex-col justify-center gap-2 p-5"
        role="status"
        aria-live="polite"
      >
        {liveStatus === "watching" && (
          <div className="flex items-center gap-4">
            <span className="ref-icon">
              <Waveform size={18} weight="regular" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-white">Listening for a sign</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--ref-faint)]">
                Lower your hands when your sentence is complete to speak it.
              </p>
            </div>
            <span aria-hidden="true" className="ml-auto flex h-6 items-end gap-[3px]">
              {[10, 20, 13, 22, 16, 9].map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-[var(--ref-live)]"
                  style={{ height: `${h}px`, animation: `ref-pulse 1.1s ${i * 0.11}s ease-in-out infinite` }}
                />
              ))}
            </span>
          </div>
        )}
        {liveStatus === "capturing" && (
          <div className="flex w-full flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-[var(--ref-live)]">Capturing</span>
              <span className="font-mono text-[12px] text-[var(--ref-muted)]">
                {(bufferedMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ref-surface-3)]"
              role="progressbar"
              aria-label="Capture progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round((bufferedMs / 1200) * 100))}
            >
              <div
                className="h-full rounded-full bg-[var(--ref-live)]"
                style={{ width: `${Math.min(100, (bufferedMs / 1200) * 100)}%` }}
              />
            </div>
            <span className="text-[12px] text-[var(--ref-faint)]">Hold still briefly once you finish the sign.</span>
          </div>
        )}
        {liveStatus === "rejected" && (
          <div className="flex items-center gap-3">
            <span className="ref-icon">
              <Waveform size={18} weight="regular" />
            </span>
            <p className="text-[15px] font-semibold text-white">Not recognized, try again</p>
          </div>
        )}
        {liveStatus === "recognized" && liveWord && (
          <div ref={liveWordRef} className="flex w-full flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-bold leading-none text-white">
                {signLabelById[liveWord.signId] || liveWord.signId}
              </span>
              <span className="rounded-full border border-[var(--ref-accent-line)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ref-accent)]">
                {liveWord.source === "you" ? "You" : "Shared"}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ref-surface-3)]"
              role="progressbar"
              aria-label="Recognition confidence"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(liveWord.confidence * 100)}
            >
              <div ref={confidenceBarRef} className="h-full bg-[var(--ref-live)]" style={{ width: "0%" }} />
            </div>
            <span className="font-mono text-[11px] text-[var(--ref-faint)]">
              {Math.round(liveWord.confidence * 100)}% confidence
            </span>
          </div>
        )}
      </div>

      {/* Building sentence */}
      {/*
        Travelling beam on this panel's border, using the border-beam package.

        Colour is "gold", not the default "colorful": this page has a locked
        two-accent palette and colorful animates a full rainbow hue shift.
        staticColors stops even the hue drift inside gold, so the beam stays
        amber and reads as the secondary brand colour.

        Performance. The library ships 12 stacked filter:blur() layers and 56
        mask operations, which repaint on the main thread and visibly janked
        against MediaPipe inference. Two knobs cut that cost without changing
        the look much:
          staticColors  removes the per-frame hue-shift rAF loop
          glowSize 0.55 shrinks every blur radius, so the blurs are cheap
        Note the real prop is "brightness", not "strength" as the widely
        circulated snippet claims; the package does not accept "strength".
      */}
      <BorderBeam
        size="md"
        colorVariant="gold"
        theme="dark"
        staticColors
        glowSize={0.55}
        brightness={0.75}
        borderRadius={16}
        active={!reduceMotion}
      >
        <div className="ref-panel flex flex-col gap-3 p-5">
        <span className="ref-label">
          <FileText size={14} weight="regular" />
          Signed so far
        </span>
        <div className="flex min-h-9 flex-wrap gap-2">
          {sentenceWords.length === 0 && (
            <span className="text-[13.5px] text-[var(--ref-faint)]">Nothing yet. Start signing.</span>
          )}
          {sentenceWords.map((signId, idx) => (
            <span
              key={idx}
              ref={idx === sentenceWords.length - 1 ? wordChipRef : null}
              className="ref-chip"
            >
              {signLabelById[signId] || signId}
            </span>
          ))}
        </div>

        <span className="ref-label mt-2">
          <SpeakerHigh size={14} weight="regular" />
          Will be spoken as
        </span>
        <div className="ref-field">
          {previewText || <span className="text-[var(--ref-faint)]">Empty</span>}
        </div>
        </div>
      </BorderBeam>

      {/* Sub-Phase 2B: Conversation Transcript Panel */}
      <div className="ref-panel flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="ref-label">
            <FileText size={14} weight="regular" />
            Conversation transcript
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (!navigator.clipboard) {
                  setCopyStatus("Clipboard unavailable");
                  setTimeout(() => setCopyStatus(""), 2000);
                  return;
                }
                const fullText = transcriptHistory.map(entry => `[${entry.timestamp}] ${entry.text}`).join('\n');
                try {
                  await navigator.clipboard.writeText(fullText);
                  setCopyStatus("Copied!");
                } catch {
                  setCopyStatus("Failed to copy");
                }
                setTimeout(() => setCopyStatus(""), 2000);
              }}
              disabled={transcriptHistory.length === 0}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ref-muted)] transition-colors hover:text-white disabled:opacity-40"
            >
              <Copy size={14} weight="regular" />
              {copyStatus || "Copy all"}
            </button>
            <button
              onClick={() => setTranscriptHistory([])}
              disabled={transcriptHistory.length === 0}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ref-muted)] transition-colors hover:text-white disabled:opacity-40"
            >
              <Trash size={14} weight="regular" />
              Clear
            </button>
          </div>
        </div>

        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
          {transcriptHistory.length === 0 ? (
            <span className="text-[13.5px] italic text-[var(--ref-faint)]">
              No transcript entries yet. Start signing...
            </span>
          ) : (
            transcriptHistory.map((entry) => (
              <div key={entry.id} className="flex gap-3 text-[13.5px]">
                <span className="flex-shrink-0 font-mono text-[12px] text-[var(--ref-faint)]">{entry.timestamp}</span>
                <span className="text-[var(--ref-text)]">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        <button
          onClick={() => setAutoGrammarEnabled((v) => !v)}
          className={`ref-btn ${autoGrammarEnabled ? "ref-btn--live" : ""}`}
          title="When off, recognized signs are spoken literally instead of being expanded into full sentences. This lets you compose custom phrasing during a demo."
        >
          <Gear size={18} weight="regular" />
          <span className="ref-btn__stack">
            <span>Auto sentences: {autoGrammarEnabled ? "On" : "Off"}</span>
            <span className="ref-btn__sub">Speak after hold (900ms)</span>
          </span>
        </button>
        <button
          onClick={() => setHindiEnabled((v) => !v)}
          className={`ref-btn ${hindiEnabled ? "ref-btn--accent" : ""}`}
          title="When on, the finished English sentence is translated to Hindi and spoken aloud in Hindi. If translation fails, English is spoken instead."
        >
          <span className="ref-btn__stack">
            <span>Hindi: {hindiEnabled ? "On" : "Off"}</span>
            <span className="ref-btn__sub">Speak in Hindi</span>
          </span>
        </button>
        <button
          onClick={speakSentence}
          disabled={sentenceWords.length === 0}
          className="ref-btn ref-btn--primary flex-1"
        >
          <Play size={16} weight="fill" />
          Speak now
        </button>
        <button onClick={clearSentence} className="ref-btn ref-btn--accent">
          <Trash size={18} weight="regular" />
          <span className="ref-btn__stack">
            <span>Clear</span>
            <span className="ref-btn__sub">Reset current text</span>
          </span>
        </button>
      </div>
      </div>
    </div>
  );
}
