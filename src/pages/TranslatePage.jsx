import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MediaInterpreter } from "../components/MediaInterpreter";

gsap.registerPlugin(useGSAP);

/*
 * TRANSLATE
 *
 * Same two-zone structure as Interpret, so moving between the two studio
 * pages does not feel like a different product:
 *
 *   1. a centred masthead on flat black
 *   2. a full-bleed section with rounded top corners holding the tool
 *
 * The four stat tiles that used to sit to the right of the headline are
 * gone here for the same reason they went from Interpret: they pulled the
 * eye off the tool. The pipeline facts they carried are still in the
 * headline and the lede.
 *
 * The 3D avatar stage is left exactly as it was. The glass pass, the
 * section wrapper and the panel glow all stop at its edge; see the
 * .gi-stage rule in index.css, which pins that panel back to solid black
 * so the WebGL viewport is unaffected.
 */
export function TranslatePage() {
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
          <h1 data-ref="title" className="ref-title">
            Input becomes an
            <br />
            <span className="ref-title__dim">ISL avatar.</span>
          </h1>

          <p
            data-ref="lede"
            className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ref-muted)]"
          >
            Send a YouTube link, text, or a supported document. The local pipeline extracts the
            message, prepares ISL gloss, and drives the 3D avatar in real time.
          </p>
        </div>
      </div>

      {/* Edge to edge, rounded at the top only. Same as Interpret. */}
      <div
        data-ref="tool"
        className="gi-oval mt-12 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
      >
        <div className="mx-auto w-full max-w-[1560px]">
          <MediaInterpreter />
        </div>
      </div>

      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
