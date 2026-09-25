import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/*
 * ENGINE - stripped to the essential statement.
 * One headline, one quiet line, and a violet gradient rising from the
 * bottom of the section like light spilling upward. Nothing else.
 */
export default function Privacy() {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const ctx = gsap.context(() => {
      // fromTo + immediateRender:false: text stays readable if a trigger
      // never fires (image load / pin layout shifts).
      gsap.fromTo(
        '.priv-line-inner',
        { yPercent: 115 },
        {
          yPercent: 0,
          duration: 1.1,
          ease: 'power4.out',
          stagger: 0.13,
          immediateRender: false,
          scrollTrigger: { trigger: root, start: 'top 74%', once: true },
        },
      )
      gsap.fromTo(
        '.priv-fade',
        { autoAlpha: 0, y: 20 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1,
          ease: 'power3.out',
          immediateRender: false,
          scrollTrigger: { trigger: root, start: 'top 70%', once: true },
        },
      )
      gsap.fromTo(
        '.priv-aurora',
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 1.6,
          ease: 'power2.out',
          immediateRender: false,
          scrollTrigger: { trigger: root, start: 'top 60%', once: true },
        },
      )
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section id="engine" ref={rootRef} className="relative -mt-32 flex min-h-[100svh] flex-col justify-center overflow-hidden px-6 pb-28 pt-44 md:-mt-44 md:px-10 md:pt-48">
      {/* Black-blur bridge: melts the showcase into this section. No seam. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 md:h-96">
        <div className="absolute inset-0 backdrop-blur-2xl [mask-image:linear-gradient(to_bottom,transparent,black_60%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.6)_48%,#070709_94%)]" />
      </div>

      {/* Aurora rising from the bottom - crimson west, electric core, aqua east */}
      <div aria-hidden="true" className="priv-aurora pointer-events-none absolute inset-x-0 bottom-0 h-[135%]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_48%_44%_at_28%_88%,rgba(197,0,60,0.75),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_36%_at_14%_94%,rgba(136,4,37,0.7),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_38%_36%_at_52%_97%,rgba(243,230,0,0.78),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_42%_44%_at_84%_88%,rgba(85,234,212,0.7),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_28%_at_50%_108%,rgba(85,234,212,0.45),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.12),#070709_64%)]" />
      </div>

      {/* Bottom melt: the aurora dissolves into the page inside its own
          section - frost + fade to solid, so no edge and no overlap tricks */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 md:h-72">
        <div className="absolute inset-0 backdrop-blur-xl [mask-image:linear-gradient(to_top,black_40%,transparent_95%)] [-webkit-mask-image:linear-gradient(to_top,black_40%,transparent_95%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#070709_10%,rgba(7,7,9,0.55)_48%,transparent)]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1400px]">
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-8">
            <h2 className="max-w-[46rem]">
              <span className="-mb-[0.09em] block overflow-hidden pb-[0.09em]">
                <span className="priv-line-inner block font-display text-[clamp(2.5rem,5.2vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.032em] text-[#EDEAE2]">
                  Your camera stream
                </span>
              </span>
              <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
                <span className="priv-line-inner block pl-[0.55em] font-serif-aesthetic text-[clamp(2rem,4.2vw,3.7rem)] font-normal italic leading-[1.06] tracking-[-0.008em] text-amber-100/90">
                  never leaves this device.
                </span>
              </span>
            </h2>

            <p className="priv-fade mt-7 max-w-[420px] text-[14px] font-light leading-[1.85] tracking-[0.005em] text-neutral-400">
              Every frame is interpreted locally: tracking, matching, grammar
              and speech happen inside your browser. Nothing is uploaded.
            </p>
          </div>
          <div className="lg:col-span-4">
            <div className="priv-fade relative mt-12 h-[320px] sm:h-[400px] lg:mt-0 lg:h-[440px] xl:h-[520px]">
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 h-[80%] w-[90%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(85,234,212,0.08),rgba(197,0,60,0.06)_55%,transparent_72%)]"
              />
              <img
                src="/LOGO.png"
                alt="SignSpeak emblem: a hand reaching toward a computer"
                loading="lazy"
                className="absolute inset-x-0 top-0 bottom-8 w-full object-contain mix-blend-screen"
              />
              <p className="absolute bottom-0 left-0 font-mono-tech text-[10px] uppercase tracking-[0.3em] text-neutral-600">
                Hand to machine, on this device alone
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
