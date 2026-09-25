import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Showcase from './components/Showcase.jsx'
import Privacy from './components/Privacy.jsx'
// import Pipeline from './components/Pipeline.jsx' — parked: "One flow. Three beats." returns later
import FlowBeats from './components/FlowBeats.jsx'
import DatasetStudio from './components/DatasetStudio.jsx'
import Gateway from './components/Gateway.jsx'
import Grain from './components/Grain.jsx'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  const [ready, setReady] = useState(false)
  const lenisRef = useRef(null)

  const scrollTo = useCallback((target) => {
    lenisRef.current?.scrollTo(target, { duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) })
  }, [])

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
    })
    lenisRef.current = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    setReady(true)

    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    if (ready) ScrollTrigger.refresh()
  }, [ready])

  return (
    <main className="relative bg-[#070709] text-neutral-100 min-h-[100dvh]">
      <Grain />
      <Nav onNavigate={scrollTo} />
      <Hero />
      <Showcase />
      <Privacy />
      {/* <Pipeline /> — parked for now */}
      <FlowBeats />
      <DatasetStudio />
      <Gateway />
      {/* Bottom oval melt — transparent frost only, no black */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[210px]">
        <div className="absolute inset-0 backdrop-blur-[10px] [mask-image:radial-gradient(ellipse_80%_108%_at_50%_112%,black_30%,transparent_74%)] [-webkit-mask-image:radial-gradient(ellipse_80%_108%_at_50%_112%,black_30%,transparent_74%)]" />
      </div>
    </main>
  )
}
