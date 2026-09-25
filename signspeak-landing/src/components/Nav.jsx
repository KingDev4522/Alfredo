import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

const LINKS = [
  { label: 'Engine', target: '#engine' },
  { label: 'Vocabulary', target: '#pipeline' },
  { label: 'Translation', target: '#translation' },
  { label: 'Dataset', target: '#dataset' },
]

/*
 * NAV — full-bleed editorial header, no container, no boundaries.
 * Individual elements float over a black-blur melt (same language as the
 * hero → engine bridge): frosted blur masked into transparency + a black
 * gradient, so the bar blends into whatever scrolls beneath it.
 */
export default function Nav({ onNavigate }) {
  const barRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return undefined
    const ctx = gsap.context(() => {
      gsap.from(barRef.current, {
        y: -24,
        opacity: 0,
        duration: 1,
        delay: 0.3,
        ease: 'power4.out',
      })
    })
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const go = (target) => {
    setOpen(false)
    onNavigate(target)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Blur melt — frost first, only a kiss of black for legibility */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 h-[150px]">
        <div className="absolute inset-0 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_30%,transparent_96%)] [-webkit-mask-image:linear-gradient(to_bottom,black_30%,transparent_96%)]" />
        <div
          className={`absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.32),rgba(0,0,0,0.1)_52%,transparent)] transition-opacity duration-500 ${
            scrolled ? 'opacity-100' : 'opacity-70'
          }`}
        />
      </div>

      <div ref={barRef} className="relative flex h-[76px] items-center gap-8 px-6 [text-shadow:0_1px_14px_rgba(0,0,0,0.5)] md:px-10">
        {/* Brand */}
        <button onClick={() => go(0)} className="flex items-center gap-2.5" aria-label="SignSpeak home">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-amber-200">
            <path
              d="M7 11.5V6a1.5 1.5 0 0 1 3 0v5m0-4.5V4a1.5 1.5 0 0 1 3 0v7m0-4.5a1.5 1.5 0 0 1 3 0V9m0 0a1.5 1.5 0 0 1 3 0v4.5c0 4-2.5 6.5-6.5 6.5S9 18 7.5 15.5L5.6 12a1.6 1.6 0 0 1 2.7-1.6L9 11.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-neutral-50">SignSpeak</span>
        </button>

        {/* Links — free-floating, no container */}
        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => go(l.target)}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-neutral-400 transition-colors duration-300 hover:text-neutral-50"
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 lg:hidden" />

        {/* CTA — quiet editorial link, no box */}
        <a
          href="/home"
          className="group relative hidden items-center gap-1.5 text-[13px] font-semibold text-neutral-100 transition-colors duration-300 hover:text-amber-100 sm:flex"
        >
          Launch Studio
          <span aria-hidden="true" className="text-amber-200 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">
            ↗
          </span>
          <span
            aria-hidden="true"
            className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-amber-200/70 transition-transform duration-500 group-hover:scale-x-100"
          />
        </a>

        {/* Mobile toggle — bare lines, no box */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-10 w-10 items-center justify-center text-neutral-200 lg:hidden"
        >
          <span className="relative block h-3 w-4" aria-hidden="true">
            <span
              className={`absolute left-0 top-0 h-[1.5px] w-full bg-current transition-transform duration-300 ${
                open ? 'translate-y-[5px] rotate-45' : ''
              }`}
            />
            <span
              className={`absolute left-0 bottom-0 h-[1.5px] w-full bg-current transition-transform duration-300 ${
                open ? '-translate-y-[5px] -rotate-45' : ''
              }`}
            />
          </span>
        </button>
      </div>

      {/* Mobile panel — borderless blur sheet */}
      {open && (
        <div className="nav-drop relative bg-black/60 px-6 pb-6 pt-2 backdrop-blur-xl lg:hidden">
          {LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => go(l.target)}
              className="flex w-full items-center justify-between py-3.5 text-[15px] font-medium text-neutral-300 transition-colors hover:text-neutral-50"
            >
              {l.label}
              <span aria-hidden="true" className="text-neutral-600">→</span>
            </button>
          ))}
          <a href="/home" className="group flex w-full items-center gap-1.5 py-3.5 text-[15px] font-semibold text-neutral-50">
            Launch Studio
            <span aria-hidden="true" className="text-amber-200">↗</span>
          </a>
        </div>
      )}
    </header>
  )
}
