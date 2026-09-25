import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { useInViewReveal } from '../lib/anim.jsx'

export default function Gateway() {
  const ref = useRef(null)
  const ctaRef = useRef(null)

  useInViewReveal(ref, { y: 40 })

  useEffect(() => {
    const el = ctaRef.current
    if (!el) return
    const enter = () => gsap.to(el, { scale: 1.04, duration: 0.5, ease: 'power3.out' })
    const leave = () => gsap.to(el, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' })
    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    return () => {
      el.removeEventListener('mouseenter', enter)
      el.removeEventListener('mouseleave', leave)
    }
  }, [])

  return (
    <section id="translation" ref={ref} className="gateway-fade relative py-32 md:py-44 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute left-1/2 -translate-x-1/2 top-[18%] w-px h-40 bg-gradient-to-b from-transparent via-bio-cyan/50 to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-bio-cyan/25 bg-bio-cyan/8 px-3.5 py-1.5 text-[10.5px] font-mono-tech uppercase tracking-[0.16em] text-bio-cyan mb-8">
          The workspace is live
        </div>

        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.06]">
          Step into the
          <span className="bg-gradient-to-r from-amber-bright via-amber-glow to-bio-cyan bg-clip-text text-transparent"> studio.</span>
        </h2>

        <p className="mt-6 text-neutral-400 text-[15.5px] leading-relaxed max-w-[52ch] mx-auto">
          The full operational workspace — live camera interpretation, vocabulary manager,
          and dataset tools — opens in the same tab. Your local templates travel with you.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            ref={ctaRef}
            href="/home"
            className="rounded-full bg-gradient-to-r from-amber-bright to-bronze text-black font-semibold text-[15px] px-8 py-4 flex items-center gap-3 active:scale-[0.98] will-change-transform"
          >
            Launch Studio
            <span className="w-8 h-8 rounded-full bg-black/12 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </a>
          <span className="text-[11px] font-mono-tech text-neutral-600 uppercase tracking-[0.14em]">
            /home · no install · no account
          </span>
        </div>

        <div className="mt-24 flex flex-col items-center gap-2 text-neutral-600">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 11.5V6a1.5 1.5 0 0 1 3 0v5m0-4.5V4a1.5 1.5 0 0 1 3 0v7m0-4.5a1.5 1.5 0 0 1 3 0V9m0 0a1.5 1.5 0 0 1 3 0v4.5c0 4-2.5 6.5-6.5 6.5S9 18 7.5 15.5L5.6 12a1.6 1.6 0 0 1 2.7-1.6L9 11.5"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <span className="text-[10px] font-mono-tech uppercase tracking-[0.22em]">SignSpeak — on-device ISL interpretation</span>
        </div>
      </div>
    </section>
  )
}
