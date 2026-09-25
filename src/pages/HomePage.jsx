import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SplineScene } from "../components/SplineScene";
import { TARGET_REPS_PER_SIGN } from "../lib/vocabulary";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const TYPOGRAPHY_SCENE = "https://prod.spline.design/FOYvTNdQV-YTCA0U/scene.splinecode";

const STEPS = [
  {
    key: "interpret",
    to: "/interpret",
    color: "#2DE2E6",
    title: "Interpret",
    detail: [
      "MediaPipe tracks your hand landmarks live, on-device.",
      "Each gesture is matched against your own recorded signs.",
      "Recognized words build a sentence as you sign.",
      "Lower your hands (or tap Speak Now) to hear it aloud.",
    ],
  },
  {
    key: "record",
    to: "/record",
    color: "#FF4D6D",
    title: "Record a sign",
    detail: [
      "Pick a sign from the vocabulary, or add a custom word.",
      "Enter a recorder name and batch label for traceability.",
      "A 3-2-1 countdown captures your hand motion each rep.",
      `Repeat until you reach the target of ${TARGET_REPS_PER_SIGN} reps.`,
    ],
  },
  {
    key: "delete",
    to: "/delete",
    color: "#FFB627",
    title: "Delete a recording",
    detail: [
      "Type a sign's name to pull up every recording for it.",
      "Replay each one's skeleton to check the actual motion.",
      "Delete only the bad ones — the rest stay untouched.",
    ],
  },
];

export function HomePage() {
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  const glowRef = useRef(null);
  const ctaRef = useRef(null);
  const [heroActive, setHeroActive] = useState(true);

  // The glow behind the hero uses a heavy blur + mix-blend-mode, which is
  // expensive to keep compositing during scroll. Stop rendering it at all
  // once the hero is well out of view (same idea as SplineScene's own
  // off-screen unmount, applied here to the glow layer specifically).
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroActive(entry.isIntersecting),
      { rootMargin: "10% 0px 10% 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Hero mount animation
  useGSAP(
    () => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".home-cta-btn", { autoAlpha: 0, y: 16, duration: 0.6 })
        .from(".home-spline-wrap", { autoAlpha: 0, scale: 0.95, duration: 0.9 }, "-=0.35");
    },
    { scope: rootRef }
  );

  // Mousemove — a soft light drifts toward the cursor, blended over the scene
  useGSAP(
    () => {
      const glow = glowRef.current;
      const hero = heroRef.current;
      if (!glow || !hero) return;

      const xTo = gsap.quickTo(glow, "left", { duration: 0.9, ease: "power3.out" });
      const yTo = gsap.quickTo(glow, "top", { duration: 0.9, ease: "power3.out" });

      function onMove(e) {
        const rect = hero.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        xTo(`${px}%`);
        yTo(`${py}%`);
      }
      function onLeave() {
        xTo("50%");
        yTo("30%");
      }

      hero.addEventListener("mousemove", onMove);
      hero.addEventListener("mouseleave", onLeave);
      return () => {
        hero.removeEventListener("mousemove", onMove);
        hero.removeEventListener("mouseleave", onLeave);
      };
    },
    { scope: rootRef, dependencies: [heroActive] }
  );

  // CTA hover — glow + scale
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

  // Scroll-reveal for the lower sections
  useGSAP(
    () => {
      gsap.utils.toArray(".reveal-section").forEach((section) => {
        gsap.from(section.querySelectorAll(".reveal-item"), {
          autoAlpha: 0,
          y: 24,
          stagger: 0.08,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: "top 78%",
          },
        });
      });
    },
    { scope: rootRef }
  );

  return (
    <div ref={rootRef} className="w-full flex flex-col items-center">
      {/* Hero — the Spline scene IS the hero, full-bleed, no card */}
      <div
        ref={heroRef}
        className="relative w-full overflow-hidden"
        style={{ height: "92vh", backgroundColor: "#050505" }}
      >
        {/* Spline scene — fills the entire hero, no rounding, no clipping frame */}
        <div
          className="home-spline-wrap absolute w-full h-full"
          style={{ top: "-16%", left: 0 }}
        >
          <SplineScene
            scene={TYPOGRAPHY_SCENE}
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Soft light that drifts toward the cursor, screen-blended over the scene.
            Skipped entirely once scrolled away — blur + blend-mode are expensive
            to keep compositing during scroll. */}
        {heroActive && (
          <div
            ref={glowRef}
            className="absolute pointer-events-none z-20"
            style={{
              top: "30%",
              left: "50%",
              width: "55%",
              height: "55%",
              transform: "translate(-50%, -50%)",
              background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0) 70%)",
              filter: "blur(90px)",
              mixBlendMode: "screen",
            }}
          />
        )}

        {/* CTA — floats over the scene, roughly beneath its baked-in text */}
        <div
          className="absolute inset-x-0 z-30 flex justify-center px-4"
          style={{ top: "70%" }}
        >
          <Link
            ref={ctaRef}
            to="/interpret"
            className="home-cta-btn backdrop-blur-md relative inline-flex items-center gap-3 px-8 py-4 rounded-full border text-sm sm:text-base font-semibold tracking-wide"
            style={{
              borderColor: "rgba(255,255,255,0.22)",
              backgroundColor: "rgba(255,255,255,0.05)",
              color: "#F5F6F8",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Start Translating
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* How each flow actually works */}
      <section className="reveal-section w-full max-w-5xl mx-auto px-4 sm:px-8 pt-8 pb-20 flex flex-col gap-14">
        <div className="reveal-item text-center flex flex-col gap-2">
          <span
            className="text-xs uppercase tracking-[0.3em]"
            style={{ color: "#5C6478", fontFamily: "'JetBrains Mono', monospace" }}
          >
            How it works
          </span>
          <h2
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F2F4F8" }}
          >
            Follow These Steps
          </h2>
        </div>

        {STEPS.map((step) => (
          <div key={step.key} className="reveal-item grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
            <div className="sm:col-span-1 flex sm:flex-col items-center sm:items-start gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: step.color, boxShadow: `0 0 12px ${step.color}` }}
              />
              <Link
                to={step.to}
                className="text-lg font-bold hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F2F4F8" }}
              >
                {step.title}
              </Link>
            </div>
            <ol className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {step.detail.map((line, idx) => (
                <li key={idx} className="text-sm flex gap-2" style={{ color: "#9AA1B4" }}>
                  <span className="font-mono flex-shrink-0" style={{ color: step.color }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}
