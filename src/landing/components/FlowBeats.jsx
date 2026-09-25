import { Link } from 'react-router-dom';
import FlowArt, { FlowSection } from './ui/story-scroll.jsx';

/*
 * FLOW BEATS - "One flow. Three beats."
 * Story-scroll manner: full-screen panels pin and swing in over each other.
 * Full-bleed saturated colorways, one per beat:
 * crimson → electric → aqua → deep crimson.
 */

function Body({ dark = false, children }) {
  return (
    <p className={`max-w-[52ch] text-[clamp(1rem,2vw,1.5rem)] font-normal leading-relaxed ${dark ? 'text-black/80' : 'text-white/90'}`}>
      {children}
    </p>
  );
}

function Meta({ dark = false, items }) {
  return (
    <div className="mt-[2vw] flex flex-wrap gap-x-8 gap-y-2">
      {items.map((m) => (
        <span key={m} className={`font-mono-tech text-[10.5px] uppercase tracking-[0.2em] ${dark ? 'text-black/70' : 'text-white/75'}`}>
          {m}
        </span>
      ))}
    </div>
  );
}

const DISPLAY = 'font-display text-[clamp(3.2rem,11vw,12.5rem)] font-bold uppercase leading-[0.86] tracking-[-0.02em]';
const SERIF = 'font-serif-aesthetic font-normal normal-case italic tracking-[-0.01em]';

export default function FlowBeats() {
  return (
    // id="pipeline" restores the nav anchor (the parked Pipeline section's
    // "One flow. Three beats." content lives here now).
    <div id="pipeline" className="relative">
    <FlowArt aria-label="How SignSpeak flows">
      {/* 00 - Intro on crimson */}
      <FlowSection aria-label="One flow, three beats" style={{ backgroundColor: '#C5003C', color: '#FFF8F0' }}>
        <div>
          <h2 className={`${DISPLAY} text-center`}>
            One flow.
            <br />
            <span className={`${SERIF} text-black`}>Three beats.</span>
          </h2>
        </div>
        <div>
          <hr className="mb-[2vw] border-none border-t border-white/50" />
          <Body>
            Camera to understanding to speech: three movements, one continuous
            motion. Nothing leaves your device.
          </Body>
          <Meta items={['Camera', 'Templates', 'Grammar', 'Voice']} />
        </div>
      </FlowSection>

      {/* 01 - Segment & Track on electric */}
      <FlowSection aria-label="Beat one: segment and track" style={{ backgroundColor: '#F3E600', color: '#000000' }}>
        <div>
          <h2 className={`${DISPLAY} text-black`}>
            Read
            <br />
            <span className={`${SERIF} text-deep-crimson`}>the hand.</span>
          </h2>
        </div>
        <div>
          <hr className="mb-[2vw] border-none border-t border-black/50" />
          <Body dark>
            Motion segmentation splits continuous signing into discrete gestures.
            21 landmarks per frame, 60 frames per second.
          </Body>
          <Meta dark items={['MediaPipe', 'WASM', '21 landmarks']} />
        </div>
      </FlowSection>

      {/* 02 - Match & Grammar on aqua */}
      <FlowSection aria-label="Beat two: match and grammar" style={{ backgroundColor: '#55EAD4', color: '#000000' }}>
        <div>
          <h2 className={`${DISPLAY} text-black`}>
            Match
            <br />
            <span className={`${SERIF} text-deep-crimson`}>the sign.</span>
          </h2>
        </div>
        <div>
          <hr className="mb-[2vw] border-none border-t border-black/50" />
          <Body dark>
            Dynamic time warping matches trajectories against your local templates.
            FLAN-T5 turns gloss into grammatical English.
          </Body>
          <Meta dark items={['DTW 0.36', 'FLAN-T5', 'IndexedDB']} />
        </div>
      </FlowSection>

      {/* 03 - Speak on deep crimson */}
      <FlowSection aria-label="Beat three: speak" style={{ backgroundColor: '#880425', color: '#FFF8F0' }}>
        <div>
          <h2 className={DISPLAY}>
            Speak
            <br />
            <span className={`${SERIF} text-electric`}>it aloud.</span>
          </h2>
        </div>
        <div>
          <hr className="mb-[2vw] border-none border-t border-white/50" />
          <Body>
            Neural voice broadcast the instant the sign completes. No queue,
            no round-trip. Raise your hand.
          </Body>
          <div className="mt-[2vw] flex flex-wrap items-center gap-x-8 gap-y-2">
            <Meta items={['Whisper', 'WebAudio', '0 bytes out']} />
            <Link
              to="/interpret"
              className="group font-mono-tech text-[10.5px] uppercase tracking-[0.2em] text-white"
            >
              Open the studio
              <span aria-hidden="true" className="ml-2 inline-block text-electric transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px">↗</span>
            </Link>
          </div>
        </div>
      </FlowSection>
    </FlowArt>
    </div>
  );
}
