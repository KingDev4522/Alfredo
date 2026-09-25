import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSignStream } from '../hooks/useSignStream';
import { API_BASE_URL } from '../lib/supabaseClient';
import { Avatar } from './Avatar';
import { useAuth } from '../hooks/useAuth';

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
  const [sentence, setSentence] = useState([]);
  
  const [isListening, setIsListening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
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

  const handleFileProcess = async (droppedFile = null) => {
    if (isBusy) return;
    const fileToProcess = droppedFile || selectedFile;
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

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      const validExts = ['pdf', 'docx', 'txt', 'mp4', 'mkv', 'wav', 'mp3'];
      const ext = file.name.split('.').pop().toLowerCase();
      
      if (validExts.includes(ext)) {
        setSelectedFile(file);
        handleFileProcess(file);
      } else {
        setToast({ message: `Invalid file type: .${ext}`, type: 'error' });
      }
    }
  };



  return (
    <div className="cyber-media-grid relative grid w-full max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">

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
      {/* Drag & Drop Canvas Wrapper */}
      <div
        className="cyber-media-stage relative min-h-[320px] w-full overflow-hidden border border-white/10 bg-[#050505] lg:h-[58vh] lg:aspect-auto lg:min-h-0"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-[#55F6E5] bg-black/80 p-6 text-center">
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.16em] text-[#55F6E5]">
              Drop file to process
            </span>
          </div>
        )}

        <Canvas
          // 1. CAMERA POSITION: [x, y, z]
          // Increase the middle number (y) to move the camera higher up.
          // Decrease the last number (z) to zoom in closer.
          camera={{ position: [0, 2.5, 3.8], fov: 40 }}
          dpr={Math.min(window.devicePixelRatio, 1.5)}
          gl={{ powerPreference: "high-performance", antialias: true, alpha: false }}
        >
          {/* BACKGROUND COLOR: change the hex code below to adjust the gray */}
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1.5} />

          {/* 2. CAMERA TARGET: [x, y, z] */}
          {/* This is what the camera is "looking at". Increase the middle number (y) to look higher up at the chest/head. */}
          {/* Phase 4C: OrbitControls locked so visual framing perfectly matches backend collision math */}
          <OrbitControls target={[0, 2.5, 0]} enableZoom={false} enablePan={false} />

          <React.Suspense fallback={null}>
            <Avatar
              signStream={signStream}
              onActiveWordChange={setActiveSign}
            />
          </React.Suspense>
        </Canvas>

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
      <div className="flex flex-col gap-4 min-w-0">
      {/* Original Input Context Panel */}
      {jobContext && (
        <div className="cyber-panel flex min-h-[60px] w-full flex-col justify-center p-4">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Original Input Context</h3>
          <p className="text-slate-200 text-lg leading-snug">{jobContext}</p>
        </div>
      )}

      {/* Sentence Accumulator Panel */}
      <div className="cyber-panel min-h-[80px] w-full p-6">
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

      {/* UX State Machine & Pipeline Progress */}
      <div className="cyber-panel flex flex-col gap-3 p-4">
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
                className="h-full bg-[#FFB000] transition-all duration-300"
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
        <div className="grid w-full grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-5">
          {['idle', 'uploading', 'transcribing', 'translating', 'streaming'].map((state) => (
             <div key={state} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${processState === state ? 'text-[#55F6E5] drop-shadow-[0_0_5px_rgba(85,246,229,0.5)]' : 'text-slate-600'}`}>
                <div className={`w-2 h-2 rounded-full ${processState === state ? 'bg-[#55F6E5] shadow-[0_0_8px_#55F6E5]' : 'bg-slate-700'}`} />
                {state}
             </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="cyber-panel flex flex-col gap-4 p-4">
        
        {isAdmin && (
          <div className="flex flex-col justify-between gap-3 border border-[#FFB000]/35 bg-black p-3 sm:flex-row sm:items-center">
            <div>
              <span className="cyber-page__eyebrow !mb-1">Admin tool</span>
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

        <form onSubmit={handleYoutubeSubmit} className="grid gap-2">
          <label className="cyber-login__label" htmlFor="youtube-url">
            YouTube source
          </label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              id="youtube-url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              disabled={isBusy}
              className="cyber-field"
            />
            <button
              type="submit"
              disabled={isBusy || !youtubeUrl}
              className="cyber-button cyber-button--primary"
            >
              Translate
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

        <form onSubmit={handleTextSubmit} className="mt-2 grid gap-2">
          <label className="cyber-login__label" htmlFor="translation-text">
            Text input // Ctrl+Enter to submit
          </label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <textarea
              id="translation-text"
              placeholder="Enter text to translate"
              value={textContent}
              onChange={(event) => setTextContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.key === "Enter") handleTextSubmit(event);
              }}
              disabled={isBusy}
              className="cyber-field min-h-28 resize-y"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
              <button
                type="button"
                onClick={toggleListening}
                disabled={isBusy}
                className={`cyber-button ${isListening ? "cyber-button--primary animate-pulse" : ""}`}
                title="Voice dictation"
                aria-pressed={isListening}
              >
                {isListening ? "Listening" : "Dictate"}
              </button>
              <button
                type="submit"
                disabled={isBusy || !textContent}
                className="cyber-button cyber-button--primary"
              >
                Translate
              </button>
            </div>
          </div>
        </form>

        <div className="mt-2 grid gap-2">
          <label className="cyber-login__label" htmlFor="translation-file">
            Media or document input
          </label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              id="translation-file"
              type="file"
              accept=".pdf,.docx,.txt,.mp4,.mkv,.wav,.mp3"
              onChange={(event) => setSelectedFile(event.target.files[0])}
              disabled={isBusy}
              className="cyber-field file:mr-3 file:border-0 file:bg-[#FFB000] file:px-3 file:py-1.5 file:text-[#050505]"
            />
            <button
              type="button"
              onClick={() => handleFileProcess()}
              disabled={isBusy || !selectedFile}
              className="cyber-button cyber-button--primary"
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
      </div>

    </div>
  );
}
