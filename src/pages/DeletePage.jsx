import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ReviewFlagged } from "../components/ReviewFlagged";

gsap.registerPlugin(useGSAP);

export function DeletePage() {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".delete-eyebrow", { autoAlpha: 0, y: -12, duration: 0.5 })
        .from(".delete-title", { autoAlpha: 0, y: 16, duration: 0.6 }, "-=0.25")
        .from(".delete-tagline", { autoAlpha: 0, y: 10, duration: 0.5 }, "-=0.35")
        .from(".delete-panel", { autoAlpha: 0, y: 20, duration: 0.6 }, "-=0.25");
    },
    { scope: rootRef }
  );

  return (
    <div ref={rootRef} className="w-full min-h-[80vh] flex flex-col items-center px-4 sm:px-8 pt-16 pb-24">
      <span
        className="delete-eyebrow text-xs uppercase tracking-[0.3em] mb-4"
        style={{ color: "#FFB627", fontFamily: "'JetBrains Mono', monospace" }}
      >
        Delete Recordings
      </span>
      <h1
        className="delete-title text-3xl sm:text-4xl font-bold text-center"
        style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F2F4F8" }}
      >
        Surgical cleanup, not a wipe
      </h1>
      <p className="delete-tagline mt-3 max-w-lg text-sm text-center" style={{ color: "#9AA1B4" }}>
        Type a sign's name to pull up every recording for it, replay each
        one's actual motion, and remove only the ones genuinely hurting
        accuracy — every other recording for that sign stays put.
      </p>

      <div className="delete-panel w-full mt-12">
        <ReviewFlagged />
      </div>
    </div>
  );
}
