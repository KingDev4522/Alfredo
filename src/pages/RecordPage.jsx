import { useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { RecordingTool } from "../components/RecordingTool";
import { HandTracker } from "../components/HandTracker";
import { SplineScene } from "../components/SplineScene";
import { scrollToId } from "../utils/scrollTo";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ORB_SCENE = "https://prod.spline.design/jJJcWeywnUIENZdv/scene.splinecode";

export function RecordPage() {
  const rootRef = useRef(null);
  const ctaRef = useRef(null);
  const [showCameraTest, setShowCameraTest] = useState(false);

  useGSAP(
    () => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".record-eyebrow", { autoAlpha: 0, y: -12, duration: 0.5 })
        .from(".record-orb", { autoAlpha: 0, scale: 0.97, duration: 0.9 }, "-=0.15")
        .from(".record-cta", { autoAlpha: 0, y: 12, duration: 0.5 }, "-=0.4");
    },
    { scope: rootRef }
  );

  // CTA hover — teal glow, matching the orb scene's own palette
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
          borderColor: "rgba(255,255,255,0.18)",
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

  // Reveal the recording tool as it scrolls into view
  useGSAP(
    () => {
      gsap.from(".record-tool-reveal", {
        autoAlpha: 0,
        y: 30,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#recording-tool",
          start: "top 82%",
        },
      });
    },
    { scope: rootRef }
  );

  return (
    <div ref={rootRef} className="w-full" style={{ backgroundColor: "#050505" }}>
      <span
        className="record-eyebrow block text-center text-xs uppercase tracking-[0.35em] pt-8"
        style={{ color: "#2DE2E6", fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 16px rgba(45,226,230,0.45)" }}
      >
        Record Signs
      </span>

      {/* Orb — full-width banner, its own baked-in heading/copy carry the message.
          The CTA floats where the scene's own button sits, ready to take over once
          that button is removed from the Spline scene. */}
      <div className="record-orb relative w-full" style={{ height: "78vh", minHeight: 520 }}>
        <SplineScene
          scene={ORB_SCENE}
          className="w-full h-full"
          style={{ width: "100%", height: "100%" }}
        />

        <div
          className="absolute z-20"
          style={{ left: "19%", bottom: "6%" }}
        >
          <button
            ref={ctaRef}
            onClick={() => scrollToId("recording-tool")}
            className="record-cta backdrop-blur-md inline-flex items-center gap-3 px-7 py-3.5 rounded-full border text-sm sm:text-base font-semibold tracking-wide"
            style={{
              borderColor: "rgba(255,255,255,0.18)",
              backgroundColor: "rgba(45,226,230,0.08)",
              color: "#F5F6F8",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Start Recording
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {/* Actual recording tool — untouched logic */}
      <section id="recording-tool" className="record-tool-reveal w-full px-4 sm:px-8 pt-16 pb-16 scroll-mt-16">
        <RecordingTool />
      </section>

      {/* Camera calibration test — kept tucked away, same as before */}
      <section className="w-full flex flex-col items-center gap-4 pb-20 px-4">
        <button
          onClick={() => setShowCameraTest((v) => !v)}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1"
        >
          {showCameraTest ? "▾" : "▸"} Camera test
        </button>
        {showCameraTest && (
          <div className="w-full flex flex-col items-center gap-3">
            <HandTracker />
            <p className="text-xs text-center max-w-md text-slate-600">
              Hold one or both hands up in front of the camera. You should
              see the skeleton track smoothly, with no lag.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
