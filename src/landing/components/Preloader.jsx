import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/*
 * PRELOADER - smooth cinematic boot for the landing page.
 * Real logo artwork floating over a breathing ambient aura, SIGNSPEAK
 * wordmark rising letter-by-letter (blur → sharp), live percentage
 * counter, crossfading status line, hairline gradient progress track.
 * Exits as a soft curtain lift (black over an amber trailing edge) and
 * fires onDone the moment the curtain starts moving so the hero entrance
 * choreographs underneath it - one continuous, smooth landing.
 * Static + fast when the user prefers reduced motion.
 */

const STATUS_LINES = [
  'CALIBRATING OPTICS',
  'LOADING VOCABULARY',
  'TUNING AVATAR',
  'OPENING THE INTERVAL',
]

const WORD = 'SIGNSPEAK'

export default function Preloader({ onDone }) {
  const rootRef = useRef(null)
  const barRef = useRef(null)
  const numRef = useRef(null)
  const statusRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const finish = () => doneRef.current?.()

    // Reduced motion: brief fade, hand over immediately.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = gsap.to(root, { autoAlpha: 0, duration: 0.35, delay: 0.15, onComplete: finish })
      return () => {
        t.kill()
      }
    }

    const ctx = gsap.context(() => {
      const num = numRef.current
      const bar = barRef.current
      const status = statusRef.current
      const state = { v: 0 }

      const render = () => {
        if (num) num.textContent = String(Math.round(state.v)).padStart(3, '0')
        if (bar) bar.style.transform = `scaleX(${state.v / 100})`
      }

      // Entrance - everything drifts in soft and slow.
      gsap.from('.pre-logo', { scale: 0.86, autoAlpha: 0, y: 18, duration: 1.2, ease: 'expo.out' })
      gsap.from('.pre-letter', {
        yPercent: 120,
        autoAlpha: 0,
        filter: 'blur(8px)',
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.05,
        delay: 0.25,
      })
      gsap.from('.pre-meta', { autoAlpha: 0, y: 14, duration: 1, ease: 'expo.out', stagger: 0.09, delay: 0.55 })
      gsap.from('.pre-aura', { autoAlpha: 0, scale: 0.92, duration: 2, ease: 'sine.out' })

      // Ambient life - logo floats, aura breathes. Long slow sine loops.
      gsap.to('.pre-logo', {
        y: -9,
        duration: 2.6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: 1.2,
      })
      gsap.to('.pre-logo', {
        filter: 'drop-shadow(0 0 26px rgba(255,176,0,0.4))',
        duration: 2.2,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: 1.2,
      })
      gsap.to('.pre-aura', {
        opacity: 0.55,
        scale: 1.06,
        duration: 3.4,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: 1,
      })

      // Status line crossfades between phrases.
      const statusTl = gsap.timeline({ repeat: -1 })
      STATUS_LINES.forEach((line) => {
        statusTl.call(() => {
          if (!status) return
          gsap.fromTo(
            status,
            { autoAlpha: 0, y: 6 },
            { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out', overwrite: 'auto' },
          )
          status.textContent = line
        })
        statusTl.to({}, { duration: 1.1 })
      })

      // Counter glides toward 90 while real assets arrive…
      render()
      const counter = gsap.to(state, {
        v: 90,
        duration: 3,
        ease: 'sine.out',
        onUpdate: render,
      })

      // …fonts + window load (hard-capped so we never hang)…
      const assetsReady = Promise.allSettled([
        (document.fonts ? document.fonts.ready : Promise.resolve()).catch(() => {}),
        new Promise((resolve) => {
          if (document.readyState === 'complete') resolve()
          else {
            window.addEventListener('load', () => resolve(), { once: true })
            window.setTimeout(resolve, 3500)
          }
        }),
      ])

      let exited = false
      const exit = () => {
        if (exited) return
        exited = true
        counter.kill()
        statusTl.kill()
        gsap.to(state, {
          v: 100,
          duration: 0.5,
          ease: 'sine.inOut',
          onUpdate: render,
          onComplete: () => {
            const tl = gsap.timeline()
            // Content settles softly first - no snap.
            tl.to('.pre-inner', { autoAlpha: 0, y: -24, scale: 0.985, filter: 'blur(6px)', duration: 0.55, ease: 'power2.in' })
            // Curtain lift: black first, amber trailing edge follows.
            // onDone fires as the curtain starts moving so the hero
            // entrance plays underneath - one smooth landing.
            tl.add(() => finish())
            tl.to('.pre-panel-black', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '-=0.05')
            tl.to('.pre-panel-amber', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '-=0.82')
          },
        })
      }

      assetsReady.then(() => {
        // Let the counter breathe a beat so 100 always lands visibly.
        gsap.delayedCall(0.35, exit)
      })
      // Absolute ceiling: never hold the page hostage.
      const ceiling = gsap.delayedCall(6, exit)

      return () => ceiling.kill()
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label="Loading SignSpeak"
      className="fixed inset-0 z-[100] overflow-hidden bg-black"
    >
      {/* Curtain stack - amber trails the black panel on exit */}
      <div aria-hidden="true" className="pre-panel-amber absolute inset-0 bg-[#FFB000]" />
      <div aria-hidden="true" className="pre-panel-black absolute inset-0 bg-black" />

      {/* Ambient aura */}
      <div aria-hidden="true" className="pre-aura absolute inset-0">
        <div className="absolute left-[8%] top-[6%] h-[46vmax] w-[46vmax] rounded-full bg-[#FFB000]/[0.07] blur-3xl" />
        <div className="absolute bottom-[4%] right-[6%] h-[42vmax] w-[42vmax] rounded-full bg-[#55F6E5]/[0.06] blur-3xl" />
      </div>

      <div className="pre-inner absolute inset-0 flex flex-col items-center justify-center px-6 will-change-transform">
        {/* Top row */}
        <div className="pre-meta absolute left-0 right-0 top-0 flex items-center justify-between px-6 pt-6 md:px-10 md:pt-8">
          <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.24em] text-neutral-500">
            On-device ISL
          </span>
          <span className="font-mono-tech text-[10.5px] uppercase tracking-[0.24em] text-neutral-500">
            Est. 2026
          </span>
        </div>

        {/* Logo */}
        <img
          src="/logo-nav.png"
          alt="SignSpeak"
          width="88"
          height="88"
          draggable={false}
          className="pre-logo block h-[80px] w-[80px] border-0 bg-transparent object-contain outline-none will-change-transform md:h-[92px] md:w-[92px]"
        />

        {/* Wordmark reveal */}
        <div className="mt-8 overflow-hidden" aria-hidden="true">
          <p className="font-display text-[13vw] font-bold uppercase leading-none tracking-tight text-neutral-50 sm:text-6xl md:text-7xl">
            {WORD.split('').map((ch, i) => (
              <span key={i} className="pre-letter inline-block will-change-transform">
                {ch}
              </span>
            ))}
          </p>
        </div>
        <p className="pre-meta mt-4 font-mono-tech text-[10.5px] uppercase tracking-[0.3em] text-amber-200/80">
          Camera to spoken sentence
        </p>

        {/* Bottom row: status + counter */}
        <div className="absolute inset-x-0 bottom-0 px-6 pb-8 md:px-10">
          <div className="flex items-end justify-between">
            <span
              ref={statusRef}
              className="pre-meta font-mono-tech text-[10.5px] uppercase tracking-[0.24em] text-neutral-500"
            >
              {STATUS_LINES[0]}
            </span>
            <span className="font-display text-5xl font-bold tabular-nums leading-none text-neutral-100 md:text-6xl">
              <span ref={numRef}>000</span>
              <span className="text-xl text-neutral-500">%</span>
            </span>
          </div>
          <div className="mt-4 h-px w-full bg-white/10">
            <div
              ref={barRef}
              className="h-full w-full origin-left bg-gradient-to-r from-[#FFB000] via-amber-200 to-[#55F6E5] shadow-[0_0_12px_rgba(255,176,0,0.5)]"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
