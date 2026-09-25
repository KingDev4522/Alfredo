import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/*
 * BAT SWARM - a living layer over the giant footer wordmark.
 * Faceted white bats (echoing the reference colony) drift across the
 * footer on independent flight paths: lateral traverse, wing flap,
 * vertical bob and bank sway, plus a scroll-driven parallax lift and a
 * soft fade-in when the footer enters view. GPU-cheap transforms only.
 * Static (but still visible) when the user prefers reduced motion.
 */

// left/top in % of the wordmark band · w in px · o opacity ·
// dur traverse seconds · dir flight direction (1 = left→right)
const COLONY = [
  { left: 3, top: 6, w: 58, o: 0.5, dur: 26, dir: 1 },
  { left: 16, top: 28, w: 148, o: 0.92, dur: 17, dir: 1 },
  { left: 37, top: 58, w: 62, o: 0.55, dur: 29, dir: -1 },
  { left: 51, top: 4, w: 60, o: 0.5, dur: 24, dir: -1 },
  { left: 62, top: 12, w: 128, o: 0.85, dur: 19, dir: 1 },
  { left: 60, top: 46, w: 168, o: 0.95, dur: 16, dir: -1 },
  { left: 83, top: 38, w: 64, o: 0.55, dur: 27, dir: 1 },
  { left: 89, top: 62, w: 48, o: 0.45, dur: 31, dir: -1 },
]

const BAT_OUTLINE =
  '2,10 26,14 44,24 52,27 55,26 55,16 59,23 60,22 61,23 65,16 65,26 68,27 76,24 94,14 118,10 104,20 102,30 94,27 90,37 82,32 76,40 70,35 65,40 60,44 55,40 50,35 44,40 38,32 30,37 26,27 18,30 16,20'

const BAT_FACETS =
  'M60 24 L60 42 M60 28 L26 15 M60 28 L44 24 M60 28 L94 15 M60 28 L76 24 M60 30 L38 33 M60 30 L82 33 M60 30 L17 21 M60 30 L103 21 M44 24 L38 33 M76 24 L82 33'

function Bat({ fill, flip }) {
  return (
    <svg
      viewBox="0 0 120 64"
      aria-hidden="true"
      className="block h-auto w-full"
      style={{
        transform: flip ? 'scaleX(-1)' : undefined,
        filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.28))',
      }}
    >
      <polygon points={BAT_OUTLINE} fill={fill} />
      <path d={BAT_FACETS} fill="none" stroke="rgba(8,8,12,0.3)" strokeWidth="0.9" />
    </svg>
  )
}

export default function BatSwarm() {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const ctx = gsap.context(() => {
      const footer = root.closest('footer') ?? root
      const bats = gsap.utils.toArray('.bat-swarm__bat', root)

      // Entrance - from + immediateRender:false so bats are never
      // trapped invisible if the trigger fails to fire.
      gsap.from(root, {
        autoAlpha: 0,
        y: 46,
        duration: 1.5,
        ease: 'power3.out',
        immediateRender: false,
        scrollTrigger: { trigger: footer, start: 'top 86%', once: true },
      })

      // Parallax - the whole colony lifts against the wordmark on scroll.
      gsap.to(root, {
        y: -64,
        ease: 'none',
        scrollTrigger: { trigger: footer, start: 'top bottom', end: 'bottom top', scrub: 1 },
      })

      bats.forEach((bat, i) => {
        const cfg = COLONY[i % COLONY.length]
        const wing = bat.querySelector(':scope > svg')

        // Lateral flight across the full band; function values +
        // repeatRefresh keep it correct through resizes. Negative delay
        // scatters the colony mid-flight on load.
        const edge = () => {
          const layerW = root.offsetWidth
          const offLeft = bat.offsetLeft
          const offWidth = bat.offsetWidth
          const from = -(offLeft + offWidth + 60)
          const to = layerW - offLeft + 60
          return cfg.dir === 1 ? [from, to] : [to, from]
        }
        gsap.fromTo(
          bat,
          { x: () => edge()[0] },
          {
            x: () => edge()[1],
            duration: cfg.dur,
            ease: 'none',
            repeat: -1,
            repeatRefresh: true,
            delay: -(Math.random() * cfg.dur),
          },
        )

        // Wing flap - squash around the body reads as a beat at any size.
        // Smaller (farther) bats beat faster.
        gsap.to(wing, {
          scaleY: 0.42,
          transformOrigin: '50% 55%',
          duration: 0.24 + (cfg.w / 170) * 0.3,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          delay: Math.random() * 0.6,
        })

        // Bob + bank sway for an organic, non-mechanical path.
        gsap.to(bat, {
          y: `+=${10 + Math.random() * 10}`,
          duration: 1.6 + Math.random() * 1.4,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          delay: Math.random(),
        })
        gsap.to(bat, {
          rotation: Math.random() * 10 - 5,
          duration: 2 + Math.random() * 2,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {COLONY.map((b, i) => (
        <div
          key={i}
          className="bat-swarm__bat absolute"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: `${b.w}px`,
            maxWidth: '38vw',
            opacity: b.o,
            willChange: 'transform',
          }}
        >
          <Bat fill={i % 2 === 0 ? '#ffffff' : '#ececec'} flip={b.dir === -1} />
        </div>
      ))}
    </div>
  )
}
