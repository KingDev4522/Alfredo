import { useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { HandTracker } from "../components/HandTracker";
import { RecordingTool } from "../components/RecordingTool";

gsap.registerPlugin(useGSAP);

/*
 * RECORD
 *
 * Same two-zone structure as Interpret and Translate, so the three studio
 * pages read as one product:
 *
 *   1. a centred masthead on flat black
 *   2. a full-bleed section with rounded top corners holding the tool
 *
 * This used to render through the shared StudioPage shell, which brings its
 * own obsidian background, a receding grid backdrop and a hairline signal
 * row. The grid in particular cannot be reconciled with the glass pass —
 * the panels need a flat black field to read as glass against — so the page
 * now has its own shell like the other two. The four signals that row
 * carried are gone; the one that mattered, fifteen reps per sign, is in the
 * lede, and the rest is visible in the tool itself.
 *
 * The camera viewport is left exactly as it was. See the .gi-stage rule in
 * index.css, which pins it back to solid black so the MediaPipe overlay is
 * unaffected.
 */
export function RecordPage() {
  const rootRef = useRef(null);
  const [showCameraTest, setShowCameraTest] = useState(false);

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
            Build the vocabulary,
            <br />
            <span className="ref-title__dim">one rep at a time.</span>
          </h1>

          <p
            data-ref="lede"
            className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ref-muted)]"
          >
            Select a sign, capture clean repetitions, review the skeleton, and keep only useful
            movement. Fifteen reps per sign is the target, not a hard limit.
          </p>

          {/* Jump to the tool. Was on the old StudioPage shell as its `action`
              slot; restored here so the path into the tool is unchanged. */}
          <button
            type="button"
            onClick={() =>
              document.getElementById("recording-tool")?.scrollIntoView({ behavior: "smooth" })
            }
            className="ref-btn ref-btn--primary mt-8"
          >
            Start recording
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </div>

      {/* Edge to edge, rounded at the top only. Same as the other two. */}
      <div
        id="recording-tool"
        data-ref="tool"
        className="gi-oval mt-12 scroll-mt-24 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
      >
        <div className="mx-auto w-full max-w-[1560px]">
          <RecordingTool />

          <div className="mt-10 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => setShowCameraTest((visible) => !visible)}
              aria-expanded={showCameraTest}
              className="ref-btn"
            >
              {showCameraTest ? "Close camera test" : "Open camera test"}
              <span aria-hidden="true">{showCameraTest ? "↑" : "→"}</span>
            </button>
            {showCameraTest && (
              <div className="ref-panel grid w-full max-w-3xl gap-4 p-5">
                <HandTracker />
                <p className="m-0 text-center text-xs text-[var(--ref-faint)]">
                  Hold one or both hands in frame. Confirm the skeleton tracks smoothly before
                  recording production data.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
