import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

class SplineErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn("Spline WebGL failed, showing fallback:", err?.message);
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function SplineStaticFallback() {
  return (
    <div className="grid h-full min-h-[220px] w-full place-items-center bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.12),transparent_60%),#070A12] p-6">
      <div className="cyber-panel grid min-w-64 gap-3 p-5 text-center">
        <span className="text-sm text-[rgba(242,240,232,0.68)]">3D preview unavailable on this device. Recording still works below.</span>
      </div>
    </div>
  );
}

function SplineFallback() {
  return (
    <div className="grid min-h-[220px] w-full place-items-center bg-black p-6">
      <div className="cyber-panel grid min-w-64 gap-3 p-5 text-center">
        <span className="cyber-page__eyebrow justify-center before:hidden">Scene uplink</span>
        <span className="text-sm text-[rgba(242,240,232,0.68)]">Loading 3D capture module.</span>
        <span className="h-1 w-full bg-[#FFB000] shadow-[0_0_12px_rgba(255,176,0,0.45)]" />
      </div>
    </div>
  );
}

/**
 * Thin wrapper around the Spline runtime - lazy-loaded so its (large)
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
 * object itself bigger - Spline's own camera framing just reveals
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
          <SplineErrorBoundary fallback={<SplineStaticFallback />}>
            <Suspense fallback={<SplineFallback />}>
              <Spline scene={scene} onLoad={onLoad} style={{ width: "100%", height: "100%" }} />
            </Suspense>
          </SplineErrorBoundary>
        ) : (
          <div style={{ width: "100%", height: "100%" }} />
        )}
      </div>
    </div>
  );
}
