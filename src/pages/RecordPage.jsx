import { useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HandTracker } from "../components/HandTracker";
import { RecordingTool } from "../components/RecordingTool";
import { scrollToId } from "../utils/scrollTo";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function RecordPage() {
  const rootRef = useRef(null);
  const [showCameraTest, setShowCameraTest] = useState(false);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".cyber-record-copy", { autoAlpha: 0, y: 22, duration: 0.7 })
        .from(".record-tool-reveal", {
          autoAlpha: 0,
          y: 28,
          duration: 0.7,
          scrollTrigger: { trigger: "#recording-tool", start: "top 84%" },
        });

      return undefined;
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="cyber-page cyber-page--record">
      <section className="cyber-record-hero cyber-shell">
        <div className="cyber-record-copy">
          <h1>Build the vocabulary, one rep at a time.</h1>
          <p>
            Select a sign, capture clean repetitions, review the skeleton, and keep only useful
            movement. Fifteen reps per sign is the target, not a hard limit.
          </p>
          <div className="cyber-page__signal" aria-label="Recording targets">
            <div>
              <span>Target reps</span>
              <strong>15</strong>
            </div>
            <div>
              <span>Fixed signs</span>
              <strong>25</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={() => scrollToId("recording-tool")}
            className="cyber-button cyber-button--primary"
          >
            Start recording
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>

      <section id="recording-tool" className="record-tool-reveal cyber-workflow scroll-mt-20">
        <RecordingTool />
      </section>

      <section className="cyber-workflow !pt-0" aria-label="Camera test">
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => setShowCameraTest((visible) => !visible)}
            className="cyber-button"
            aria-expanded={showCameraTest}
          >
            {showCameraTest ? "Close camera test" : "Open camera test"}
            <span aria-hidden="true">{showCameraTest ? "↑" : "→"}</span>
          </button>
          {showCameraTest && (
            <div className="cyber-panel grid w-full gap-4 p-4">
              <HandTracker />
              <p className="m-0 max-w-2xl text-center text-xs text-[rgba(242,240,232,0.68)]">
                Hold one or both hands in frame. Confirm that the skeleton tracks smoothly before
                recording production data.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
