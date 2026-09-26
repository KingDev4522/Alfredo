import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { useSignStream } from '../hooks/useSignStream';
import { API_BASE_URL } from '../lib/supabaseClient';
import { Avatar } from './Avatar';
import { useAuth } from '../hooks/useAuth';
import { PanelGlow } from './PanelGlow';

/*
 * Framing for the avatar stage.
 *
 * The camera used to sit at a hardcoded [0, 2.65, 3.5] with a fixed target, so
 * the model was framed for one container shape and overflowed any other. This
 * derives the distance from the model's own bounds and the live aspect ratio,
 * so the same framing holds in the 320px mobile box and the 58vh desktop panel.
 *
 * The box is the upper body plus headroom, because a sign can put the hands
 * above the crown: measured on this GLB the head sits at y=3.07 and the crown
 * at y=3.40, and the A and B takes drive the wrists to y=3.65. Framing only to
 * the head would clip them, so FRAME_TOP leaves room for a raised arm.
 */
const FRAME_BOTTOM = 1.45;   // mid-torso, below the waist
const FRAME_TOP = 3.80;      // above the crown, clears a raised hand
const FRAME_HALF_WIDTH = 0.85; // clears the arms at the elbow
const FRAME_MARGIN = 1.14;   // breathing room, as a multiplier
const MIN_DISTANCE = 1.6;
const MAX_DISTANCE = 9;

/* User-facing size multiplier on the fitted camera distance. Below 1 pulls the
   camera in and the avatar appears larger, above 1 pushes it back. The floor is
   0.9 because the fit is computed for a 2.35 m box, and the real content
   spans 1.45 to 3.70 (2.25 m, the top being the highest wrist in the A and B
   takes): below about 0.9 a raised hand would be cut off at the top edge.
   Verified by scripts/verify_stage_framing.mjs, which checks seven container
   shapes from 300x600 to 1600x520. */
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.15;

const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/*
 * Positions the camera and keeps the OrbitControls target on the model. `zoom`
 * is a user multiplier on the fitted distance, so "bigger" and "smaller" keep
 * the framing centred instead of drifting off the model.
 */
function FitModel({ zoom, targetRef }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const fit = useCallback(() => {
    const aspect = size.width / Math.max(1, size.height);
    const fovRad = ((camera.fov || 40) * Math.PI) / 180;

    const boxHeight = (FRAME_TOP - FRAME_BOTTOM) * FRAME_MARGIN;
    const boxWidth = FRAME_HALF_WIDTH * 2 * FRAME_MARGIN;

    // vertical fit, and horizontal fit when the container is narrow
    const distForHeight = boxHeight / (2 * Math.tan(fovRad / 2));
    const distForWidth = boxWidth / (2 * Math.tan(fovRad / 2) * aspect);
    const dist = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, Math.max(distForHeight, distForWidth) * zoom));

    const centreY = (FRAME_TOP + FRAME_BOTTOM) / 2;
    camera.position.set(0, centreY, dist);
    camera.near = Math.max(0.05, dist / 100);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    camera.lookAt(0, centreY, 0);

    if (targetRef.current) {
      targetRef.current.target.set(0, centreY, 0);
      targetRef.current.update();
    }
    invalidate();
  }, [camera, size.width, size.height, zoom, invalidate, targetRef]);

  useEffect(() => {
    fit();
  }, [fit]);

  return null;
}

export function MediaInterpreter() {
  const { isAdmin } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  // UX State Machine: 'idle' | 'uploading' | 'transcribing' | 'translating' | 'streaming'
  const [processState, setProcessState] = useState('idle');
  const isBusy = processState !== 'idle';
  const [jobContext, setJobContext] = useState(null);
  
  const [activeSign, setActiveSign] = useState(null);
  // Avatar on-screen size, as a multiplier on the fitted camera distance.
  const [zoom, setZoom] = useState(1);
  const controlsRef = useRef(null);
  const [sentence, setSentence] = useState([]);
  
  const [isListening, setIsListening] = useState(false);
  
  // Global Toast System
  const [toast, setToast] = useState(null); // { message: string, type: 'error' | 'success' }

  const recognitionRef = useRef(null);
  const progressRef = useRef(null);

  const signStream = useSignStream();
  const fileInputRef = useRef(null);

  // Auto-clear Toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  
  // Update processState based on stream status and playback status
  useEffect(() => {
    if (signStream.status === 'connected' || signStream.status === 'playing') {
      setProcessState('streaming');
    } else if (signStream.status === 'disconnected') {
      if (!activeSign) {
        setProcessState('idle');
      }
    }
  }, [signStream.status, activeSign]);

  // Sentence Accumulator
  useEffect(() => {
    if (activeSign && activeSign.word) {
      setSentence(prev => {
        if (prev.length > 0) {
           const lastItem = prev[prev.length - 1];
           if (activeSign.chunk_id !== undefined && lastItem.chunkId === activeSign.chunk_id) {
               return prev;
           } else if (activeSign.chunk_id === undefined && lastItem.word === activeSign.word) {
               return prev;
           }
        }
        return [...prev, { word: activeSign.word, chunkId: activeSign.chunk_id || Date.now() }];
      });
    }
  }, [activeSign]);

  // Browser-Native Audio Synchronization (TTS)
  useEffect(() => {
    if (activeSign && activeSign.word) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(activeSign.word);
      window.speechSynthesis.speak(utterance);
    }
  }, [activeSign]);

  // Dynamic Progress Timer Animation
  useEffect(() => {
    if (activeSign && progressRef.current) {
      progressRef.current.style.transition = 'none';
      progressRef.current.style.width = '0%';
      void progressRef.current.offsetWidth; // Force reflow
      
      const framesLength = activeSign.frames ? activeSign.frames.length : 30;
      const durationMs = (activeSign.duration_ms || 33) * framesLength;
      
      progressRef.current.style.transition = `width ${durationMs}ms linear`;
      progressRef.current.style.width = '100%';
    }
  }, [activeSign]);

  // Edge-Native Voice Dictation Setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
           setTextContent((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (e) => {
        console.error("Speech recognition error:", e);
        setIsListening(false);
        setToast({ message: "Speech recognition error", type: 'error' });
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
    return () => {
      if (recognition) {
        recognition.abort();
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }
      recognitionRef.current = null;
    };
  }, []);

  // Chrome throws TypeError "Failed to fetch", Firefox throws a
  // "NetworkError" DOMException - treat every TypeError/fetch failure as
  // backend-offline so the toast tells the user to start :8000.
  const isOfflineError = (err) =>
    err instanceof TypeError ||
    (typeof err?.message === 'string' &&
      (/failed to fetch|networkerror|network error|fetch/i.test(err.message)));

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setToast({ message: "Speech recognition not supported in this browser.", type: 'error' });
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Could not start speech recognition:", e);
        setToast({ message: "Could not start speech recognition", type: 'error' });
      }
    }
  };

  const handleYoutubeSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isBusy) return;
    if (!youtubeUrl) return;
    
    setProcessState('uploading');
    setSentence([]);
    setJobContext(`YouTube: ${youtubeUrl}`);
    signStream.disconnect();
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/process-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      });
      
      if (!res.ok) throw new Error("Failed to process YouTube video");
      
      setProcessState('translating');
      const data = await res.json();
      const job_id = data.job_id;
      signStream.connect(job_id);
    } catch (err) {
      console.error(err);
      const isOffline = isOfflineError(err);
      setToast({ message: isOffline ? 'Backend offline. Start it locally on http://localhost:8000' : (err.message || "Operation failed"), type: 'error' });
      setProcessState('idle');
    }
  };

  const handleTextSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isBusy) return;
    if (!textContent) return;

    setProcessState('translating');
    setSentence([]);
    setJobContext(textContent);
    signStream.disconnect();
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/process-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textContent })
      });
      
      if (!res.ok) throw new Error("Failed to process text");
      
      const data = await res.json();
      const job_id = data.job_id;
      signStream.connect(job_id);
    } catch (err) {
      console.error(err);
      const isOffline = isOfflineError(err);
      setToast({ message: isOffline ? 'Backend offline. Start it locally on http://localhost:8000' : (err.message || "Operation failed"), type: 'error' });
      setProcessState('idle');
    }
  };

  const handleFileProcess = async () => {
    if (isBusy) return;
    const fileToProcess = selectedFile;
    if (!fileToProcess) return;

    setProcessState('uploading');
    setSentence([]);
    setJobContext(`File: ${fileToProcess.name}`);
    signStream.disconnect();

    const formData = new FormData();
    formData.append('file', fileToProcess);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload-doc`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error("Failed to process document");
      
      setProcessState('translating');
      const data = await res.json();
      const job_id = data.job_id;
      signStream.connect(job_id);
    } catch (err) {
      console.error(err);
      const isOffline = isOfflineError(err);
      setToast({ message: isOffline ? 'Backend offline. Start it locally on http://localhost:8000' : (err.message || "Operation failed"), type: 'error' });
      setProcessState('idle');
    }
  };

  const handleImportDictionary = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonContent = JSON.parse(event.target.result);
        const res = await fetch(`${API_BASE_URL}/api/import-poses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonContent)
        });
        
        if (!res.ok) throw new Error("Failed to import dictionary");
        
        setToast({ message: "Dictionary Imported Successfully", type: 'success' });
      } catch (err) {
        console.error("Dictionary import error:", err);
        setToast({ message: err.message || "Failed to import dictionary", type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  // There is no drag-and-drop target on the avatar stage. Dropping a file onto
  // a 3D viewport is a poor affordance: it is invisible until you happen to
  // drag over the canvas, the stage is also the orbit/zoom surface, and the
  // only feedback is a full-bleed overlay that hides the avatar. Files are
  // chosen through the labelled "Media or document input" control instead,
  // which is visible, keyboard reachable, and announces the accepted types.



  /*
   * lg:gap-12 is the point of the root grid. The stage and the work column
   * are two separate instruments, not two halves of one card, and at the
   * default 20px gutter the avatar read as part of the control stack. 48px
   * on desktop gives the model its own space; gap-6 still applies when the
   * columns stack on narrow screens. The column ratio is left at 1.12/0.88
   * so the stage framing is unchanged.
   */
  return (
      <div className="ref-page relative grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-12">


      {/* Global Toast Notification */}
      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 border px-4 py-3 font-mono text-xs ${
            toast.type === 'error'
              ? 'border-[#FFB000] bg-black text-[#FFB000]'
              : 'border-[#C8FF00] bg-black text-[#C8FF00]'
          }`}
        >
          <span>{toast.type === 'error' ? '[!]' : '[OK]'}</span>
          <span className="font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Visual column: 3D avatar stage */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 min-w-0">
      {/* Avatar stage. Not a drop target: see the note by the file input.
          gi-stage pins this panel back to solid black in index.css so the
          glass pass does not repaint the WebGL viewport. Nothing inside the
          Canvas is touched. */}
      <div
        className="ref-panel gi-stage relative min-h-[340px] w-full overflow-hidden bg-black sm:min-h-[420px] lg:h-[62vh] lg:aspect-auto lg:min-h-0"
      >

        <Canvas
          camera={{ position: [0, 2.6, 3.5], fov: 40 }}
          dpr={Math.min(window.devicePixelRatio, 1.5)}
          gl={{ powerPreference: "high-performance", antialias: true, alpha: false }}
        >
          <color attach="background" args={['#07080a']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1.5} />

          {/*
            Gridded backdrop. A flat black wall gives no depth cue at all, so
            the silhouette reads as a cut-out and there is no way to tell a hand
            held in front of the chest from one held behind the back. A receding
            grid gives the floor plane and a sense of near/far, and the cell
            lines make the model's outline easy to read against it.
            cellSize 0.25 m against a 0.5936 m shoulder span, so the squares are
            a known reference for judging how big the avatar is on screen.
          */}
          <Grid
            position={[0, 0, 0]}
            args={[40, 40]}
            cellSize={0.25}
            cellThickness={0.6}
            cellColor="#2a3038"
            sectionSize={1.25}
            sectionThickness={1.1}
            sectionColor="#3d4652"
            fadeDistance={26}
            fadeStrength={1.6}
            followCamera={false}
            infiniteGrid
          />

          {/* Upper-body view: waist-up through raised hands, framed to the model */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={false}
            enableZoom={false}
            minDistance={MIN_DISTANCE}
            maxDistance={MAX_DISTANCE}
            enableDamping
            dampingFactor={0.08}
            target={[0, 2.6, 0]}
          />
          <FitModel zoom={zoom} targetRef={controlsRef} />

          <React.Suspense fallback={null}>
            <Avatar
              signStream={signStream}
              onActiveWordChange={setActiveSign}
            />
          </React.Suspense>
        </Canvas>

        {/*
          Size control. The canvas previously had enableZoom={false} and no UI
          at all, so the on-screen size of the avatar could not be changed by
          anyone. zoom multiplies the fitted camera distance, so the model stays
          centred and only its apparent size changes.
        */}
        <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 border border-white/15 bg-black/80 p-1 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Make the avatar smaller"
              className="h-7 w-7 border border-white/15 text-sm leading-none text-neutral-300 transition-colors hover:border-[#55F6E5] hover:text-[#55F6E5] disabled:cursor-not-allowed disabled:opacity-35"
            >
              &minus;
            </button>
            <label className="sr-only" htmlFor="avatar-zoom">Avatar size</label>
            <input
              id="avatar-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1 w-28 cursor-pointer appearance-none bg-white/15 accent-[#55F6E5]"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Make the avatar larger"
              className="h-7 w-7 border border-white/15 text-sm leading-none text-neutral-300 transition-colors hover:border-[#55F6E5] hover:text-[#55F6E5] disabled:cursor-not-allowed disabled:opacity-35"
            >
              +
            </button>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            size {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="border border-white/15 bg-black/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400 backdrop-blur-sm transition-colors hover:border-[#55F6E5] hover:text-[#55F6E5]"
          >
            Reset
          </button>
        </div>

        {activeSign && activeSign.word && (
          <div className="absolute bottom-6 left-6 pointer-events-none z-10">
            <div className="relative inline-block overflow-hidden border border-[#FFB000]/50 bg-black px-6 py-3">
              <span className={`text-3xl font-bold relative z-10 ${activeSign.isFingerspelling ? 'text-[#C8FF00] tracking-[0.3em]' : 'text-[#55F6E5]'}`}>
                {activeSign.isFingerspelling ? `F-I-N-G-E-R-S-P-E-L-L-I-N-G: ${activeSign.word}` : activeSign.word}
              </span>
              <div 
                ref={progressRef}
                className="absolute bottom-0 left-0 h-1 bg-[#55F6E5] opacity-80"
                style={{ width: '0%' }}
              />
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Content column: context, transcript, pipeline, controls */}
      {/*
        gap-5, not gap-4. These four cards carry the densest content on the
        page — three form rows, a progress meter and a five-state rail — and
        at 16px the stack read as one block with hairline seams rather than
        as separate cards. The column also got a little wider: 0.96fr
        against the stage's 1.04fr, which is enough to stop the input rows
        from being squeezed without meaningfully re-framing the avatar.
      */}
      <div className="flex flex-col gap-5 min-w-0">
      {/* Original Input Context Panel */}
      {jobContext && (
        <PanelGlow className="gi-glow--center min-h-[68px]">
          <div className="flex flex-col justify-center p-5 sm:p-6">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Original Input Context</h3>
            <p className="text-slate-200 text-lg leading-snug">{jobContext}</p>
          </div>
        </PanelGlow>
      )}

      {/* Sentence Accumulator Panel */}
      <PanelGlow>
      <div className="min-h-[96px] w-full p-5 sm:p-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Live Transcript</h3>
        <div className="flex flex-wrap gap-x-2 gap-y-3">
          {sentence.map((item, index) => {
            const isActive = activeSign && activeSign.chunk_id !== undefined 
                ? activeSign.chunk_id === item.chunkId 
                : activeSign && activeSign.word === item.word;
            
            return (
              <span 
                key={`${item.chunkId}-${index}`} 
                className={`text-xl font-medium transition-all duration-300 ${
                  isActive 
                    ? 'text-[#55F6E5] drop-shadow-[0_0_8px_rgba(85,246,229,0.8)]'
                    : 'text-slate-400'
                }`}
              >
                {item.word}
              </span>
            );
          })}
          {sentence.length === 0 && <span className="text-slate-600 text-xl font-medium italic">Waiting for translation...</span>}
        </div>
      </div>
      </PanelGlow>

      {/* UX State Machine & Pipeline Progress */}
      <PanelGlow>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Pipeline Progress</span>
              <span>{signStream.progress}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden bg-black/40"
              role="progressbar"
              aria-label="Translation pipeline progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={signStream.progress}
            >
              <div 
                className="gi-bar-amber h-full bg-[#FFB000] transition-all duration-300"
                style={{ width: `${signStream.progress}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-slate-400 font-mono flex gap-3">
            <span>Stream: <span className="text-[#55F6E5]">{signStream.status}</span></span>
            <span>State: <span className="text-[#C8FF00] uppercase">{processState}</span></span>
          </div>
        </div>
        
        {/* State Machine Status Bar */}
        <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--ref-line)] pt-4 sm:grid-cols-5">
          {['idle', 'uploading', 'transcribing', 'translating', 'streaming'].map((state) => (
             <div key={state} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${processState === state ? 'text-[#55F6E5] drop-shadow-[0_0_5px_rgba(85,246,229,0.5)]' : 'text-slate-600'}`}>
                <div className={`w-2 h-2 rounded-full ${processState === state ? 'bg-[#55F6E5] shadow-[0_0_8px_#55F6E5]' : 'bg-slate-700'}`} />
                 {state}
              </div>
          ))}
        </div>
      </div>
      </PanelGlow>

      {/* Controls */}
      <PanelGlow>
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        
        {isAdmin && (
          <div className="flex flex-col justify-between gap-3 border border-[#FFB000]/35 bg-black p-3 sm:flex-row sm:items-center">
            <div>
              <span className="ss-eyebrow !mb-1">Admin tool</span>
              <span className="text-sm font-semibold text-slate-300">Master dictionary setup</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".json"
                ref={fileInputRef}
                onChange={handleImportDictionary}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                disabled={isBusy}
                className="border border-[#FFB000] bg-[#FFB000] px-4 py-2 text-xs font-semibold text-[#050505] disabled:opacity-50"
              >
                Import dictionary
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleYoutubeSubmit} className="grid gap-3">
          <label className="cyber-login__label" htmlFor="youtube-url">
            YouTube source
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              id="youtube-url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              disabled={isBusy}
              className="ref-field"
            />
            <button
              type="submit"
              disabled={isBusy || !youtubeUrl}
              className="ref-btn ref-btn--primary"
            >
              Translate
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

        <form onSubmit={handleTextSubmit} className="grid gap-3">
          <label className="cyber-login__label" htmlFor="translation-text">
            Text input // Ctrl+Enter to submit
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <textarea
              id="translation-text"
              placeholder="Enter text to translate"
              value={textContent}
              onChange={(event) => setTextContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.key === "Enter") handleTextSubmit(event);
              }}
              disabled={isBusy}
              className="ref-field min-h-28 resize-y"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
              <button
                type="button"
                onClick={toggleListening}
                disabled={isBusy}
                className={`ref-btn ${isListening ? "ref-btn--live" : ""}`}
                title="Voice dictation"
                aria-pressed={isListening}
              >
                {isListening ? "Listening" : "Dictate"}
              </button>              <button
                type="submit"
                disabled={isBusy || !textContent}
                className="ref-btn ref-btn--primary"
              >
                Translate
              </button>
            </div>
          </div>
        </form>

        <div className="grid gap-3">
          <label className="cyber-login__label" htmlFor="translation-file">
            Media or document input
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              id="translation-file"
              type="file"
              accept=".pdf,.docx,.txt,.mp4,.mkv,.wav,.mp3"
              onChange={(event) => setSelectedFile(event.target.files[0])}
              disabled={isBusy}
              className="ref-field file:mr-3 file:border-0 file:bg-[#FFB000] file:px-3 file:py-1.5 file:text-[#050505]"
            />
            <button
              type="button"
              onClick={() => handleFileProcess()}
              disabled={isBusy || !selectedFile}
              className="ref-btn ref-btn--primary"
            >
              Process
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <span className="text-xs text-[rgba(242,240,232,0.46)]">
            Available formats depend on the connected local backend.
          </span>
        </div>
      </div>
      </PanelGlow>
      </div>

    </div>
  );
}
