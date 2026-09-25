import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useInViewReveal } from '../lib/anim.jsx'

gsap.registerPlugin(ScrollTrigger)

/*
 * MANIFESTO - "how and what we actually do", told in pure typography.
 * No illustrations: dual kinetic marquees, a scroll-illuminated manifesto
 * paragraph, a rotating circular-text badge, and giant numbered rows.
 */

const SEGMENTS = [
  { text: 'Your camera watches your hands.' },
  { text: 'MediaPipe maps twenty-one landmarks per hand, sixty times a second.', accent: 'text-amber-bright' },
  { text: 'Motion segmentation cuts the stream into separate signs.' },
  { text: 'Dynamic time warping matches each sign against templates that live only in your browser.', accent: 'text-aqua' },
  { text: 'Grammar shapes the gloss into a clean sentence.' },
  { text: 'A neural voice speaks it the moment your hands lower.', accent: 'text-amber-bright' },
  { text: 'No servers. No uploads. No one watching.', accent: 'text-neutral-50' },
]

const ROWS = [
  {
    index: '01',
    verb: 'Watch',
    serif: 'the hands.',
    body: 'The camera feed never leaves the page. MediaPipe tracks 21 landmarks per hand, live in the browser.',
    meta: ['MediaPipe', '21 landmarks', '60 fps'],
  },
  {
    index: '02',
    verb: 'Understand',
    serif: 'the motion.',
    body: 'Segmentation slices the stream into signs. DTW matches each one against your own local templates, then grammar turns gloss into a sentence.',
    meta: ['DTW match', 'Local templates', 'Grammar'],
  },
  {
    index: '03',
    verb: 'Speak',
    serif: 'the sentence.',
    body: 'A neural voice reads the sentence aloud the instant your hands lower, or whenever you tap speak.',
    meta: ['Neural voice', 'Auto-speak', '0 bytes out'],
  },
]

const MARQUEE_A = ['Signs in', 'Speech out', 'On-device', 'Private', 'Real-time']
const MARQUEE_B = ['No servers', 'No uploads', 'No one watching', 'Your hands do the talking']

function MarqueeRow({ items, reverse = false, outline = false }) {
  const line = (hidden) => (
    <div aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item) => (
        <span key={`${hidden ? 'b' : 'a'}-${item}`} className="flex shrink-0 items-center">
          <span
            className={`whitespace-nowrap px-6 font-display text-[clamp(2.6rem,7vw,6.5rem)] font-bold uppercase leading-none tracking-[-0.02em] md:px-10 ${
              outline ? 'text-outline' : 'text-neutral-100'
            }`}
          >
            {item}
          </span>
          <span aria-hidden="true" className="text-[clamp(1.4rem,3vw,2.6rem)] text-amber-bright">
            ✳
          </span>
        </span>
      ))}
    </div>
  )
  return (
    <div className="overflow-hidden">
      <div className={`manifesto-marquee ${reverse ? 'manifesto-marquee--reverse' : ''}`}>
        {line(false)}
        {line(true)}
      </div>
    </div>
  )
}

function ManifestoRow({ row }) {
  const ref = useRef(null)
  useInViewReveal(ref, { y: 48 })
  return (
    <div ref={ref} className="group border-t border-white/10 py-10 md:py-14">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="flex items-start gap-5 md:gap-8">
          <span className="pt-2 font-mono-tech text-[11px] font-bold uppercase tracking-[0.28em] text-amber-bright">
            {row.index}
          </span>
          <h3 className="font-display text-[clamp(2.8rem,8vw,7.5rem)] font-bold uppercase leading-[0.88] tracking-[-0.02em] text-neutral-100 transition-transform duration-500 ease-out group-hover:translate-x-3">
            {row.verb}
            <br />
            <span className="font-serif-aesthetic font-normal normal-case italic tracking-[-0.01em] text-neutral-500 transition-colors duration-500 group-hover:text-bio-cyan">
              {row.serif}
            </span>
          </h3>
        </div>
        <div className="max-w-md md:pb-2 md:text-right">
          <p className="text-[15px] leading-relaxed text-neutral-400">{row.body}</p>
          <p className="mt-4 font-mono-tech text-[10.5px] uppercase tracking-[0.2em] text-neutral-600">
            {row.meta.join(' · ')}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Manifesto() {
  const paraRef = useRef(null)

  // Scroll-scrubbed word illumination for the manifesto paragraph.
  useEffect(() => {
    const el = paraRef.current
    if (!el) return undefined
    const words = el.querySelectorAll('.manifesto-word')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      gsap.set(words, { opacity: 1 })
      return undefined
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        words,
        { opacity: 0.1 },
        {
          opacity: 1,
          ease: 'none',
          stagger: 0.05,
          scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 45%', scrub: 0.6 },
        },
      )
    })
    return () => ctx.revert()
  }, [])

  let key = 0
  const words = SEGMENTS.flatMap((seg) =>
    seg.text.split(' ').map((w) => ({ w, accent: seg.accent, key: key++ })),
  )

  return (
    <section id="how" className="relative overflow-hidden bg-obsidian py-28 md:py-40" aria-label="How SignSpeak works">
      {/* faint vertical hairlines - type-room scaffolding, no imagery */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 mx-auto hidden max-w-6xl justify-between px-6 md:flex">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-full w-px bg-white/[0.04]" />
        ))}
      </div>

      {/* kinetic marquee bands */}
      <div className="relative mt-16 -rotate-1 space-y-4 md:mt-20">
        <MarqueeRow items={MARQUEE_A} />
        <MarqueeRow items={MARQUEE_B} reverse outline />
      </div>

      {/* illuminated manifesto paragraph */}
      <p
        ref={paraRef}
        className="relative mx-auto mt-20 max-w-4xl px-6 text-center font-display text-[clamp(1.5rem,3.6vw,2.6rem)] font-semibold leading-[1.35] tracking-tight md:mt-28"
      >
        {words.map(({ w, accent, key: k }) => (
          <span key={k} className={`manifesto-word ${accent ?? 'text-neutral-100'}`}>
            {w}
            {' '}
          </span>
        ))}
      </p>

      {/* giant numbered rows */}
      <div className="relative mx-auto mt-16 max-w-6xl px-6 md:mt-24">
        {ROWS.map((row) => (
          <ManifestoRow key={row.index} row={row} />
        ))}
      </div>
    </section>
  )
}
