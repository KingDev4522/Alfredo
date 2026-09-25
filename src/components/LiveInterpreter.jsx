import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawingUtils, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
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
  const wordChipRef = useRef(null);
  const liveWordRef = useRef(null);
  const confidenceBarRef = useRef(null);

  const { poseLandmarker, handLandmarker, isLoading: modelLoading } = usePoseHandTracker();
  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [templateLibrary, setTemplateLibrary] = useState(null);
  const [templateCount, setTemplateCount] = useState(0);

  const [liveStatus, setLiveStatus] = useState("watching"); // watching | capturing | recognized | rejected
  const [bufferedMs, setBufferedMs] = useState(0);
  const [liveWord, setLiveWord] = useState(null); // { signId, confidence }
  const [sentenceWords, setSentenceWords] = useState([]); // array of signIds
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoGrammarEnabled, setAutoGrammarEnabled] = useState(true);

  // Sub-Phase 2B: Persistent Transcript State
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [copyStatus, setCopyStatus] = useState("");

  async function loadTemplates() {
    try {
      if (isSupabaseConfigured) {
        // PRD 02 v2 §5.3 - two-stage custom-first: all templates participate.
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
      const normalizationResult = normalizeSequence(segmentFrames);

      if (!normalizationResult.normalized) {
        setLiveStatus("rejected");
        setLiveWord(null);
        return;
      }

      // PRD 02 v2 §5.3 - custom-first when merged library present, else legacy path.
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

  function speakSentence() {
    const current = sentenceWordsRef.current;
    if (current.length === 0) return;

    const phrases = buildSpokenPhrases(current, { autoGrammar: autoGrammarEnabledRef.current });
    const text = phrasesToSpeechText(phrases);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    // Sub-Phase 2B: Push to persistent transcript history before clearing
    setTranscriptHistory((prev) => [
      ...prev,
      {
        id: Date.now(),
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    // Clear after speaking - this was the bug causing repeated
    // sentences: the words previously stayed in the list, so the next
    // trigger re-spoke everything from the start plus whatever was new.
    sentenceWordsRef.current = [];
    setSentenceWords([]);
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
      className="cyber-interpreter-grid grid w-full max-w-6xl grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_0.9fr]"
    >
      {/* Visual column: camera + load notices */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        <div className="cyber-camera-stage relative aspect-video w-full overflow-hidden border border-white/10 bg-white/[0.03]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />

          {isSpeaking && (
            <div className="absolute right-3 top-3 flex items-center gap-2 border border-[#55F6E5]/50 bg-black/80 px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-[#55F6E5] animate-pulse" />
              <span className="text-xs font-mono text-[#55F6E5]">Speaking…</span>
            </div>
          )}

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
      <div className="flex flex-col gap-4 min-w-0">
      {/* Live recognition status */}
      <div
        className="cyber-panel flex min-h-24 flex-col items-center gap-2 p-4"
        role="status"
        aria-live="polite"
      >
        {liveStatus === "watching" && (
          <span className="text-sm text-slate-500">
            Watching for a sign… (lower your hands when your sentence is complete to speak it)
          </span>
        )}
        {liveStatus === "capturing" && (
          <div className="flex flex-col items-center gap-2 w-full">
            <span className="text-sm text-[#C8FF00] font-mono">
              Capturing… {(bufferedMs / 1000).toFixed(1)}s
            </span>
            <div
              className="h-1.5 w-48 overflow-hidden bg-black/40"
              role="progressbar"
              aria-label="Capture progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.min(100, Math.round((bufferedMs / 1200) * 100))}
            >
              <div
                className="h-full bg-[#C8FF00]"
                style={{ width: `${Math.min(100, (bufferedMs / 1200) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-600">
              hold still briefly once you finish the sign
            </span>
          </div>
        )}
        {liveStatus === "rejected" && (
          <span className="text-sm text-amber-400">Not recognized. Try again.</span>
        )}
        {liveStatus === "recognized" && liveWord && (
          <div ref={liveWordRef} className="flex flex-col items-center gap-2 w-full">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">
                {signLabelById[liveWord.signId] || liveWord.signId}
              </span>
              <span className="border border-[#55F6E5]/50 px-2 py-1 font-mono text-[10px] uppercase text-[#55F6E5]">
                {liveWord.source === "user" ? "You" : "Shared"}
              </span>
            </div>
            <div
              className="h-1.5 w-48 overflow-hidden bg-black/40"
              role="progressbar"
              aria-label="Recognition confidence"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(liveWord.confidence * 100)}
            >
              <div ref={confidenceBarRef} className="h-full bg-[#55F6E5]" style={{ width: "0%" }} />
            </div>
            <span className="text-xs font-mono text-slate-500">
              {Math.round(liveWord.confidence * 100)}% confidence
            </span>
          </div>
        )}
      </div>

      {/* Building sentence */}
      <div className="cyber-panel flex flex-col gap-3 p-4">
        <span className="text-xs uppercase tracking-wide text-slate-500">
          Signed so far
        </span>
        <div className="flex flex-wrap gap-2 min-h-10">
          {sentenceWords.length === 0 && (
            <span className="text-sm text-slate-600">Nothing yet. Start signing.</span>
          )}
          {sentenceWords.map((signId, idx) => (
            <span
              key={idx}
              ref={idx === sentenceWords.length - 1 ? wordChipRef : null}
              className="border border-[#55F6E5]/30 bg-black px-3 py-1 text-sm text-slate-200"
            >
              {signLabelById[signId] || signId}
            </span>
          ))}
        </div>

        <span className="text-xs uppercase tracking-wide text-slate-500 mt-2">
          Will be spoken as
        </span>
        <p className="text-slate-200 italic min-h-6">
          {previewText || <span className="text-slate-600 not-italic">Empty</span>}
        </p>
      </div>

      {/* Sub-Phase 2B: Conversation Transcript Panel */}
      <div className="cyber-panel flex flex-col gap-3 p-4">
        <div className="flex justify-between items-center">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Conversation Transcript
          </span>
          <div className="flex gap-4">
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
                } catch (err) {
                  setCopyStatus("Failed to copy");
                }
                setTimeout(() => setCopyStatus(""), 2000);
              }}
              disabled={transcriptHistory.length === 0}
              className="text-xs font-semibold text-slate-300 transition-colors hover:text-[#55F6E5] disabled:opacity-40"
            >
              {copyStatus || "Copy all"}
            </button>
            <button
              onClick={() => setTranscriptHistory([])}
              disabled={transcriptHistory.length === 0}
              className="text-xs font-semibold text-slate-300 transition-colors hover:text-[#F2F0E8] disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2">
          {transcriptHistory.length === 0 ? (
            <span className="text-sm text-slate-600 italic">
              No transcript entries yet. Start signing...
            </span>
          ) : (
            transcriptHistory.map((entry) => (
              <div key={entry.id} className="flex gap-3 text-sm">
                <span className="text-slate-500 font-mono flex-shrink-0">{entry.timestamp}</span>
                <span className="text-slate-200">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
        <button
          onClick={() => setAutoGrammarEnabled((v) => !v)}
          className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors flex items-center gap-2 ${autoGrammarEnabled
              ? "bg-[#55F6E5]/10 border-[#55F6E5]/40 text-[#55F6E5]"
              : "bg-white/5 border-white/15 text-slate-400"
            }`}
          title="When off, recognized signs are spoken literally instead of being expanded into full sentences. This lets you compose custom phrasing during a demo."
        >
          <span className={`w-2 h-2 rounded-full ${autoGrammarEnabled ? "bg-[#55F6E5]" : "bg-slate-600"}`} />
          Auto sentences: {autoGrammarEnabled ? "On" : "Off"}
        </button>
        <button
          onClick={speakSentence}
          disabled={sentenceWords.length === 0}
          className="border border-[#FFB000] bg-[#FFB000] px-5 py-2 font-semibold text-[#050505] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Speak now
        </button>
        <button
          onClick={clearSentence}
          className="rounded-md bg-white/10 hover:bg-white/15 transition-colors px-5 py-2 font-semibold text-slate-200"
        >
          Clear
        </button>
        <button
          onClick={loadTemplates}
          className="rounded-md bg-black/40 border border-white/10 px-4 py-2 text-sm text-slate-300"
        >
          ↻ Reload recordings ({templateCount})
        </button>
      </div>
      </div>
    </div>
  );
}
