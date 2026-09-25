import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Nav from "../landing/components/Nav.jsx";
import { sectionIdForPath } from "../lib/routes";
import Hero from "../landing/components/Hero.jsx";
import Showcase from "../landing/components/Showcase.jsx";
import Privacy from "../landing/components/Privacy.jsx";
import FlowBeats from "../landing/components/FlowBeats.jsx";
import Manifesto from "../landing/components/Manifesto.jsx";
import Gateway from "../landing/components/Gateway.jsx";
import Footer from "../landing/components/Footer.jsx";
import Grain from "../landing/components/Grain.jsx";
import Preloader from "../landing/components/Preloader.jsx";
import "../landing/landing.css";

gsap.registerPlugin(ScrollTrigger);

// Public marketing page at `/`. Ported from signspeak-landing/src/App.jsx.
// Owns a Lenis smooth-scroll instance for its lifetime only - destroyed on
// unmount so studio routes (/interpret, /translate, …) keep native scrolling.
export function LandingPage() {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const lenisRef = useRef(null);

  // Section routes ("/engine", "/how", ...) map to an in-page anchor. "/" maps
  // to null, which means the top of the page.
  const sectionId = sectionIdForPath(pathname);

  // Nav anchor handler. Falls back to native smooth scroll when Lenis is
  // unavailable or the selector matches nothing, so nav links never go dead.
  const scrollTo = useCallback((target) => {
    const lenis = lenisRef.current;
    try {
      if (lenis) {
        const exists =
          typeof target === "number" ||
          (typeof target === "string" && document.querySelector(target));
        if (exists) {
          lenis.scrollTo(target, {
            duration: 1.4,
            easing: (t) => 1 - Math.pow(1 - t, 4),
          });
          return;
        }
      }
    } catch {
      /* fall through to native scroll */
    }
    if (typeof target === "number") {
      window.scrollTo({ top: target, behavior: "smooth" });
    } else if (typeof target === "string") {
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
    });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add("landing-scroll");
    // Hold scroll until the preloader hands over - the hero entrance
    // then plays exactly once, underneath the lifting curtain.
    lenis.stop();
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
    setReady(true);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
      document.body.style.overflow = "";
      document.documentElement.classList.remove("landing-scroll");
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  // Preloader handoff: release scroll and play the held hero entrance.
  const handleIntroDone = useCallback(() => {
    setIntroDone(true);
    lenisRef.current?.start();
    document.body.style.overflow = "";
    ScrollTrigger.refresh();
  }, []);

  useEffect(() => {
    if (ready && introDone) ScrollTrigger.refresh();
  }, [ready, introDone]);

  // Section deep links. The section is identified by the route path, never by
  // a URL fragment, so "/engine" is shareable and refresh-safe. Scroll waits
  // for the intro handoff and retries briefly while images and fonts shift
  // layout.
  useEffect(() => {
    if (!ready || !introDone || !sectionId) return undefined;
    const selector = `#${sectionId}`;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (document.querySelector(selector)) {
        scrollTo(selector);
        window.clearInterval(timer);
      } else if (attempts >= 10) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [ready, introDone, sectionId, scrollTo]);

  // Pins + trigger positions are measured before JPGs/fonts arrive - 
  // re-measure once they do so copy reveals fire and strips stay full-bleed.
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    const fontsReady = document.fonts?.ready?.then(refresh).catch(() => {});
    const timer = window.setTimeout(refresh, 2500);
    return () => {
      window.removeEventListener("load", refresh);
      window.clearTimeout(timer);
      void fontsReady;
    };
  }, []);

  return (
    <div className="landing-root relative bg-[#070709] text-neutral-100 min-h-[100dvh] w-full self-stretch">
      {!introDone && <Preloader onDone={handleIntroDone} />}
      <Grain />
      <Nav />
      <Hero start={introDone} />
      <Showcase />
      <Privacy />
      <FlowBeats />
      <Manifesto />
      <Gateway />
      <Footer />
      {/* Bottom oval melt - transparent frost only, no black */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[210px]">
        <div className="absolute inset-0 backdrop-blur-[10px] [mask-image:radial-gradient(ellipse_80%_108%_at_50%_112%,black_30%,transparent_74%)] [-webkit-mask-image:radial-gradient(ellipse_80%_108%_at_50%_112%,black_30%,transparent_74%)]" />
      </div>
    </div>
  );
}
