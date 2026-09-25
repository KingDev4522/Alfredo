import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export const FlowSection = ({ className, style = {}, children, 'aria-label': ariaLabel }) => (
  <section
    data-flow-section
    aria-label={ariaLabel}
    className={cx('relative min-h-screen w-full overflow-hidden', className)}
  >
    <div
      data-flow-inner
      className={cx(
        'flow-art-container relative flex min-h-screen w-full flex-col justify-between gap-6 px-[4vw] pt-[clamp(2rem,8vw,4vw)] pb-[4vw]',
        'will-change-transform',
      )}
      style={{ transformOrigin: 'bottom left', ...style }}
    >
      {children}
    </div>
  </section>
);

const childCount = (children) => React.Children.count(children);

const FlowArt = ({ children, className, 'aria-label': ariaLabel = 'Story scroll' }) => {
  const containerRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!containerRef.current || reducedMotion) return undefined;

    const sections = Array.from(
      containerRef.current.querySelectorAll('[data-flow-section]'),
    );
    if (sections.length === 0) return undefined;

    const triggers = [];
    const ctx = gsap.context(() => {
      sections.forEach((section, i) => {
        gsap.set(section, { zIndex: i + 1 });

        const inner = section.querySelector('.flow-art-container');
        if (!inner) return;

        if (i > 0) {
          // fromTo + immediateRender:false: the panel stays straight and its
          // copy stays readable if the scrub trigger never fires (stale
          // measurements from late JPG/font loads, Lenis desync). The swing
          // only applies while the trigger is actively scrubbing.
          const tween = gsap.fromTo(
            inner,
            { rotation: 30, transformOrigin: 'bottom left' },
            {
              rotation: 0,
              ease: 'none',
              immediateRender: false,
              scrollTrigger: {
                trigger: section,
                start: 'top bottom',
                end: 'top 25%',
                scrub: true,
              },
            },
          );
          if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
        }

        if (i < sections.length - 1) {
          triggers.push(
            ScrollTrigger.create({
              trigger: section,
              start: 'bottom bottom',
              end: 'bottom top',
              pin: true,
              pinSpacing: false,
              anticipatePin: 1,
            }),
          );
        }
      });

      ScrollTrigger.refresh();
    }, containerRef);

    return () => {
      triggers.forEach((t) => t.kill());
      ctx.revert();
    };
  }, [childCount(children), reducedMotion]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      className={cx('w-full overflow-x-hidden', className)}
    >
      {children}
    </div>
  );
};

export default FlowArt;
