import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { LiveInterpreter } from "../components/LiveInterpreter";

gsap.registerPlugin(useGSAP);

/*
 * INTERPRET
 *
 * Centred masthead, then a full-bleed rounded section holding the tool.
 *
 * The masthead used to be a two part row with four stat tiles on the
 * right, but the tiles pulled the eye off the tool and the page reads
 * better with the camera as the first thing you land on.
 *
 * The headline breaks across two lines with the second in amber. It is a
 * single treatment, not a per-line colour scheme.
 */
export function InterpretPage() {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from("[data-ref='title']", { autoAlpha: 0, y: 24, duration: 0.8 })
        .from("[data-ref='lede']", { autoAlpha: 0, y: 16, duration: 0.6 }, "-=0.4")
        .from("[data-ref='tool']", { autoAlpha: 0, y: 22, duration: 0.7 }, "-=0.34");
      return undefined;
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="ref-page gi-page w-full overflow-hidden">
      <div className="mx-auto w-full max-w-[1560px] px-6 pt-8 md:px-10 md:pt-10">
        <div className="flex flex-col items-center text-center">
          <h1 data-ref="title" className="ref-title mt-7">
            Camera to
            <br />
            <span className="ref-title__dim">spoken sentence.</span>
          </h1>

          <p
            data-ref="lede"
            className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ref-muted)]"
          >
            MediaPipe tracks 21 landmarks per hand in your browser. Signs build a sentence in
            real time, then speech plays when your hands lower or you trigger it.
          </p>
        </div>
      </div>

      {/*
        Edge to edge. The section breaks out of the container above rather
        than sitting inside it, so its rounded corners land against the
        viewport edges and the arc is visible. The tool inside is still
        width constrained, which is what keeps the columns readable on an
        ultrawide instead of stretching the camera across 3000px.
      */}
      <div
        data-ref="tool"
        className="gi-oval mt-12 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
      >
        <div className="mx-auto w-full max-w-[1560px]">
          <LiveInterpreter />
        </div>
      </div>

      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
