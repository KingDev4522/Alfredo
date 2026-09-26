/**
 * AI sentence formation for the interpreter tab.
 *
 * The hardcoded grammar (sentenceGrammar.js) covers the common patterns.
 * When one or more recognized words fall through with no rule, this module
 * asks the backend (`POST /api/sentence`), which tries Groq then Gemini
 * across their configured fallback model chains. Anything the backend
 * answers is spoken instead of the literal words; on ANY failure (no keys,
 * offline, slow network) the sync grammar result is used unchanged, so
 * speech never breaks because the AI is unreachable.
 */

import { buildSpokenPhrases } from "./sentenceGrammar";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const SENTENCE_URL = `${API_BASE}/api/sentence`;
const TRANSLATE_URL = `${API_BASE}/api/translate`;
// Upper bound for the whole AI attempt — the backend already times out each
// model individually; this just guarantees speech is never held hostage.
const AI_TIMEOUT_MS = 20000;

/**
 * Returns { phrases, aiUsed, corrections }. `phrases` is always usable —
 * either the AI sentence (single phrase) or the plain grammar result as
 * fallback. `corrections` is [{from, to}] when the backend completed
 * partial letter strings ("watr" -> "water"); empty when input was whole.
 */
export async function buildSpokenPhrasesWithAI(signIds, { autoGrammar = true, knownWords = [] } = {}) {
  const fallbackWords = [];
  const phrases = buildSpokenPhrases(signIds, { autoGrammar, fallbackOut: fallbackWords });

  // Grammar covered everything (or is off) — no AI needed.
  if (!autoGrammar || fallbackWords.length === 0) {
    return { phrases, aiUsed: false, corrections: [] };
  }

  // Locked rule: ONE signed token is spoken literally, never expanded into
  // a sentence. A single "A" must stay the letter A (or the single word) —
  // the user may be spelling or naming one thing, and any sentence the AI
  // invents around it ("I need water" for WATER) is a fabrication. Sentence
  // formation only starts at two or more tokens.
  if (signIds.length <= 1) {
    return { phrases, aiUsed: false, corrections: [] };
  }

  try {
    const res = await fetch(SENTENCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // knownWords lets the backend complete partial letter strings
      // (custom words included) before asking the LLM — ids and/or labels.
      body: JSON.stringify({ words: signIds, knownWords }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`sentence API: HTTP ${res.status}`);
    const data = await res.json();
    const sentence = typeof data?.sentence === "string" ? data.sentence.trim() : "";
    // Reject degenerate replies (punctuation, single chars) — fall back to
    // the literal words rather than speaking garbage aloud.
    if (!sentence || !/[A-Za-z]{2,}/.test(sentence)) {
      throw new Error("sentence API: degenerate reply");
    }
    const corrections = Array.isArray(data?.corrections)
      ? data.corrections.filter((c) => c && typeof c.from === "string" && typeof c.to === "string")
      : [];
    return { phrases: [sentence], aiUsed: true, corrections };
  } catch (err) {
    // Offline, no keys, all models failed, too slow — speak the literal
    // words exactly as before. Log once for debuggability.
    console.warn("[sentenceAI] falling back to literal words:", err?.message || err);
    return { phrases, aiUsed: false, corrections: [] };
  }
}

/**
 * Translates a finished English sentence to Hindi (Devanagari) via the
 * backend translation chain. Throws on ANY failure so the caller can fall
 * back to speaking the English text — translation must never break speech.
 */
export async function translateToHindi(englishText) {
  const res = await fetch(TRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: englishText }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`translate API: HTTP ${res.status}`);
  const data = await res.json();
  const hindi = typeof data?.translation === "string" ? data.translation.trim() : "";
  // Must actually be Hindi (Devanagari) — an echoed-English or fragment
  // reply is unusable for Hindi speech.
  if (!hindi || !/[\u0900-\u097F]/.test(hindi)) {
    throw new Error("translate API: no Devanagari reply");
  }
  return hindi;
}
