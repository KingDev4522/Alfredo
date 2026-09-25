import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { useAuth } from '../../hooks/useAuth'
import { API_BASE_URL } from '../../lib/supabaseClient'
import { STUDIO_ROUTES, isStudioPath } from '../../lib/routes'

/*
 * NAV - full-bleed editorial header, no container, no boundaries.
 * Individual elements float over a black-blur melt (same language as the
 * hero → engine bridge): frosted blur masked into transparency + a black
 * gradient, so the bar blends into whatever scrolls beneath it.
 *
 * Universal: studio (dashboard) routes centered, one shared CTA, and an
 * always-visible auth slot - Gmail avatar + email + Log out when signed
 * in, Log in when signed out. Every destination is a real route from
 * lib/routes.js, so nothing here can point at a missing page.
 */

function UserAvatar({ user }) {
  const url = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-neutral-200"
      >
        {(user?.email?.[0] ?? 'S').toUpperCase()}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      width="28"
      height="28"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={(event) => {
        event.currentTarget.style.display = 'none'
      }}
      className="block h-7 w-7 shrink-0 rounded-full border border-white/15 object-cover outline-none"
    />
  )
}
export default function Nav() {
  const barRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAdmin, signOut } = useAuth()
  const [backendStatus, setBackendStatus] = useState('checking')

  const onStudioRoute = isStudioPath(location.pathname)


  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Backend health - same probe the old dashboard Navbar ran (instant on
  // studio routes, 10s polling while translating).
  useEffect(() => {
    if (!onStudioRoute) return undefined
    let activeController = null
    let pollingInterval = null

    const checkStatus = async () => {
      if (activeController) activeController.abort()
      activeController = new AbortController()
      const signal = activeController.signal
      const timeoutId = window.setTimeout(() => activeController?.abort(), 5000)
      try {
        const response = await fetch(`${API_BASE_URL}/`, { signal })
        if (!signal.aborted) setBackendStatus(response.ok ? 'online' : 'offline')
      } catch {
        if (!signal.aborted) setBackendStatus('offline')
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    checkStatus()
    if (location.pathname === '/translate') {
      pollingInterval = window.setInterval(checkStatus, 10000)
    }

    return () => {
      if (pollingInterval) window.clearInterval(pollingInterval)
      if (activeController) activeController.abort()
    }
  }, [onStudioRoute, location.pathname])

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    navigate('/login')
  }

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return undefined
    const ctx = gsap.context(() => {
      gsap.from(barRef.current, {
        y: -24,
        opacity: 0,
        duration: 1,
        delay: 0.3,
        ease: 'power4.out',
      })
    })
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Blur melt - frost first, only a kiss of black for legibility */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 h-[150px]">
        <div className="absolute inset-0 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_30%,transparent_96%)] [-webkit-mask-image:linear-gradient(to_bottom,black_30%,transparent_96%)]" />
        <div
          className={`absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.32),rgba(0,0,0,0.1)_52%,transparent)] transition-opacity duration-500 ${
            scrolled ? 'opacity-100' : 'opacity-70'
          }`}
        />
      </div>

      <div ref={barRef} className="relative flex h-[76px] items-center gap-8 px-6 [text-shadow:0_1px_14px_rgba(0,0,0,0.5)] md:px-10">
        {/* Brand - LOGO artwork, rendered borderless (black melts into the bar, no frame) */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 border-0 bg-transparent p-0 outline-none"
          aria-label="SignSpeak home"
        >
          <img
            src="/logo-nav.png"
            alt=""
            width="40"
            height="40"
            draggable={false}
            className="block h-10 w-10 border-0 bg-transparent object-contain outline-none"
          />
          <span className="text-[15px] font-semibold tracking-tight text-neutral-50">SignSpeak</span>
        </Link>

        {/* Links - free-floating, no container */}
        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-300 ${
                isActive ? 'text-amber-100' : 'text-neutral-400 hover:text-neutral-50'
              }`
            }
          >
            Home
          </NavLink>
          {STUDIO_ROUTES.map((l) => (
            <NavLink
              key={l.path}
              to={l.path}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-300 ${
                  isActive ? 'text-amber-100' : 'text-neutral-400 hover:text-neutral-50'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 lg:hidden" />

        {/* Backend status - studio-only (polls while on /translate).
            Auth slot - always visible: avatar + email + Log out when
            signed in, Log in when signed out. */}
        <div className="hidden items-center gap-4 lg:flex">
          {onStudioRoute && (
            <div
              className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-neutral-500 ss-site-nav__status--${backendStatus}`}
              role="status"
              aria-live="polite"
              title={`Backend ${backendStatus}`}
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" />
              {backendStatus === 'checking'
                ? 'Checking'
                : backendStatus === 'online'
                  ? 'Online'
                  : 'Offline'}
            </div>
          )}
          {user ? (
            <div className="flex max-w-[16rem] items-center gap-2.5 font-mono text-[11px] text-neutral-500">
              <UserAvatar user={user} />
              <span title={user.email} className="truncate">
                {user.email}
              </span>
              {isAdmin && <span className="ss-admin-badge">Admin</span>}
              <button
                type="button"
                onClick={handleSignOut}
                className="shrink-0 text-neutral-400 transition-colors duration-300 hover:text-neutral-50"
              >
                Log out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="group relative flex items-center gap-1.5 text-[13px] font-semibold text-neutral-100 transition-colors duration-300 hover:text-amber-100"
            >
              Log in
              <span aria-hidden="true" className="text-amber-200 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">
                →
              </span>
            </Link>
          )}
        </div>

        {/* CTA - quiet editorial link, no box. Hidden on studio routes:
            you're already in the studio, so the button is removed entirely. */}
        {!onStudioRoute && (
          <Link
            to="/interpret"
            className="group relative hidden items-center gap-1.5 text-[13px] font-semibold text-neutral-100 transition-colors duration-300 hover:text-amber-100 sm:flex"
          >
            Launch Studio
            <span aria-hidden="true" className="text-amber-200 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">
              ↗
            </span>
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-amber-200/70 transition-transform duration-500 group-hover:scale-x-100"
            />
          </Link>
        )}

        {/* Mobile toggle - bare lines, no box */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-10 w-10 items-center justify-center text-neutral-200 lg:hidden"
        >
          <span className="relative block h-3 w-4" aria-hidden="true">
            <span
              className={`absolute left-0 top-0 h-[1.5px] w-full bg-current transition-transform duration-300 ${
                open ? 'translate-y-[5px] rotate-45' : ''
              }`}
            />
            <span
              className={`absolute left-0 bottom-0 h-[1.5px] w-full bg-current transition-transform duration-300 ${
                open ? '-translate-y-[5px] -rotate-45' : ''
              }`}
            />
          </span>
        </button>
      </div>

      {/* Mobile panel - borderless blur sheet */}
      {open && (
        <div className="nav-drop relative max-h-[calc(100dvh-76px)] overflow-y-auto bg-black/60 px-6 pb-6 pt-2 backdrop-blur-xl lg:hidden">
          <p className="pt-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-neutral-600">
            Studio
          </p>
          <NavLink
            to="/"
            end
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex w-full items-center justify-between py-3.5 text-[15px] font-medium transition-colors ${
                isActive ? 'text-amber-100' : 'text-neutral-300 hover:text-neutral-50'
              }`
            }
          >
            Home
            <span aria-hidden="true" className="text-neutral-600">↗</span>
          </NavLink>
          {STUDIO_ROUTES.map((l) => (
            <NavLink
              key={l.path}
              to={l.path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex w-full items-center justify-between py-3.5 text-[15px] font-medium transition-colors ${
                  isActive ? 'text-amber-100' : 'text-neutral-300 hover:text-neutral-50'
                }`
              }
            >
              {l.label}
              <span aria-hidden="true" className="text-neutral-600">↗</span>
            </NavLink>
          ))}
          {!onStudioRoute && (
            <Link
              to="/interpret"
              onClick={() => setOpen(false)}
              className="group flex w-full items-center gap-1.5 py-3.5 text-[15px] font-semibold text-neutral-50"
            >
              Launch Studio
              <span aria-hidden="true" className="text-amber-200">↗</span>
            </Link>
          )}
          <div className="mt-3 border-t border-white/10 pt-4">
            {onStudioRoute && (
              <div
                className={`flex items-center gap-2 pb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500 ss-site-nav__status--${backendStatus}`}
                role="status"
                aria-live="polite"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" />
                Backend: {backendStatus === 'checking' ? 'Checking' : backendStatus === 'online' ? 'Online' : 'Offline'}
              </div>
            )}
            {user ? (
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-neutral-500">
                <span className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar user={user} />
                  <span title={user.email} className="truncate">
                    {user.email}
                  </span>
                </span>
                <div className="flex items-center gap-2.5">
                  {isAdmin && <span className="ss-admin-badge">Admin</span>}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-neutral-400 transition-colors duration-300 hover:text-neutral-50"
                  >
                    Log out
                  </button>
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-between py-3.5 text-[15px] font-semibold text-neutral-50"
              >
                Log in
                <span aria-hidden="true" className="text-amber-200">→</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
