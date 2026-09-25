import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import handsImg from '../assets/hero-hands.jpg'

gsap.registerPlugin(ScrollTrigger)

/*
 * HERO - "The Interval" (editorial composition)
 * The halftone hands plate is the focal point. Typography lives in the
 * lower-left negative space (~40% width) and never touches the fingertips,
 * which sit near the visual center in open black void.
 *
 * Reading path: top micro-label → headline → fingertips → copy → CTA.
 *
 * VIDEO-READY - to replace the photo with your soft-settle video:
 *   1. Drop the file into `signspeak-landing/public/` as:
 *        hero-settle.mp4  (preferred, h264 + faststart)
 *        hero-settle.webm  (optional, smaller)
 *   2. Done. No code change needed - the <video> below auto-detects it,
 *      fades in on canplay, and falls back to the photo if missing.
 */
const VIDEO_SOURCES = [
  { src: '/hero-settle.mp4', type: 'video/mp4' },
  { src: '/hero-settle.webm', type: 'video/webm' },
]

export default function Hero({ start = true }) {
  const rootRef = useRef(null)
  const mediaRef = useRef(null)
  const videoRef = useRef(null)
  const entranceRef = useRef(null)
  const [videoLive, setVideoLive] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    let cancelled = false
    const onCanPlay = () => {
      if (cancelled) return
      setVideoLive(true)
      video.play().catch(() => {})
    }
    const onError = () => {
      if (cancelled) return
      setVideoLive(false)
    }
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onError, true)
    return () => {
      cancelled = true
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError, true)
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const ctx = gsap.context(() => {
      // Resting states are set up front so nothing flashes before the
      // preloader lifts; the entrance timeline below stays paused until
      // the parent passes start=true - one smooth, choreographed landing.
      gsap.set(mediaRef.current, { scale: 1.07 })
      gsap.set('.hero-line-inner', { yPercent: 112 })
      gsap.set('.hero-fade', { autoAlpha: 0, y: 18 })

      const entrance = gsap.timeline({ paused: true })
      // Soft settle: the plate eases from a gentle push-in to rest.
      entrance.to(mediaRef.current, { scale: 1.0, duration: 3.0, ease: 'power2.out' }, 0)
      // Headline lines rise in sequence, low and slow.
      entrance.to(
        '.hero-line-inner',
        { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.11 },
        0.35,
      )
      entrance.to(
        '.hero-fade',
        { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.09 },
        0.9,
      )
      entranceRef.current = entrance

      // Parallax: plate drifts slower than scroll; text block floats gently.
      gsap.to(mediaRef.current, {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 1 },
      })
    }, root)
    return () => {
      entranceRef.current = null
      ctx.revert()
    }
  }, [])

  // Play the held entrance the moment the preloader hands over.
  useEffect(() => {
    if (start) entranceRef.current?.play()
  }, [start])

  return (
    <section id="hero" ref={rootRef} className="relative min-h-[100svh] overflow-hidden bg-black">
      {/* Full-bleed plate: photo now, video later */}
      <div className="absolute inset-0" aria-hidden="true">
        <div ref={mediaRef} className="absolute inset-0 will-change-transform">
          <img
            src={handsImg}
            alt=""
            fetchPriority="high"
            className={`absolute inset-0 h-full w-full object-cover object-[50%_36%] transition-opacity duration-[1600ms] md:object-[50%_42%] ${
              videoLive ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <video
            ref={videoRef}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            poster="/hero-hands.jpg"
            className={`absolute inset-0 h-full w-full object-cover object-[50%_36%] transition-opacity duration-[1600ms] md:object-[50%_42%] ${
              videoLive ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {VIDEO_SOURCES.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
          </video>
        </div>

        {/* Legibility scrims - strengthened lower-left so white halftone dots never sit behind bare text */}
        <div className="absolute inset-x-0 top-0 h-[30%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.6),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(14deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.62)_30%,rgba(0,0,0,0.18)_52%,transparent_68%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(to_top,rgba(0,0,0,0.94)_20%,rgba(0,0,0,0.55)_55%,transparent)]" />
        {/* Localised text pocket - soft black bloom directly behind the headline block */}
        <div className="absolute bottom-0 left-0 h-[62%] w-full bg-[radial-gradient(ellipse_52%_58%_at_18%_82%,rgba(0,0,0,0.78),transparent_70%)] md:w-[58%]" />
        {/* film grain */}
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* Content: asymmetric editorial, lower-left negative space */}
      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[1400px] flex-col px-6 pt-24 md:px-10 md:pt-28">
        {/* Spacer - the hands and the fingertip void own the upper field */}
        <div className="min-h-[6svh] flex-1 md:min-h-[34svh]" aria-hidden="true" />

        {/* BOTTOM - headline block pinned to lower-left, ~40% width */}
        <div className="grid grid-cols-1 pb-10 md:pb-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5 [text-shadow:0_2px_24px_rgba(0,0,0,0.9),0_1px_6px_rgba(0,0,0,0.9)]">

            <h1 className="max-w-[32rem] font-display text-[clamp(2.1rem,9.5vw,2.6rem)] font-semibold leading-[1.04] tracking-[-0.032em] text-neutral-50 md:text-[clamp(2.3rem,4.2vw,3.7rem)]">
              <span className="-mb-[0.09em] block overflow-hidden pb-[0.09em]">
                <span className="hero-line-inner block">Where hands</span>
              </span>
              <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
                <span className="hero-line-inner block pl-[1em] font-serif-aesthetic text-[1.07em] font-normal italic leading-[1] tracking-[-0.008em] text-amber-100">
                  almost touch,
                </span>
              </span>
              <span className="-mb-[0.09em] block overflow-hidden pb-[0.09em]">
                <span className="hero-line-inner block font-medium">
                  meaning begins<span className="text-amber-200">.</span>
                </span>
              </span>
            </h1>

            <p className="hero-fade mt-5 max-w-[400px] pb-2 text-[13.5px] font-light leading-[1.85] tracking-[0.005em] text-neutral-300 md:mt-7 md:text-[14px]">
              An on-device interpreter that turns Indian Sign Language into
              spoken words. Nothing ever leaves your device.
            </p>

            <div className="hero-fade mt-6 flex flex-wrap items-center gap-4 md:mt-8">
              <Link
                to="/interpret"
                className="group inline-flex items-center gap-2 rounded-full bg-amber-200 px-6 py-3 text-[13.5px] font-semibold text-black transition-colors duration-300 hover:bg-amber-100"
              >
                Launch Studio
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">↗</span>
              </Link>
              <Link
                to="/engine"
                className="inline-flex items-center gap-2 px-1 py-3 text-[13.5px] font-medium text-neutral-200 transition-colors duration-300 hover:text-white"
              >
                See how it works
                <span aria-hidden="true">↓</span>
              </Link>
            </div>
          </div>
          {/* Right columns intentionally empty - fingertips stay unobstructed */}
          <div className="hidden lg:col-span-7 lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
