import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { useInViewReveal } from '../lib/anim.jsx'

/* 3D skeleton replay mock - 2D canvas drawing a hand skeleton cycling through frames */
function SkeletonReplay() {
  const canvasRef = useRef(null)
  const raf = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = 300, H = 220
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const base = [
      [150, 200], [128, 158], [106, 140], [92, 126], [82, 112],
      [155, 150], [158, 118], [160, 96], [162, 80],
      [175, 148], [178, 112], [179, 88], [180, 72],
      [193, 152], [198, 120], [200, 100], [201, 86],
      [208, 158], [214, 134], [217, 118], [219, 106],
    ]
    const bones = [
      [1, 0], [2, 1], [3, 2], [4, 3], [5, 0], [6, 5], [7, 6], [8, 7],
      [9, 0], [10, 9], [11, 10], [12, 11], [13, 0], [14, 13], [15, 14], [16, 15],
      [17, 0], [18, 17], [19, 18], [20, 19], [0, 9], [9, 13], [13, 17],
    ]

    let t0 = performance.now()
    const draw = (now) => {
      const t = (now - t0) / 1000
      ctx.clearRect(0, 0, W, H)

      const pts = base.map(([x, y], i) => [
        x + Math.sin(t * 2.4 + i * 0.55) * (i > 4 ? 4 : 2),
        y + Math.cos(t * 2.4 + i * 0.4) * (i > 4 ? 5 : 2),
      ])

      ctx.strokeStyle = 'rgba(245,158,11,0.75)'
      ctx.lineWidth = 1.6
      ctx.shadowColor = 'rgba(245,158,11,0.5)'
      ctx.shadowBlur = 6
      for (const [c, p] of bones) {
        ctx.beginPath()
        ctx.moveTo(pts[c][0], pts[c][1])
        ctx.lineTo(pts[p][0], pts[p][1])
        ctx.stroke()
      }
      ctx.shadowBlur = 0
      for (let i = 0; i < 21; i++) {
        ctx.fillStyle = i % 4 === 0 ? '#2dd4bf' : '#ffb703'
        ctx.beginPath()
        ctx.arc(pts[i][0], pts[i][1], 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div className="relative rounded-[1.4rem] border border-white/10 bg-black/40 overflow-hidden">
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-bio-cyan/40 to-transparent" />
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="font-mono-tech text-[9.5px] uppercase tracking-[0.18em] text-neutral-500">replay · gesture_0142.json</span>
        <span className="font-mono-tech text-[9.5px] text-bio-cyan">LIVE</span>
      </div>
      <canvas ref={canvasRef} style={{ width: 300, height: 220 }} className="w-full" />
    </div>
  )
}

/* 15-rep countdown tracker with progress ring */
function RepTracker() {
  const [reps, setReps] = useState(6)
  const [running, setRunning] = useState(true)
  const pct = reps / 15

  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => {
      setReps((r) => {
        if (r >= 15) return 0
        return r + 1
      })
    }, 1800)
    return () => clearInterval(iv)
  }, [running])

  const R = 46
  const C = 2 * Math.PI * R

  return (
    <div className="flex items-center gap-6 rounded-[1.4rem] border border-white/10 bg-black/40 px-6 py-5">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle cx="55" cy="55" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
          <circle
            cx="55" cy="55" r={R} fill="none"
            stroke="url(#repGrad)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.32, 0.72, 0, 1)' }}
          />
          <defs>
            <linearGradient id="repGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#ffb703" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular">{reps}<span className="text-neutral-500 text-base">/15</span></span>
          <span className="text-[9px] uppercase tracking-[0.16em] text-neutral-500">reps</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-neutral-200">Hold the sign, release, repeat.</div>
        <div className="text-[11.5px] text-neutral-500 mt-1.5 leading-relaxed">
          The recorder counts clean repetitions automatically and discards partial captures.
        </div>
        <button
          onClick={() => setRunning((r) => !r)}
          className="mt-3 font-mono-tech text-[10px] uppercase tracking-[0.16em] text-bio-cyan border border-bio-cyan/30 rounded-full px-3 py-1.5 hover:bg-bio-cyan/10 transition-colors"
        >
          {running ? 'Pause' : 'Resume'} capture
        </button>
      </div>
    </div>
  )
}

/* JSON export button with tactile ripple + click sound (WebAudio, no assets) */
function ExportButton() {
  const ref = useRef(null)
  const click = useCallback(() => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      const ctx = click._ctx || (click._ctx = new AC())
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(880, ctx.currentTime)
      o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12)
      g.gain.setValueAtTime(0.08, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.15)
    } catch { /* audio blocked - silent fallback */ }
  }, [])

  const ripple = (e) => {
    click()
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const d = document.createElement('span')
    d.className = 'ripple'
    d.style.left = `${e.clientX - r.left}px`
    d.style.top = `${e.clientY - r.top}px`
    d.style.width = '40px'
    d.style.height = '40px'
    el.appendChild(d)
    setTimeout(() => d.remove(), 700)
  }

  return (
    <button
      ref={ref}
      onClick={ripple}
      className="relative overflow-hidden rounded-full bg-gradient-to-b from-amber-bright to-bronze text-black font-semibold text-[13.5px] px-5 py-3 flex items-center gap-2.5 active:scale-[0.98] transition-transform will-change-transform"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Export JSON dataset
    </button>
  )
}

export default function DatasetStudio() {
  const headRef = useRef(null)
  const gridRef = useRef(null)
  useInViewReveal(headRef, { y: 34 })
  useInViewReveal(gridRef, { y: 46, delay: 0.12 })

  return (
    <section id="dataset" className="relative py-28 md:py-36 px-6 md:px-10">
      <div className="max-w-[1400px] mx-auto">
        <div ref={headRef} className="max-w-2xl mb-14">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08]">
            Record your vocabulary.
            <span className="text-amber-bright"> Own the dataset.</span>
          </h2>
          <p className="mt-5 text-neutral-400 text-[15px] leading-relaxed max-w-[58ch]">
            A built-in studio captures, replays, and exports your signs as structured JSON.
            Everything stays in your local store: portable, versionable, yours.
          </p>
        </div>

        <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          <div className="space-y-6">
            <SkeletonReplay />
            <ExportButton />
          </div>
          <RepTracker />
        </div>
      </div>
    </section>
  )
}
