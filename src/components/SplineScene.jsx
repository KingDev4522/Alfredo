import { Suspense, lazy, useEffect, useRef, useState } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

function SplineFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center min-h-[220px]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-9 h-9 rounded-full border-2 animate-spin"
          style={{ borderColor: "#2DE2E6", borderTopColor: "transparent" }}
        />
        <span
          className="text-[10px] uppercase tracking-[0.25em]"
          style={{ color: "#5C6478", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Loading scene
        </span>
      </div>
    </div>
  );
}

/**
 * Thin wrapper around the Spline runtime — lazy-loaded so its (large)
 * bundle only loads on pages that actually use it, with a branded
 * fallback while the scene boots.
 *
 * unmountWhenOffscreen: Spline scenes keep their WebGL render loop
 * running continuously even while scrolled far out of view, which is
 * what causes scroll jank on pages with a big hero canvas. When this
 * is true, the canvas is unmounted (freeing the GPU context) once the
 * scene is well outside the viewport, and remounted if the user
 * scrolls back near it.
 *
 * scale: enlarging this component's container does NOT make the 3D
 * object itself bigger — Spline's own camera framing just reveals
 * more empty space around it. To actually make the subject look
 * bigger, we CSS-zoom the rendered output itself (cropped by the
 * container's overflow:hidden).
 */
export function SplineScene({ scene, className = "", style, onLoad, unmountWhenOffscreen = false, scale = 1 }) {
  const containerRef = useRef(null);
  const [isNear, setIsNear] = useState(true);

  useEffect(() => {
    if (!unmountWhenOffscreen) return undefined;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsNear(entry.isIntersecting),
      { rootMargin: "10% 0px 10% 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [unmountWhenOffscreen]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", overflow: "hidden", ...style }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "center center",
        }}
      >
        {isNear ? (
          <Suspense fallback={<SplineFallback />}>
            <Spline scene={scene} onLoad={onLoad} style={{ width: "100%", height: "100%" }} />
          </Suspense>
        ) : (
          <div style={{ width: "100%", height: "100%" }} />
        )}
      </div>
    </div>
  );
}
