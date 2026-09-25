import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ReviewFlagged } from "../components/ReviewFlagged";

gsap.registerPlugin(useGSAP);

export function DeletePage() {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".cyber-page__headline", { autoAlpha: 0, y: 24, duration: 0.75 })
        .from(".cyber-page__aside", { autoAlpha: 0, y: 18, duration: 0.65 }, "-=0.38")
        .from(".cyber-workflow", { autoAlpha: 0, y: 28, duration: 0.7 }, "-=0.32");

      return undefined;
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="cyber-page cyber-page--delete">
      <header className="cyber-page__header cyber-shell">
        <div className="cyber-page__headline">
          <h1 className="cyber-page__title">
            Surgical cleanup, <strong>not a wipe.</strong>
          </h1>
        </div>
        <div className="cyber-page__aside">
          <p className="cyber-page__lede">
            Search for a sign, replay every matching take as a skeleton, and remove only recordings
            that are damaging recognition quality. Other takes remain untouched.
          </p>
          <div className="cyber-page__signal" aria-label="Review controls">
            <div>
              <span>Delete scope</span>
              <strong>One take</strong>
            </div>
            <div>
              <span>Review mode</span>
              <strong>Skeleton</strong>
            </div>
          </div>
        </div>
      </header>

      <section className="cyber-workflow">
        <ReviewFlagged />
      </section>
    </div>
  );
}
