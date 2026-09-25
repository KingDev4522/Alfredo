import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { LiveInterpreter } from "../components/LiveInterpreter";
import { SplineScene } from "../components/SplineScene";
import { scrollToId } from "../utils/scrollTo";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ROBOT_SCENE = "https://prod.spline.design/A2wmUD454JU34P0P/scene.splinecode";

export function InterpretPage() {
  const rootRef = useRef(null);
  const ctaRef = useRef(null);

  useGSAP(
    () => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".interpret-eyebrow", { autoAlpha: 0, y: -12, duration: 0.5 })
        .from(".interpret-robot", { autoAlpha: 0, scale: 0.94, duration: 0.9 }, "-=0.15")
        .from(".interpret-copy-left", { autoAlpha: 0, x: -28, duration: 0.7 }, "-=0.6")
        .from(".interpret-copy-right", { autoAlpha: 0, x: 28, duration: 0.7 }, "<")
        .from(".interpret-cta", { autoAlpha: 0, y: 12, duration: 0.5 }, "-=0.3");
    },
    { scope: rootRef }
  );

  // CTA hover — same premium glow treatment as the Home button
  useGSAP(
    () => {
      const btn = ctaRef.current;
      if (!btn) return;
      const enter = () =>
        gsap.to(btn, {
          scale: 1.035,
          borderColor: "rgba(45,226,230,0.55)",
          boxShadow: "0 0 34px -6px rgba(45,226,230,0.55)",
          duration: 0.35,
          ease: "power2.out",
        });
      const leave = () =>
        gsap.to(btn, {
          scale: 1,
          borderColor: "rgba(255,255,255,0.16)",
          boxShadow: "0 0 0px 0px rgba(45,226,230,0)",
          duration: 0.35,
          ease: "power2.out",
        });
      btn.addEventListener("mouseenter", enter);
      btn.addEventListener("mouseleave", leave);
      return () => {
        btn.removeEventListener("mouseenter", enter);
        btn.removeEventListener("mouseleave", leave);
      };
    },
    { scope: rootRef }
  );

  return (
    <div ref={rootRef} className="w-full" style={{ backgroundColor: "#050505" }}>
      {/* Hero: robot dominant, futuristic flanking copy */}
      <section className="relative w-full min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 sm:px-10 pt-4 pb-6 gap-4">
        <span
          className="interpret-eyebrow text-xs uppercase tracking-[0.35em]"
          style={{ color: "#2DE2E6", fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 16px rgba(45,226,230,0.5)" }}
        >
          Interpret
        </span>

        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[0.7fr_2.4fr_0.7fr] items-center gap-6 lg:gap-4">
          <div className="interpret-copy-left order-2 lg:order-1 text-center lg:text-right flex flex-col gap-3">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-wide"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                background: "linear-gradient(120deg, #F2F4F8 40%, #2DE2E6 120%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textShadow: "0 0 24px rgba(45,226,230,0.18)",
              }}
            >
              Watched on-device
            </h2>
            <p className="text-sm max-w-xs mx-auto lg:mx-0 lg:ml-auto" style={{ color: "#9AA1B4" }}>
              MediaPipe tracks 21 landmarks per hand straight from your camera
              feed. Nothing leaves your device.
            </p>
          </div>

          <div className="interpret-robot order-1 lg:order-2 w-full">
            <SplineScene
              scene={ROBOT_SCENE}
              className="w-full"
              style={{ height: "54vh", minHeight: 400 }}
              scale={1.6}
            />
          </div>

          <div className="interpret-copy-right order-3 text-center lg:text-left flex flex-col gap-3">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-wide"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                background: "linear-gradient(120deg, #F2F4F8 40%, #FF4D6D 120%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textShadow: "0 0 24px rgba(255,77,109,0.18)",
              }}
            >
              Spoken back instantly
            </h2>
            <p className="text-sm max-w-xs mx-auto lg:mx-0" style={{ color: "#9AA1B4" }}>
              Recognized signs build a sentence in real time. Lower your
              hands, or tap Speak Now, to hear it aloud.
            </p>
          </div>
        </div>

        <button
          ref={ctaRef}
          onClick={() => scrollToId("interpreter-tool")}
          className="interpret-cta backdrop-blur-md inline-flex items-center gap-3 px-8 py-4 rounded-full border text-sm sm:text-base font-semibold tracking-wide"
          style={{
            borderColor: "rgba(255,255,255,0.16)",
            backgroundColor: "rgba(255,255,255,0.04)",
            color: "#F5F6F8",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          Open the Interpreter
          <span aria-hidden="true">↓</span>
        </button>
      </section>

      {/* Actual interpreter tool — untouched logic */}
      <section id="interpreter-tool" className="w-full px-4 sm:px-8 pb-24 scroll-mt-16">
        <LiveInterpreter />
      </section>
    </div>
  );
}
