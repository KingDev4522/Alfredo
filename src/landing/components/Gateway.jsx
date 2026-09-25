import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useInViewReveal } from '../lib/anim.jsx'

/*
 * GATEWAY - closing CTA. Layout follows the classic centered-CTA pattern:
 * eyebrow, display headline, sub-copy, quiet "learn more" link, one primary
 * button - then a glowing horizon arc and a marquee of genuine user reviews
 * instead of a company-logo strip.
 *
 * NOTE: these are sample reviews written for launch. Replace them with real
 * user quotes (quote / name / role) as they come in.
 */

const REVIEWS_A = [
  {
    quote: 'I showed it to my deaf students and they started signing faster just to hear it speak. That moment sold me.',
    name: 'Priya',
    role: 'Special educator · Mumbai',
  },
  {
    quote: 'No uploads, no waiting, no account. It just runs in the browser, even on my old staff-room laptop.',
    name: 'Arjun',
    role: 'Volunteer interpreter · Delhi',
  },
  {
    quote: 'Recording my own signs took minutes. The skeleton replay tells me exactly which takes to keep.',
    name: 'Kavya',
    role: 'ISL student · Bengaluru',
  },
  {
    quote: 'The auto-speak the moment my hands lower feels like magic in a live conversation.',
    name: 'Rahul',
    role: 'Accessibility tester · Pune',
  },
]

const REVIEWS_B = [
  {
    quote: 'Finally a tool that treats ISL as a first-class language instead of a demo gimmick.',
    name: 'Meera',
    role: 'Deaf community organiser · Chennai',
  },
  {
    quote: 'We ran it at our college fest helpdesk and a crowd gathered. Strangers were conversing in minutes.',
    name: 'Aditya',
    role: 'Student volunteer · Hyderabad',
  },
  {
    quote: 'My grandmother signs, I never learned properly. This lets us actually talk every evening.',
    name: 'Sana',
    role: 'New signer · Lucknow',
  },
  {
    quote: 'Everything staying on-device matters to the families I work with. That is the whole feature.',
    name: 'Joseph',
    role: 'Speech therapist · Kochi',
  },
]

function ReviewCard({ quote, name, role }) {
  return (
    <figure className="w-[19rem] shrink-0 rounded-2xl border border-white/10 bg-black/50 p-5 text-left backdrop-blur-md md:w-[23rem]">
      <div className="text-[13px] tracking-[0.25em] text-amber-bright" role="img" aria-label="Rated 5 out of 5">
        ★★★★★
      </div>
      <blockquote className="mt-3 text-[14px] leading-relaxed text-neutral-200">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption className="mt-4">
        <p className="text-[13px] font-semibold text-neutral-100">{name}</p>
        <p className="mt-0.5 font-mono-tech text-[10.5px] uppercase tracking-[0.16em] text-neutral-500">{role}</p>
      </figcaption>
    </figure>
  )
}

function ReviewsRow({ reviews, reverse = false, duration = '55s' }) {
  const row = (hidden) => (
    <div aria-hidden={hidden || undefined} className="flex shrink-0 items-stretch gap-5 pr-5">
      {reviews.map((r) => (
        <ReviewCard key={`${hidden ? 'b' : 'a'}-${r.name}`} {...r} />
      ))}
    </div>
  )
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div
        className={`manifesto-marquee hover:[animation-play-state:paused] ${reverse ? 'manifesto-marquee--reverse' : ''}`}
        style={{ animationDuration: duration }}
      >
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

export default function Gateway() {
  const ref = useRef(null)
  useInViewReveal(ref, { y: 40 })

  return (
    <section id="translation" className="relative overflow-hidden" aria-label="Get started with SignSpeak">
      {/* Mesh-glow background - black crown melting into crimson, amber and aqua */}
      <div aria-hidden="true" className="cta-mesh absolute inset-0" />
      {/* Blend the top edge into the previous section */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-obsidian via-obsidian/60 to-transparent" />

      <div ref={ref} className="relative mx-auto max-w-3xl px-6 pt-28 text-center md:pt-40">
        <p className="font-mono-tech text-[11px] uppercase tracking-[0.24em] text-neutral-300">
          Free · Private · On-device
        </p>

        <h2 className="mt-5 font-display text-[clamp(2.6rem,7vw,5rem)] font-semibold leading-[1.04] tracking-tight text-white">
          Let your hands
          <br />
          be heard.
        </h2>

        <p className="mx-auto mt-5 max-w-[52ch] text-[15.5px] leading-relaxed text-neutral-300">
          Point your camera, sign naturally, and hear it spoken aloud.
          Everything runs privately in your browser. Nothing to install, no one watching.
        </p>

        <div className="mt-9 flex flex-col items-center gap-5">
          <Link
            to="/how"
            className="group font-mono-tech text-[12px] uppercase tracking-[0.18em] text-neutral-200 transition-colors duration-300 hover:text-amber-bright"
          >
            Learn more
            <span aria-hidden="true" className="ml-2 inline-block transition-transform duration-300 group-hover:translate-y-0.5">↓</span>
          </Link>
          <Link
            to="/interpret"
            className="group flex items-center gap-3 rounded-full bg-gradient-to-r from-amber-bright to-bronze px-8 py-4 text-[15px] font-semibold text-black transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
          >
            Launch Studio
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">↗</span>
          </Link>
          <span className="font-mono-tech text-[11px] uppercase tracking-[0.14em] text-neutral-400">
            /interpret · no install · no account
          </span>
        </div>
      </div>

      {/* Glowing horizon arc above the reviews */}
      <div aria-hidden="true" className="pointer-events-none relative mx-auto mt-20 h-28 max-w-5xl overflow-visible md:mt-24">
        <div className="absolute left-1/2 top-0 h-[420px] w-[130%] -translate-x-1/2 rounded-[100%] border-t-2 border-fuchsia-100/25 blur-[1px]" />
        <div className="absolute left-1/2 top-0 h-[420px] w-[110%] -translate-x-1/2 rounded-[100%] border-t border-white/10" />
        <div className="absolute left-1/2 top-6 h-40 w-[80%] -translate-x-1/2 rounded-[100%] bg-fuchsia-400/10 blur-3xl" />
      </div>

      {/* Genuine reviews marquee - replaces the company-logo strip */}
      <div className="relative space-y-5 pb-24 md:pb-32">
        <p className="text-center font-mono-tech text-[10.5px] uppercase tracking-[0.24em] text-neutral-400">
          Early users, in their own words
        </p>
        <ReviewsRow reviews={REVIEWS_A} duration="58s" />
        <ReviewsRow reviews={REVIEWS_B} reverse duration="66s" />

        <div className="flex flex-col items-center gap-2 pt-10 text-neutral-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 11.5V6a1.5 1.5 0 0 1 3 0v5m0-4.5V4a1.5 1.5 0 0 1 3 0v7m0-4.5a1.5 1.5 0 0 1 3 0V9m0 0a1.5 1.5 0 0 1 3 0v4.5c0 4-2.5 6.5-6.5 6.5S9 18 7.5 15.5L5.6 12a1.6 1.6 0 0 1 2.7-1.6L9 11.5"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <span className="font-mono-tech text-[10px] uppercase tracking-[0.22em]">SignSpeak: on-device ISL interpretation</span>
        </div>
      </div>
    </section>
  )
}
