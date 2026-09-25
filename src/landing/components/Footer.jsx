import { Link, NavLink } from 'react-router-dom'
import BatSwarm from './BatSwarm.jsx'
import { LANDING_SECTIONS, STUDIO_ROUTES } from '../../lib/routes'

/*
 * FOOTER - top row holds the brand mark plus link columns; below it a big
 * full-bleed space carries a giant textured SIGNSPEAK wordmark in the style
 * of the reference (dark grunge letters on black, cropped at the edge).
 * Explore links are real routes, not page fragments.
 */

function BrandMark() {
  return (
    <img
      src="/logo-nav.png"
      alt=""
      width="40"
      height="40"
      draggable={false}
      className="block h-10 w-10 border-0 bg-transparent object-contain outline-none"
    />
  )
}

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-black" aria-label="Site footer">
      <div className="relative mx-auto max-w-6xl px-6 pt-16 md:pt-20">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-[16px] font-semibold tracking-tight text-neutral-50">SignSpeak</span>
            </div>
            <p className="mt-4 text-[13.5px] leading-relaxed text-neutral-500">
              On-device Indian Sign Language interpretation. Camera to spoken sentence, private by design.
            </p>
            <Link
              to="/interpret"
              className="group mt-6 inline-flex items-center gap-1.5 font-mono-tech text-[12px] uppercase tracking-[0.18em] text-neutral-200 transition-colors duration-300 hover:text-amber-bright"
            >
              Launch Studio
              <span aria-hidden="true" className="text-amber-bright transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">↗</span>
            </Link>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <nav aria-label="Studio">
              <p className="font-mono-tech text-[10.5px] uppercase tracking-[0.24em] text-neutral-600">Studio</p>
              <ul className="mt-5 space-y-3.5">
                {STUDIO_ROUTES.map((l) => (
                  <li key={l.path}>
                    <NavLink
                      to={l.path}
                      className="text-[14px] font-medium text-neutral-400 transition-colors duration-300 hover:text-neutral-50"
                    >
                      {l.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Explore">
              <p className="font-mono-tech text-[10.5px] uppercase tracking-[0.24em] text-neutral-600">Explore</p>
              <ul className="mt-5 space-y-3.5">
                {LANDING_SECTIONS.map((l) => (
                  <li key={l.path}>
                    <Link
                      to={l.path}
                      className="text-[14px] font-medium text-neutral-400 transition-colors duration-300 hover:text-neutral-50"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 py-6 sm:flex-row sm:items-center">
          <p className="font-mono-tech text-[10.5px] uppercase tracking-[0.18em] text-neutral-600">
            © {new Date().getFullYear()} SignSpeak · On-device ISL
          </p>
          <Link
            to="/"
            className="group font-mono-tech text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 transition-colors duration-300 hover:text-neutral-100"
          >
            Back to top
            <span aria-hidden="true" className="ml-2 inline-block transition-transform duration-300 group-hover:-translate-y-0.5">↑</span>
          </Link>
        </div>
      </div>

      {/* Giant wordmark space + living bat layer above the text */}
      <div aria-hidden="true" className="pointer-events-none relative select-none overflow-hidden">
        <p className="footer-giant whitespace-nowrap text-center font-display font-bold uppercase">
          Alfredo
        </p>
        <BatSwarm />
      </div>
    </footer>
  )
}
