import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const STEPS = [
  {
    id: '01',
    title: 'Segment & Track',
    body: 'Motion segmentation splits continuous signing into discrete gestures. 21 landmarks per frame, 60 frames per second.',
    tech: 'MediaPipe · WASM',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 8h4l3 8 4-12 3 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: '02',
    title: 'DTW Recognition & FLAN-T5',
    body: 'Dynamic time warping matches gesture trajectories against your local template library. FLAN-T5 turns ISL gloss into grammatical English.',
    tech: 'DTW 0.36 · FLAN-T5',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 9h6M7 13h9M17 9h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12 17v3m-3 0h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: '03',
    title: 'Whisper & Speech Synthesis',
    body: 'Instantaneous neural voice broadcast. The sentence is spoken the moment the sign completes — no queue, no round-trip.',
    tech: 'Whisper · WebAudio',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 10v4h3l4 4V6L7 10H4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M15 9c1.2 1 1.2 5 0 6M18 7c2.2 2 2.2 8 0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

function PipelineCard({ step, index }) {
  return (
    <article
      className={`pstep shrink-0 w-[86vw] sm:w-[62vw] lg:w-[44vw] max-w-[640px] glass-card rounded-[2rem] p-2 ${
        index === 1 ? 'lg:mt-16' : index === 2 ? 'lg:mt-32' : ''
      }`}
    >
      <div className="rounded-[calc(2rem-0.5rem)] bg-neutral-950/55 p-7 md:p-10 h-full flex flex-col min-h-[46dvh] lg:min-h-[52dvh]">
        <div className="flex items-start justify-between">
          <span className="w-11 h-11 rounded-full bg-amber-glow/12 border border-amber-glow/25 text-amber-bright flex items-center justify-center">
            {step.icon}
          </span>
          <span className="font-mono-tech text-[64px] md:text-[84px] leading-none font-bold text-white/6 select-none">
            {step.id}
          </span>
        </div>
        <h3 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-4 text-[14px] text-neutral-400 leading-relaxed max-w-[46ch]">{step.body}</p>
        <div className="mt-auto pt-8 flex items-center gap-3">
          <span className="h-[3px] w-14 rounded-full bg-gradient-to-r from-bronze to-amber-bright" />
          <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.16em] text-neutral-500">{step.tech}</span>
        </div>
      </div>
    </article>
  )
}

export default function Pipeline() {
  const wrap = useRef(null)
  const track = useRef(null)
  const progressRef = useRef(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !wrap.current || !track.current) return

    const ctx = gsap.context(() => {
      const el = track.current
      const getDistance = () => Math.max(0, el.scrollWidth - window.innerWidth)

      const tween = gsap.to(el, {
        x: () => -getDistance(),
        ease: 'none',
        scrollTrigger: {
          trigger: wrap.current,
          start: 'top top',
          end: () => `+=${getDistance() + window.innerHeight * 1.2}`,
          pin: true,
          scrub: 1.2,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (progressRef.current) {
              progressRef.current.style.transform = `scaleX(${self.progress})`
            }
          },
        },
      })
      return () => tween.kill()
    }, wrap)
    return () => ctx.revert()
  }, [])

  return (
    <section id="pipeline" ref={wrap} className="relative overflow-hidden">
      <div className="h-[100dvh] flex flex-col justify-center">
        <div className="px-6 md:px-10 max-w-[1400px] mx-auto w-full mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              One flow. <span className="text-amber-bright">Three beats.</span>
            </h2>
            <div className="hidden md:flex items-center gap-4 text-neutral-500">
              <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.2em]">Camera</span>
              <span className="w-16 h-px bg-white/12" />
              <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.2em]">Templates</span>
              <span className="w-16 h-px bg-white/12" />
              <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.2em]">Grammar</span>
              <span className="w-16 h-px bg-white/12" />
              <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.2em] text-bio-cyan">Voice</span>
            </div>
          </div>
          <div className="mt-5 h-[2px] w-40 bg-white/8 rounded-full overflow-hidden">
            <div ref={progressRef} className="h-full w-full origin-left scale-x-0 bg-gradient-to-r from-bronze via-amber-bright to-bio-cyan rounded-full" />
          </div>
        </div>

        <div ref={track} className="flex gap-6 md:gap-10 px-6 md:px-10 will-change-transform" style={{ transform: 'translateZ(0)' }}>
          {STEPS.map((s, i) => (
            <PipelineCard key={s.id} step={s} index={i} />
          ))}
          <div className="shrink-0 w-[10vw]" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
