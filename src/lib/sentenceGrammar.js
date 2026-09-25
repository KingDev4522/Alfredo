/**
 * Turns a raw sequence of recognized sign IDs into natural-sounding
 * spoken phrases, by inserting the connecting words (am, is, need, a...)
 * that ISL itself doesn't sign but English needs.
 *
 * WHY THIS EXISTS: real ISL — like most sign languages — generally
 * doesn't have dedicated signs for prepositions and joining verbs. It
 * relies on context and word order instead. That means a literal
 * word-for-word reading of recognized signs ("I. Pain. Help. Doctor.")
 * is accurate to what was signed, but sounds broken and telegraphic when
 * spoken aloud. Rather than asking the user to learn/teach a custom
 * gesture for every "is," "am," "a," and "in," this module handles that
 * translation in software, using simple, explainable rules — not a full
 * NLP system, just enough to cover this vocabulary's realistic patterns.
 *
 * This is deliberately a set of small, readable rules rather than a
 * black box, so it's easy to extend if more signs are added later.
 */

// Words that work as "<Subject> am/are <word>" — a state or condition.
const STATE_WORDS = new Set(["pain", "hungry"]);

// Words that work as "<Subject> need(s) <word>" — a request.
const NEED_WORDS = new Set(["water", "food", "help", "doctor"]);

// Some need-words read better with "a" in front ("a doctor" not "doctor").
const NEEDS_ARTICLE = new Set(["doctor"]);

const SUBJECT_TEXT = { i_me: "I", you: "You" };
const SUBJECT_BE = { i_me: "am", you: "are" };
const SUBJECT_NEED = { i_me: "need", you: "need" };

// Overrides for how a word should actually be SPOKEN, when it differs
// from its on-screen label (e.g. "Good / Bad" reads oddly aloud).
const SPOKEN_AS = {
  thank_you: "thank you",
  i_me: "I",
  good_bad: "good",
  one: "one",
  two: "two",
  three: "three",
  four: "four",
};

function spokenWord(signId) {
  return SPOKEN_AS[signId] || signId.replace(/_/g, " ");
}

/**
 * Converts an array of recognized sign IDs (in the order they were
 * signed) into an array of natural-language phrases, ready to be joined
 * with periods and spoken aloud.
 *
 * This walks the sequence looking for small, specific patterns — a
 * subject followed by a state/need word, or a question word paired with
 * "you"/"name" — and only falls back to speaking a word on its own when
 * nothing more specific matches. That fallback is exactly the plain,
 * literal reading we're trying to improve on, so nothing is ever lost —
 * it's only ever made more natural where a rule applies.
 */
export function buildSpokenPhrases(signIds, { autoGrammar = true } = {}) {
  const phrases = [];
  let i = 0;

  while (i < signIds.length) {
    const current = signIds[i];

    if (autoGrammar) {
      const next = signIds[i + 1];
      const nextNext = signIds[i + 2];

      // "What"/"Name"/"You" in any adjacent order all mean the same
      // question — real ISL word order commonly puts the question word
      // last (topic-comment structure), but signers won't always do this
      // the same way, so we match the words as a set, not a fixed order.
      const windowOf3 = new Set([current, next, nextNext]);
      const windowOf2 = new Set([current, next]);

      if (setEquals(windowOf3, new Set(["what", "name", "you"]))) {
        phrases.push("What is your name?");
        i += 3;
        continue;
      }
      if (setEquals(windowOf2, new Set(["what", "name"]))) {
        phrases.push("What is your name?");
        i += 2;
        continue;
      }
      if (current === "where" && next === "you") {
        phrases.push("Where are you?");
        i += 2;
        continue;
      }
      if (current === "how" && next === "you") {
        phrases.push("How are you?");
        i += 2;
        continue;
      }

      // Subject + state word: "I" + "pain" -> "I am in pain."
      if (SUBJECT_TEXT[current] && next && STATE_WORDS.has(next)) {
        const subject = SUBJECT_TEXT[current];
        const be = SUBJECT_BE[current];
        const preposition = next === "pain" ? "in " : "";
        phrases.push(`${subject} ${be} ${preposition}${spokenWord(next)}`);
        i += 2;
        continue;
      }

      // Subject + need word: "I" + "water" -> "I need water."
      if (SUBJECT_TEXT[current] && next && NEED_WORDS.has(next)) {
        const subject = SUBJECT_TEXT[current];
        const need = SUBJECT_NEED[current];
        const article = NEEDS_ARTICLE.has(next) ? "a " : "";
        phrases.push(`${subject} ${need} ${article}${spokenWord(next)}`);
        i += 2;
        continue;
      }

      // A state/need word on its own (no preceding subject) still reads
      // better with "I" assumed — the most common real use case for this
      // vocabulary is describing your own condition or need.
      if (STATE_WORDS.has(current)) {
        const preposition = current === "pain" ? "in " : "";
        phrases.push(`I am ${preposition}${spokenWord(current)}`);
        i += 1;
        continue;
      }
      if (NEED_WORDS.has(current)) {
        const article = NEEDS_ARTICLE.has(current) ? "a " : "";
        phrases.push(`I need ${article}${spokenWord(current)}`);
        i += 1;
        continue;
      }
    }

    // Standalone courtesy/exclamation/number words — spoken as-is. Also
    // the path every word takes when autoGrammar is off: no injected
    // subject/verb/article, just the word itself, so the signer's own
    // choice and order of signs is what gets spoken, unaltered.
    phrases.push(capitalize(spokenWord(current)));
    i += 1;
  }

  return phrases;
}

/**
 * Joins phrases into one final spoken sentence, adding sentence-ending
 * punctuation so the browser's text-to-speech gives each phrase a natural
 * pause rather than running everything together.
 */
export function phrasesToSpeechText(phrases) {
  return phrases
    .map((p) => (/[.?!]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
