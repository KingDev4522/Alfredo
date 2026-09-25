import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { LiveInterpreter } from "../components/LiveInterpreter";
import { scrollToId } from "../utils/scrollTo";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function InterpretPage() {
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
    <div ref={rootRef} className="cyber-page cyber-page--interpret">
      <header className="cyber-page__header cyber-shell">
        <div className="cyber-page__headline">
          <h1 className="cyber-page__title">
            Camera to <strong>spoken sentence.</strong>
          </h1>
        </div>
        <div className="cyber-page__aside">
          <p className="cyber-page__lede">
            MediaPipe tracks 21 landmarks per hand in the browser. Signs build a sentence in real
            time, then speech plays when your hands lower or you trigger it manually.
          </p>
          <div className="cyber-page__signal" aria-label="Interpreter settings">
            <div>
              <span>Hand landmarks</span>
              <strong>21</strong>
            </div>
            <div>
              <span>Auto speech</span>
              <strong>900ms</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={() => scrollToId("interpreter-tool")}
            className="cyber-button cyber-button--primary"
          >
            Open interpreter
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </header>

      <section id="interpreter-tool" className="cyber-workflow scroll-mt-20">
        <LiveInterpreter />
      </section>
    </div>
  );
}
