import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Hand, Lightning, Monitor, ShieldCheck } from "@phosphor-icons/react";
import { LiveInterpreter } from "../components/LiveInterpreter";

gsap.registerPlugin(useGSAP);

/*
 * INTERPRET
 *
 * The masthead is a two part row rather than the stacked layout the other
 * studio pages use. The headline and lede sit left, and four stat tiles sit
 * right, because the numbers are the pitch here: 21 landmarks, 900ms, and
 * two claims about privacy that are worth stating before the camera asks
 * for permission.
 *
 * The headline deliberately breaks across two lines with the second in a
 * dimmer grey. It is a single treatment, not a per-line colour scheme.
 */
const STATS = [
  { icon: Hand, value: "21", label: "Hand landmarks", sub: "Tracked in real time" },
  { icon: Lightning, value: "900ms", label: "Auto speech", sub: "Delay after hold" },
  { icon: Monitor, value: "Device", label: "Runs on", sub: "Your device" },
  { icon: ShieldCheck, value: "Required", label: "Account", sub: "To save settings" },
];

export function InterpretPage() {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from("[data-ref='pill']", { autoAlpha: 0, y: 10, duration: 0.5 })
        .from("[data-ref='title']", { autoAlpha: 0, y: 24, duration: 0.8 }, "-=0.26")
        .from("[data-ref='lede']", { autoAlpha: 0, y: 16, duration: 0.6 }, "-=0.4")
        .from("[data-ref='stat']", { autoAlpha: 0, y: 16, duration: 0.5 }, "-=0.34")
        .from("[data-ref='tool']", { autoAlpha: 0, y: 22, duration: 0.7 }, "-=0.3");
      return undefined;
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="ref-page w-full overflow-hidden">
      <div className="mx-auto w-full max-w-[1560px] px-6 pb-16 pt-8 md:px-10 md:pt-10">
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-14">
          <div>
            <p data-ref="pill" className="ref-pill">
              <span className="ref-dot" aria-hidden="true" />
              Real-time hand sign recognition
            </p>

            <h1 data-ref="title" className="ref-title mt-7">
              Camera to
              <br />
              <span className="ref-title__dim">spoken sentence.</span>
            </h1>

            <p
              data-ref="lede"
              className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-[var(--ref-muted)]"
            >
              MediaPipe tracks 21 landmarks per hand in your browser. Signs build a sentence in
              real time, then speech plays when your hands lower or you trigger it.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {STATS.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  data-ref="stat"
                  className="ref-panel flex flex-col gap-4 p-5"
                >
                  <span className="ref-icon">
                    <Icon size={18} weight="regular" />
                  </span>
                  <div>
                    <dd className="text-[22px] font-bold leading-none tracking-tight text-white">
                      {s.value}
                    </dd>
                    <dt className="mt-2.5 text-[13.5px] font-semibold text-white">{s.label}</dt>
                    <p className="mt-1 text-[12.5px] leading-snug text-[var(--ref-faint)]">{s.sub}</p>
                  </div>
                </div>
              );
            })}
          </dl>
        </div>

        <div data-ref="tool" className="mt-12">
          <LiveInterpreter />
        </div>
      </div>
    </div>
  );
}
