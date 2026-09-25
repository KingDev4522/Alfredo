import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { useHandLandmarker } from "../hooks/useHandLandmarker";
import { CAMERA_CONSTRAINTS } from "../lib/camera";
import { normalizeSequence } from "../lib/normalize";
import { createSegmenter } from "../lib/segmentation";
import {
  buildTemplateLibrary,
  classifySequence,
  fingertipWeighted,
  CONFIDENCE_THRESHOLD,
} from "../lib/recognizer";
import { getAllRecordings } from "../lib/recordingStorage";
import { getAllWords } from "../lib/customWords";
import { buildSpokenPhrases, phrasesToSpeechText } from "../lib/sentenceGrammar";

gsap.registerPlugin(useGSAP);

// signLabelById is computed inside the component (not here at module
// scope) so it picks up custom words added after the page first loaded —
// this module only ever runs once per page load, but the component
// remounts fresh each time you switch to this tab.

// How long the hands need to be absent from frame before the sentence
// auto-speaks — this is the trigger you asked for: keep signing and words
// keep accumulating, then drop your hands when the sentence is complete
// and it speaks. Long enough that briefly repositioning your hand between
// signs doesn't falsely trigger it, short enough it doesn't feel laggy.
const HANDS_ABSENT_SPEAK_MS = 900;

export function LiveInterpreter() {
  const signLabelById = Object.fromEntries(getAllWords().map((w) => [w.id, w.label]));


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

  const { handLandmarker, isLoading: modelLoading } = useHandLandmarker();
  const [cameraStatus, setCameraStatus] = useState("requesting");
  const [templateLibrary, setTemplateLibrary] = useState(null);
  const [templateCount, setTemplateCount] = useState(0);

  const [liveStatus, setLiveStatus] = useState("watching"); // watching | capturing | recognized | rejected
  const [bufferedMs, setBufferedMs] = useState(0);
  const [liveWord, setLiveWord] = useState(null); // { signId, confidence }
  const [sentenceWords, setSentenceWords] = useState([]); // array of signIds
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoGrammarEnabled, setAutoGrammarEnabled] = useState(true);

  async function loadTemplates() {
    const recordings = await getAllRecordings();
    setTemplateLibrary(buildTemplateLibrary(recordings));
    setTemplateCount(recordings.length);
  }

  useEffect(() => {
    loadTemplates();
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
    if (!handLandmarker || cameraStatus !== "ready" || !templateLibrary) return;

    segmenterRef.current = createSegmenter();

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);
    const HAND_COLORS = ["#2DE2E6", "#FFB627"];

    // Recordings were captured already in position (the countdown gave
    // time to get set before the 2-second window started), so they
    // mostly contain the clean, held sign. Live segments have no such
    // luxury — they capture the raise-your-hand-into-position motion at
    // the very start too, which the templates never had to deal with.
    // Trimming to the final ~2 seconds biases toward the settled,
    // comparable portion instead of the whole raw buffer.
    function trimToRecentWindow(frames, targetMs = 2000, estimatedFps = 30) {
      const targetFrameCount = Math.round((targetMs / 1000) * estimatedFps);
      if (frames.length <= targetFrameCount) return frames;
      return frames.slice(frames.length - targetFrameCount);
    }

    function handleSegmentReady(rawSegmentFrames) {
      const segmentFrames = trimToRecentWindow(rawSegmentFrames);
      const normalized = normalizeSequence(segmentFrames);
      const result = classifySequence(normalized, templateLibrary, {
        landmarkWeight: fingertipWeighted,
      });

      if (result.signId && result.confidence >= CONFIDENCE_THRESHOLD) {
        setLiveStatus("recognized");
        setLiveWord({ signId: result.signId, confidence: result.confidence });

        // Don't let the same sign register twice in a row — if someone
        // holds a static sign a beat too long, the segmenter can
        // legitimately fire again for the exact same sign. Recognizing it
        // again is fine and expected; growing the sentence with a
        // duplicate word is not. A genuine repeat (saying a number twice
        // on purpose, say) just means briefly dropping your hand out of
        // frame between them, which naturally resets this.
        const lastWord = sentenceWordsRef.current[sentenceWordsRef.current.length - 1];
        if (result.signId !== lastWord) {
          setSentenceWords((prev) => [...prev, result.signId]);
        }
      } else {
        setLiveStatus("rejected");
        setLiveWord(null);
      }
    }

    function onFrame(nowMs) {
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const result = handLandmarker.detectForVideo(video, nowMs);

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        result.landmarks.forEach((landmarks, idx) => {
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: HAND_COLORS[idx % HAND_COLORS.length],
            lineWidth: 3,
          });
          drawingUtils.drawLandmarks(landmarks, { color: "#FF4D6D", lineWidth: 1, radius: 4 });
        });
        canvasCtx.restore();

        const segEvent = segmenterRef.current.pushFrame(result.landmarks, nowMs);
        if (segEvent.event === "segment-ready") {
          handleSegmentReady(segEvent.segmentFrames);
          setBufferedMs(0);
        }

        if (result.landmarks.length === 0) {
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
          // Hands are back in frame — reset so the next time they leave
          // can trigger speech again.
          handsAbsentSinceRef.current = null;
          hasTriggeredSpeechForAbsenceRef.current = false;

          if (segEvent.event !== "segment-ready" && segmenterRef.current.getStateLabel() === "accumulating") {
            setLiveStatus("capturing");
            setBufferedMs(segmenterRef.current.getBufferedMs(nowMs));
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
  }, [handLandmarker, cameraStatus, templateLibrary]);

  function speakSentence() {
    setSentenceWords((current) => {
      if (current.length === 0) return current;
      const phrases = buildSpokenPhrases(current, { autoGrammar: autoGrammarEnabledRef.current });
      const text = phrasesToSpeechText(phrases);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      // Clear after speaking — this was the bug causing repeated
      // sentences: the words previously stayed in the list, so the next
      // trigger re-spoke everything from the start plus whatever was new.
      return [];
    });
  }

  function clearSentence() {
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
    <div ref={rootRef} className="w-full max-w-4xl mx-auto flex flex-col gap-5">
      <div className="relative w-full max-w-2xl mx-auto aspect-video bg-white/[0.03] rounded-lg overflow-hidden border border-white/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />

        {isSpeaking && (
          <div className="absolute top-3 right-3 rounded-md bg-black/60 px-3 py-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#2DE2E6] animate-pulse" />
            <span className="text-xs font-mono text-[#2DE2E6]">Speaking…</span>
          </div>
        )}
      </div>

      {(modelLoading || !templateLibrary) && (
        <p className="text-center text-sm text-slate-400">Loading recognizer…</p>
      )}

      {templateLibrary && templateCount === 0 && (
        <p className="text-center text-sm text-amber-300">
          No recorded signs found yet — go record some in the "Record Signs"
          tab first.
        </p>
      )}

      {/* Live recognition status */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col items-center gap-2 min-h-24">
        {liveStatus === "watching" && (
          <span className="text-sm text-slate-500">
            Watching for a sign… (lower your hands when your sentence is complete to speak it)
          </span>
        )}
        {liveStatus === "capturing" && (
          <div className="flex flex-col items-center gap-2 w-full">
            <span className="text-sm text-[#FFB627] font-mono">
              Capturing… {(bufferedMs / 1000).toFixed(1)}s
            </span>
            <div className="w-48 h-1.5 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full bg-[#FFB627]"
                style={{ width: `${Math.min(100, (bufferedMs / 1200) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-600">
              hold still briefly once you finish the sign
            </span>
          </div>
        )}
        {liveStatus === "rejected" && (
          <span className="text-sm text-amber-400">Not recognized — try again</span>
        )}
        {liveStatus === "recognized" && liveWord && (
          <div ref={liveWordRef} className="flex flex-col items-center gap-2 w-full">
            <span
              className="text-2xl font-bold text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {signLabelById[liveWord.signId] || liveWord.signId}
            </span>
            <div className="w-48 h-1.5 rounded-full bg-black/40 overflow-hidden">
              <div ref={confidenceBarRef} className="h-full bg-[#2DE2E6]" style={{ width: "0%" }} />
            </div>
            <span className="text-xs font-mono text-slate-500">
              {Math.round(liveWord.confidence * 100)}% confidence
            </span>
          </div>
        )}
      </div>

      {/* Building sentence */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-500">
          Signed so far
        </span>
        <div className="flex flex-wrap gap-2 min-h-10">
          {sentenceWords.length === 0 && (
            <span className="text-sm text-slate-600">Nothing yet — start signing.</span>
          )}
          {sentenceWords.map((signId, idx) => (
            <span
              key={idx}
              ref={idx === sentenceWords.length - 1 ? wordChipRef : null}
              className="rounded-md bg-black/40 border border-white/10 px-3 py-1 text-sm text-slate-200"
            >
              {signLabelById[signId] || signId}
            </span>
          ))}
        </div>

        <span className="text-xs uppercase tracking-wide text-slate-500 mt-2">
          Will be spoken as
        </span>
        <p className="text-slate-200 italic min-h-6">
          {previewText || <span className="text-slate-600 not-italic">—</span>}
        </p>
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
        <button
          onClick={() => setAutoGrammarEnabled((v) => !v)}
          className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors flex items-center gap-2 ${
            autoGrammarEnabled
              ? "bg-[#2DE2E6]/10 border-[#2DE2E6]/40 text-[#2DE2E6]"
              : "bg-white/5 border-white/15 text-slate-400"
          }`}
          title="When off, recognized signs are spoken back literally instead of being auto-expanded into full sentences (e.g. 'food' stays 'Food' instead of becoming 'I need food') — so you can compose your own custom phrasing during a demo."
        >
          <span className={`w-2 h-2 rounded-full ${autoGrammarEnabled ? "bg-[#2DE2E6]" : "bg-slate-600"}`} />
          Auto sentences: {autoGrammarEnabled ? "On" : "Off"}
        </button>
        <button
          onClick={speakSentence}
          disabled={sentenceWords.length === 0}
          className="rounded-md bg-[#FF4D6D] px-5 py-2 font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🔊 Speak Now
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
  );
}
