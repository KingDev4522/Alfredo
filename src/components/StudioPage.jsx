import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

/*
 * STUDIO PAGE SHELL
 *
 * The four studio pages are tools, not marketing, but they should not look
 * like a different product. This shell reuses the landing page's language:
 * Space Grotesk display type, amber-bright as the single accent, hairline
 * dividers instead of nested cards, and a sentence-case headline rather than
 * the old uppercase display bomb.
 *
 * It is deliberately NOT a copy of the landing page. The landing is centred
 * and cinematic; a tool page is left-aligned and legible under load, so the
 * masthead here stacks vertically and puts the key numbers in a full-width
 * hairline row.
 *
 * Shape rules, held consistently across all four pages:
 *   - surfaces: 16px (rounded-2xl), matching the landing review cards
 *   - buttons: full pill, matching the landing nav pill and Gateway CTA
 *   - hairlines: white at 10% and 24% opacity
 *
 * No eyebrow label. The headline already says what the page is, and a small
 * uppercase caption above it is the most overused tell in generated layouts.
 * Motion is a single staggered entrance and it collapses to nothing under
 * prefers-reduced-motion, as the landing's reveals do.
 */
gsap.registerPlugin(useGSAP);

export function StudioPage({
  title,
  lede,
  signals = [],
  action = null,
  toolId = null,
  children,
}) {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from("[data-studio='title']", { autoAlpha: 0, y: 28, duration: 0.8 })
        .from("[data-studio='lede']", { autoAlpha: 0, y: 18, duration: 0.6 }, "-=0.42")
        .from("[data-studio='signal']", { autoAlpha: 0, y: 14, duration: 0.5 }, "-=0.36")
        .from("[data-studio='tool']", { autoAlpha: 0, y: 24, duration: 0.7 }, "-=0.3");
      return undefined;
    },
    { scope: rootRef },
  );

  const anchorProps = toolId
    ? { onClick: () => document.getElementById(toolId)?.scrollIntoView({ behavior: "smooth" }) }
    : {};

  return (
    <div ref={rootRef} className="studio-page relative isolate w-full overflow-hidden bg-obsidian">
      {/* Receding grid, same texture language as the landing backdrop. */}
      <div aria-hidden="true" className="studio-page__grid pointer-events-none absolute inset-0 -z-10" />
      {/* Fade the grid out downward so the tool area below stays calm. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-obsidian via-obsidian/70 to-transparent"
      />

      <div className="mx-auto w-full max-w-[1400px] px-6 pb-20 pt-20 md:pt-24">
        <header className="max-w-4xl">
          <h1
            data-studio="title"
            className="font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-semibold leading-[1.04] tracking-tight text-white"
          >
            {title}
          </h1>

          {lede ? (
            <p
              data-studio="lede"
              className="mt-6 max-w-[52ch] text-[15.5px] leading-relaxed text-neutral-300"
            >
              {lede}
            </p>
          ) : null}
        </header>

        {signals.length > 0 ? (
          <dl
            data-studio="signal"
            className="mt-12 grid grid-cols-2 divide-x divide-y divide-white/10 border-y border-white/10 md:grid-cols-4 md:divide-y-0"
          >
            {signals.map((s) => (
              <div key={s.label} className="px-1 py-5 md:px-6">
                <dt className="font-mono-tech text-[10.5px] uppercase tracking-[0.18em] text-neutral-500">
                  {s.label}
                </dt>
                <dd className="mt-2 font-display text-xl font-semibold tracking-tight text-white">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {action ? (
          <div className="mt-9">
            <button
              type="button"
              {...anchorProps}
              className="group inline-flex items-center gap-2.5 rounded-full bg-amber-bright px-7 py-3 text-[14px] font-semibold text-obsidian transition-transform duration-200 hover:bg-white active:translate-y-[1px]"
            >
              {action.label}
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-y-0.5">
                ↓
              </span>
            </button>
          </div>
        ) : null}

        <section
          id={toolId || undefined}
          data-studio="tool"
          className={toolId ? "mt-20 scroll-mt-24" : "mt-16"}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
