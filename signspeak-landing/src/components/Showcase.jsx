import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/*
 * SHOWCASE — "We present you SignSpeak"
 * Three full-bleed filmstrip rows driven by scroll: row 1 → left,
 * row 2 → right, row 3 → left, each at a slightly different rate.
 * A quiet centered statement floats over the motion.
 *
 * SWAPPING IN REAL PHOTOS: drop 1600×1000px JPGs into
 * `signspeak-landing/public/showcase/` named row1-1.jpg … row3-4.jpg.
 * The site grade (mono + contrast + grain) applies automatically.
 */

const ROWS = [
  ['/showcase/row1-1.jpg', '/showcase/row1-2.jpg', '/showcase/row1-3.jpg', '/showcase/row1-4.jpg'],
  ['/showcase/row2-1.jpg', '/showcase/row2-2.jpg', '/showcase/row2-3.jpg', '/showcase/row2-4.jpg'],
  ['/showcase/row3-1.jpg', '/showcase/row3-2.jpg', '/showcase/row3-3.jpg', '/showcase/row3-4.jpg', '/showcase/row3-5.jpg'],
]

// Per-frame reframe: { src, pos, zoom }
// pos = CSS object-position, zoom = scale to push edge artifacts out of frame.
const REFRAME = {
  // row3-2: table lamp half-cropped on the far-left edge — zoom in + shift
  // right so the lamp leaves the frame and the signers stay centered.
  '/showcase/row3-2.jpg': { pos: '68% 50%', zoom: 1.18 },
  // row2-4: warm foreground blur bar half-visible on the far-right edge —
  // zoom in + shift left to crop it out.
  '/showcase/row2-4.jpg': { pos: '30% 50%', zoom: 1.15 },
}

function Frame({ src }) {
  const fix = REFRAME[src]
  return (
    <div className="pointer-events-none relative h-[190px] shrink-0 select-none overflow-hidden bg-neutral-950 sm:h-[240px] md:h-[300px]">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        draggable={false}
        style={fix ? { objectPosition: fix.pos, transform: `scale(${fix.zoom})` } : undefined}
        className="aspect-[8/5] h-full w-auto object-cover contrast-[1.05] brightness-[0.96] saturate-[1.05]"
      />
    </div>
  )
}

function Strip({ images, className = '' }) {
  // doubled for a seamless travel distance
  const loop = [...images, ...images]
  return (
    <div className={`flex w-max gap-3 md:gap-4 ${className}`} aria-hidden={false}>
      {loop.map((src, i) => (
        <Frame key={`${src}-${i}`} src={src} />
      ))}
    </div>
  )
}

export default function Showcase() {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return undefined

    const ctx = gsap.context(() => {
      const tracks = gsap.utils.toArray('.show-track')
      tracks.forEach((track, i) => {
        const distance = () => track.scrollWidth - window.innerWidth
        if (i % 2 === 0) {
          // rows 1 & 3 → travel left
          gsap.fromTo(track, { x: 0 }, {
            x: () => -distance(),
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: 1.1 },
          })
        } else {
          // row 2 → travels right
          gsap.fromTo(track, { x: () => -distance() }, {
            x: 0,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: 1.1 },
          })
        }
      })

      gsap.from('.show-statement > *', {
        autoAlpha: 0,
        y: 30,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.12,
        scrollTrigger: { trigger: root, start: 'top 62%', once: true },
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section id="showcase" ref={rootRef} aria-label="Field frames" className="relative overflow-hidden bg-black py-24 md:py-32">
      <div className="mb-10 flex items-center gap-4 px-6 md:mb-12 md:px-10">
        <p className="font-mono-tech text-[10px] uppercase tracking-[0.3em] text-neutral-500">
          Field recordings — 13 frames
        </p>
        <span className="h-px flex-1 bg-white/[0.08]" aria-hidden="true" />
        <p className="hidden font-mono-tech text-[10px] uppercase tracking-[0.3em] text-neutral-600 sm:block">
          Scroll drives the motion
        </p>
      </div>

      <div className="relative">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="show-track will-change-transform"><Strip images={ROWS[0]} /></div>
          <div className="show-track will-change-transform"><Strip images={ROWS[1]} /></div>
          <div className="show-track will-change-transform"><Strip images={ROWS[2]} /></div>
        </div>

        {/* Center statement floating over the motion */}
        {/* Edge fades — full-bleed, so strips melt into the section on all sides */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,0,0.92) 0%, transparent 10%, transparent 90%, rgba(0,0,0,0.92) 100%),' +
              'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, transparent 14%, transparent 86%, rgba(0,0,0,0.9) 100%)',
          }}
        />
        {/* Full center scrim — one complete soft ellipse, never half-clipped.
            Fixed max size + centered flex child so it always renders whole. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div
            className="h-[78%] w-[min(640px,80vw)]"
            style={{
              background:
                'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.62) 45%, rgba(0,0,0,0.22) 65%, transparent 75%)',
            }}
          />
        </div>
        <div className="show-statement pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="font-mono-tech text-[10px] uppercase tracking-[0.34em] text-neutral-400">
            We present you
          </p>
          <p className="mt-3 font-serif-aesthetic text-[clamp(2.6rem,6vw,5rem)] font-normal italic leading-none tracking-[-0.01em] text-neutral-50">
            SignSpeak<span className="text-amber-200">.</span>
          </p>
        </div>
      </div>
    </section>
  )
}
