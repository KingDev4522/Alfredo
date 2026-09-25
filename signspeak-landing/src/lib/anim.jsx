import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-/<>=~'

export function useSplitReveal(ref, { delay = 0, y = 90, rotate = 6, scramble = false, stagger = 0.028 } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const text = el.textContent
    el.textContent = ''
    const chars = []
    for (const ch of text) {
      const wrap = document.createElement('span')
      wrap.className = 'char-wrap'
      wrap.style.display = 'inline-block'
      wrap.style.overflow = 'hidden'
      wrap.style.verticalAlign = 'bottom'
      const inner = document.createElement('span')
      inner.className = 'char'
      inner.textContent = ch === ' ' ? '\u00A0' : ch
      wrap.appendChild(inner)
      el.appendChild(wrap)
      chars.push(inner)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set(chars, { opacity: 1 })
        return
      }
      const tween = gsap.from(chars, {
        yPercent: y,
        rotateZ: rotate,
        opacity: 0,
        duration: 1.1,
        ease: 'power4.out',
        stagger,
        delay,
      })
      if (scramble) {
        chars.forEach((c, i) => {
          if (c.textContent === '\u00A0') return
          let frame = 0
          const total = 14 + Math.floor(Math.random() * 10)
          const iv = setInterval(() => {
            frame++
            if (frame >= total) {
              clearInterval(iv)
              c.textContent = text[i] === ' ' ? '\u00A0' : text[i]
              return
            }
            c.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          }, 34)
          gsap.delayedCall(delay + 0.05 + i * stagger, () => {}, true)
        })
      }
    })
    return () => ctx.revert()
  }, [ref, delay, y, rotate, scramble, stagger])
}

export function useInViewReveal(ref, { y = 40, delay = 0, duration = 0.9 } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.from(el, {
        y,
        opacity: 0,
        filter: 'blur(8px)',
        duration,
        delay,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      })
    })
    return () => ctx.revert()
  }, [ref, y, delay, duration])
}
