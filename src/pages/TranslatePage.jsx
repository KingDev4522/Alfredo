import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Broadcast, Cpu, Cube, FileText } from "@phosphor-icons/react";
import { MediaInterpreter } from "../components/MediaInterpreter";

gsap.registerPlugin(useGSAP);

/*
 * TRANSLATE
 *
 * Same masthead contract as Interpret: pill, two line headline with the
 * second line dimmed, lede, then four stat tiles on the right. The tiles state
 * what the pipeline does and where it runs, which is the question this page
 * raises before anyone types a URL.
 */
const STATS = [
  { icon: FileText, value: "Text / Media", label: "Input modes", sub: "YouTube, text, files and more." },
  { icon: Cube, value: "3D ISL", label: "Output", sub: "Realistic avatar with ISL gloss." },
  { icon: Cpu, value: "Local", label: "Pipeline", sub: "Runs on your device." },
  { icon: Broadcast, value: "Live", label: "Streaming", sub: "Real-time translation." },
];

export function TranslatePage() {
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
              Real-time ISL translation
            </p>

            <h1 data-ref="title" className="ref-title mt-7">
              Input becomes an
              <br />
              <span className="ref-title__dim">ISL avatar.</span>
            </h1>

            <p
              data-ref="lede"
              className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-[var(--ref-muted)]"
            >
              Send a YouTube link, text, or a supported document. The local pipeline extracts the
              message, prepares ISL gloss, and drives the 3D avatar in real time.
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
          <MediaInterpreter />
        </div>
      </div>
    </div>
  );
}
