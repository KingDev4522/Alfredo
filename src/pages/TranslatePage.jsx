import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MediaInterpreter } from "../components/MediaInterpreter";

gsap.registerPlugin(useGSAP);

export function TranslatePage() {
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
    <div ref={rootRef} className="cyber-page cyber-page--translate">
      <header className="cyber-page__header cyber-shell">
        <div className="cyber-page__headline">
          <h1 className="cyber-page__title">
            Input becomes an <strong>ISL avatar.</strong>
          </h1>
        </div>
        <div className="cyber-page__aside">
          <p className="cyber-page__lede">
            Send a YouTube link, text, or a supported document. The local AI pipeline extracts the
            message, prepares ISL gloss, and drives the 3D avatar in real time.
          </p>
          <div className="cyber-page__signal" aria-label="Translation pipeline">
            <div>
              <span>Input modes</span>
              <strong>Text / Media</strong>
            </div>
            <div>
              <span>Output</span>
              <strong>3D ISL</strong>
            </div>
          </div>
        </div>
      </header>

      <section className="cyber-workflow">
        <MediaInterpreter />
      </section>
    </div>
  );
}
