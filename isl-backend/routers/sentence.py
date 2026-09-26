"""AI sentence formation for the interpreter tab.

The frontend's hardcoded grammar (sentenceGrammar.js) covers the common
patterns. When a word or group of words has no rule, the frontend POSTs the
full recognized word list here and we ask a hosted LLM to turn it into one
natural spoken sentence.

Resolution order, configured in isl-backend/.env:

1. Each provider in SENTENCE_PROVIDER_ORDER (default: groq,gemini).
2. Within a provider, each model in GROQ_MODELS / GEMINI_MODELS left to
   right — first model that answers wins. A 404/429/5xx on one model falls
   through to the next; a 401/403 (bad key) skips the rest of that provider.
3. Anything answered is cached in memory per word-set, so repeats are free
   and instant.

If every attempt fails, this raises 503 and the frontend falls back to the
literal words — speech never breaks because the AI is unreachable.
"""

import json
import os
import re
import sys
import threading
import urllib.error
import urllib.request
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from utils.env_loader import load_env
from utils.rate_limit import check as rate_limit_check

load_env()

router = APIRouter()


def _limited(route: str, request: Request):
    """429 when this IP's token bucket for the route is empty. Frontend
    treats non-2xx as graceful fallback, so limiting never breaks speech."""
    ip = request.client.host if request and request.client else "unknown"
    allowed, retry_after = rate_limit_check(route, ip)
    if not allowed:
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(max(1, int(retry_after + 0.5)))},
            content={"detail": "Rate limit exceeded. Slow down and try again."},
        )
    return None


def _for_log(text: str) -> str:
    """Make model text safe for print(): the Windows console/file encoding
    (often cp1252) cannot encode Devanagari, which crashed /api/translate
    with UnicodeEncodeError *after* a successful translation."""
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    return str(text).encode(enc, "replace").decode(enc)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

SYSTEM_PROMPT = (
    "You convert Indian Sign Language gloss input into one natural spoken "
    "English sentence.\n"
    "What you receive: a list of tokens. Most are whole words (WATER), but "
    "some may be INCOMPLETE fragments with missing letters (WATR, HELO), "
    "JUMBLED letters (WATRE for WATER), or leftovers the backend could not "
    "complete. The backend already fixes the obvious fragments before you — "
    "what reaches you should read as words, but tolerate residue.\n"
    "HARD RULES:\n"
    "1. Use EVERY input token. Never drop, ignore, or merge away any word — "
    "each one must appear in the sentence (inflected naturally if needed). "
    "If a token still looks like letter fragments, FIRST reconstruct the "
    "most probable English word (or two) it stands for, then use the "
    "reconstruction.\n"
    "2. Fill in whatever English needs and ISL omits: the subject (assume "
    '"I" when none is signed — NEED WATER means "I need water"), verbs '
    "(am, is, need), articles (a, the), prepositions (in, to). An "
    "incomplete input still becomes a complete sentence.\n"
    "3. Output ONLY the sentence itself — no quotes, no explanation, no "
    "extra text, no listing of your reconstruction.\n"
    "4. If the words ask something, end the sentence with a question mark.\n"
    "5. If there is only ONE gloss word, output just that word itself "
    "(single letters stay the bare letter) — never build a sentence around "
    "one token.\n"
    "Examples:\n"
    "Gloss words: WHERE HOW YOU\n"
    "Where and how are you?\n"
    "Gloss words: I_ME PAIN\n"
    "I am in pain.\n"
    "Gloss words: I_ME WATER\n"
    "I need water.\n"
    "Gloss words: WATER\n"
    "I need water.\n"
    "Gloss words: THANK_YOU\n"
    "Thank you.\n"
    "Gloss words: WHAT NAME YOU\n"
    "What is your name?\n"
    "Gloss words: WATRE\n"
    "I need water.\n"
    "Gloss words: HELO DOCTOR\n"
    "Hello, I need a doctor."
)

# Signs whose spoken form is a choice or a pronoun: at least one of these
# surface forms must appear (whole word, case-insensitive).
_CHOICE_WORDS = {
    "good_bad": ("good", "bad"),
    "i_me": ("i", "me"),
}


# --- Letter-level judging: completing INCOMPLETE letter strings -----------
# This is NOT anagram/unscrambling. The input is a partial letter sequence
# (missing letters, e.g. fingerspelled "watr" or a cut-off custom label) and
# the job is to complete it to the full known word ("water").
# correct_words() normalizes each input (case/space/underscore/punctuation
# insensitive), then: (1) exact match keeps it; (2) a UNIQUE prefix of a
# known word completes it ("hel" -> "hello", only if no other known word
# starts the same way — ambiguous prefixes are left untouched, we never
# guess between two words); (3) otherwise the closest known word within
# edit distance <=1 (short) / <=2 (long) wins — this covers dropped middle
# letters ("wtr" -> "water"). Anything far stays as-is: we complete letters,
# we never invent words.
FIXED_VOCAB_IDS = [
    "hello", "thank_you", "please", "sorry", "yes", "no",
    "help", "water", "food", "hungry", "pain", "doctor", "emergency", "stop",
    "i_me", "you", "name", "what", "where", "how",
    "one", "two", "three", "four", "good_bad",
]


def _norm_key(text: str) -> str:
    """Canonical key: lowercase alphanumeric only (thank_you == Thank You)."""
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def _edit_distance(a: str, b: str) -> int:
    """Levenshtein distance, stdlib only. Short strings: O(n*m), trivial."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[len(b)]


def _known_table(extra_words) -> dict:
    """norm-key -> canonical signId. Fixed vocab first, then caller extras
    (frontend custom words as ids and/or {id,label}); first writer wins so
    the fixed vocabulary can never be shadowed by a custom label."""
    table = {}
    for sign_id in FIXED_VOCAB_IDS:
        table.setdefault(_norm_key(sign_id), sign_id)
    for item in extra_words or []:
        if isinstance(item, dict):
            candidates = [item.get("id"), item.get("label")]
        else:
            candidates = [item]
        sign_id = None
        for c in candidates:
            if isinstance(c, str) and c.strip():
                sign_id = c.strip()
                break
        if not sign_id:
            continue
        for c in candidates:
            if isinstance(c, str) and c.strip():
                table.setdefault(_norm_key(c), sign_id)
    return table


def _is_subsequence(short: str, long: str) -> bool:
    """True if every char of short appears in long, in order (possibly with
    gaps). 'wtr' is a subsequence of 'water' (dropped vowels); 'het' is
    NOT a subsequence of 'yes'. This is the core incomplete-letters test."""
    it = iter(long)
    return all(ch in it for ch in short)


def _single_word(key: str, table: dict):
    """Complete ONE letter string to a canonical signId, or None.
    Order: exact -> anagram (WATRE->water) -> unique prefix -> closest
    (subsequence-aware). Shared by single tokens and blob-split halves."""
    if not key or key in table:
        return (table[key] if key in table else None), 0
    if len(key) <= 1:
        return None, None
    # Anagram: same letters, any order — exactly one known word may own the
    # multiset ("tops" -> "stop"). Shared multisets stay untouched.
    key_sorted = "".join(sorted(key))
    anagram = [(kk, sid) for kk, sid in table.items()
               if len(kk) == len(key) and "".join(sorted(kk)) == key_sorted]
    if len(anagram) == 1:
        return anagram[0][1], 0
    # Unique-prefix completion ("do" -> "doctor"). Ambiguous prefixes
    # ("he" -> hello/help) fall through instead of guessing.
    cands = [(kk, sid) for kk, sid in table.items()
             if len(kk) > len(key) and kk.startswith(key)]
    if len(cands) == 1:
        return cands[0][1], 0
    # Closest-match completion for dropped middle letters. 3+ letters that
    # read as a subsequence of the known word may be up to distance 2 away;
    # anything else (incl. every 2-letter input) must be distance <= 1.
    best_id, best_dist = None, None
    for known_key, sign_id in table.items():
        if len(known_key) <= 1:
            continue
        dist = _edit_distance(key, known_key)
        allowed = 2 if (len(key) >= 3 and _is_subsequence(key, known_key)) else 1
        if dist <= allowed and (best_dist is None or dist < best_dist):
            best_dist, best_id = dist, sign_id
    return best_id, best_dist


def _split_blob(key: str, table: dict):
    """Split a run-together two-word blob ("hellowater", "watrehelo") into
    [word1, word2]. Every split with both halves >= 2 letters is tried; both
    halves must complete via _single_word (exact/prefix/edit, NOT a further
    split). Best = smallest total edit distance, ties -> shortest left part.
    Returns None when nothing clean splits — the token stays untouched for
    the LLM to judge from context instead of us guessing."""
    if len(key) < 6:
        return None
    best = None
    for i in range(2, len(key) - 1):
        left, right = key[:i], key[i:]
        if len(right) < 2:
            continue
        lid, ldist = _single_word(left, table)
        if lid is None:
            continue
        rid, rdist = _single_word(right, table)
        if rid is None:
            continue
        total = (ldist or 0) + (rdist or 0)
        if best is None or total < best[0]:
            best = (total, [lid, rid])
    return best[1] if best else None


def correct_words(words: list, extra_words=None) -> tuple:
    """Return (completed_words, corrections). corrections is a list of
    {"from": original, "to": canonical} for display. Order preserved."""
    table = _known_table(extra_words)
    corrected = []
    corrections = []
    for word in words:
        original = str(word)
        key = _norm_key(original)
        if not key:
            corrected.append(original)
            continue
        if key in table:
            corrected.append(original)
            continue
        # (2) Single-word completion: anagram, unique prefix, closest.
        hit, _dist = _single_word(key, table)
        if hit is not None:
            corrected.append(hit)
            corrections.append({"from": original, "to": hit})
            continue
        # (3) Two-word blob split: fingerspelled words run together
        # ("hellowater" -> hello + water, "watrehelo" -> water + hello).
        # One token becomes two; the correction note shows both.
        parts = _split_blob(key, table)
        if parts:
            corrected.extend(parts)
            corrections.append({"from": original, "to": " ".join(parts)})
            continue
        # (4) Untouched: ambiguous, far, or non-wordy. The LLM still sees
        # it in context and _covers still guards the reply; speech falls
        # back to literal words if no model can use it.
        corrected.append(original)
    return corrected, corrections


def _required_tokens(words: list) -> list:
    """One required token group per gloss word.

    Each group is a tuple of alternative surface forms; at least one must
    appear in the sentence. Underscored ids split into parts (THANK_YOU ->
    thank + you); single letters (fingerspelled/custom) match whole-word.
    """
    groups = []
    for word in words:
        key = str(word).lower()
        if key in _CHOICE_WORDS:
            groups.append(_CHOICE_WORDS[key])
            continue
        parts = [p for p in key.split("_") if p]
        if len(parts) > 1:
            groups.append(tuple(p for p in parts if len(p) >= 2) or (parts[0],))
        else:
            groups.append((parts[0],) if parts else ())
    return [g for g in groups if g]


def _covers(sentence: str, words: list) -> bool:
    """True only if every gloss word is represented in the sentence.

    This is what rejects collapsed replies like 'How are you?' for input
    WHERE HOW YOU (WHERE missing) or fragments like ', is' for HELLO.
    Multi-letter tokens match as substrings; single letters as whole words.
    """
    lowered = sentence.lower()
    for group in _required_tokens(words):
        found = False
        for token in group:
            if len(token) == 1:
                if re.search(r"\b" + re.escape(token) + r"\b", lowered):
                    found = True
                    break
            elif token in lowered:
                found = True
                break
        if not found:
            return False
    return True

_cache = {}
_cache_lock = threading.Lock()


class SentenceRequest(BaseModel):
    words: list
    # Frontend custom words as ids and/or {id,label} — lets completion know
    # words the fixed vocabulary doesn't have. Optional; missing = fixed
    # vocab only. Extra entries never shadow fixed ids (first writer wins).
    knownWords: list = []


class TranslateRequest(BaseModel):
    text: str


TRANSLATE_PROMPT = (
    "Translate the following English sentence into Hindi. Use Devanagari "
    "script. Keep the meaning and tone exactly. Output ONLY the Hindi "
    "translation — no quotes, no explanation, no extra text.\n"
    "English: Where and how are you?\n"
    "Hindi: आप कहाँ हैं और कैसे हैं?\n"
    "English: I need water.\n"
    "Hindi: मुझे पानी चाहिए।"
)

_translate_cache = {}


def _call_groq_translate(text: str, model: str, api_key: str, timeout: float, max_tokens: int) -> str:
    body = _post_json(
        GROQ_URL,
        {
            "model": model,
            "messages": [
                {"role": "system", "content": TRANSLATE_PROMPT},
                {"role": "user", "content": "English: " + text},
            ],
            "temperature": 0.2,
            "max_tokens": max_tokens,
        },
        {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + api_key,
            # Groq sits behind Cloudflare, which rejects the default
            # Python-urllib user agent (HTTP 403 code 1010) before the
            # request ever reaches the API.
            "User-Agent": "ISL-Interpreter/1.0",
        },
        timeout,
    )
    return _clean_sentence(body["choices"][0]["message"]["content"])


def _call_gemini_translate(text: str, model: str, api_key: str, timeout: float, max_tokens: int) -> str:
    url = GEMINI_URL_TEMPLATE.format(model=model) + "?key=" + api_key
    body = _post_json(
        url,
        {
            "contents": [
                {"parts": [{"text": TRANSLATE_PROMPT + "\n\nEnglish: " + text}]}
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": max_tokens,
            },
        },
        {"Content-Type": "application/json"},
        timeout,
    )
    candidates = body.get("candidates") or []
    if not candidates:
        raise ValueError(f"Gemini returned no candidates for model '{model}'")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
    return _clean_sentence("".join(texts))


def _try_translate_provider(provider: str, text: str, timeout: float, max_tokens: int):
    """Try each model of one provider for translation; return (translation, model) or None."""
    if provider == "groq":
        api_key = os.environ.get("GROQ_API_KEY", "")
        models = _setting_list(
            "GROQ_MODELS",
            "openai/gpt-oss-20b,qwen/qwen3.8-27b,openai/gpt-oss-120b",
        )
        caller = _call_groq_translate
    elif provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY", "")
        models = _setting_list(
            "GEMINI_MODELS",
            "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash-lite",
        )
        caller = _call_gemini_translate
    else:
        print(f"[translate] unknown provider '{provider}' — skipping.")
        return None

    if not api_key:
        print(f"[translate] {provider}: no API key configured — skipping.")
        return None

    for model in models:
        try:
            translation = caller(text, model, api_key, timeout, max_tokens)
            # A Hindi translation must contain Devanagari script — anything
            # else (echoed English, fragments) is rejected like a dropped word.
            if translation and re.search(r"[\u0900-\u097F]", translation):
                return translation, model
            print(f"[translate] {provider}/{model}: no Devanagari reply {repr(_for_log(translation))} — trying next model.")
        except urllib.error.HTTPError as e:
            print(f"[translate] {provider}/{model}: HTTP {e.code} — ", end="")
            if e.code in (401, 403):
                print("auth failed; skipping rest of this provider.")
                break
            print("trying next model.")
        except Exception as e:
            print(f"[translate] {provider}/{model}: {type(e).__name__} ({e}) — trying next model.")
    return None


@router.post("/api/translate")
def translate_text(req: TranslateRequest, request: Request):
    limited = _limited("translate", request)
    if limited is not None:
        return limited
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must be a non-empty string")
    # Cap length so one request cannot burn the whole rate-limit budget.
    text = text[:500]
    cache_key = text.lower()

    with _cache_lock:
        hit = _translate_cache.get(cache_key)
    if hit:
        translation, provider, model = hit
        return {"translation": translation, "provider": provider, "model": model, "cached": True}

    timeout = _timeout()
    max_tokens = _max_tokens()
    order = _setting_list("SENTENCE_PROVIDER_ORDER", "groq,gemini")

    for provider in order:
        result = _try_translate_provider(provider.lower(), text, timeout, max_tokens)
        if result:
            translation, model = result
            with _cache_lock:
                _translate_cache[cache_key] = (translation, provider.lower(), model)
            print(f"[translate] '{_for_log(text)}' -> '{_for_log(translation)}' ({provider}/{model})")
            return {
                "translation": translation,
                "provider": provider.lower(),
                "model": model,
                "cached": False,
            }

    raise HTTPException(
        status_code=503,
        detail="Translation unavailable: every model failed. "
        "Check GROQ_API_KEY / GEMINI_API_KEY and network access.",
    )


def _setting_list(name: str, default: str) -> list:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _timeout() -> float:
    try:
        return max(2.0, float(os.environ.get("SENTENCE_TIMEOUT_S", "8")))
    except ValueError:
        return 8.0


def _max_tokens() -> int:
    try:
        return max(16, int(os.environ.get("SENTENCE_MAX_TOKENS", "60")))
    except ValueError:
        return 60


def _post_json(url: str, payload: dict, headers: dict, timeout: float) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _clean_sentence(text: str) -> str:
    """Keep the first non-empty line, strip quotes/whitespace."""
    for line in str(text).splitlines():
        line = line.strip().strip('"').strip("'").strip()
        if line:
            return " ".join(line.split())
    return ""


def _call_groq(model: str, words: list, api_key: str, timeout: float, max_tokens: int) -> str:
    body = _post_json(
        GROQ_URL,
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "Gloss words: " + " ".join(words)},
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens,
        },
        {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + api_key,
            # Groq sits behind Cloudflare, which rejects the default
            # Python-urllib user agent (HTTP 403 code 1010) before the
            # request ever reaches the API.
            "User-Agent": "ISL-Interpreter/1.0",
        },
        timeout,
    )
    return _clean_sentence(body["choices"][0]["message"]["content"])


def _call_gemini(model: str, words: list, api_key: str, timeout: float, max_tokens: int) -> str:
    url = GEMINI_URL_TEMPLATE.format(model=model) + "?key=" + api_key
    body = _post_json(
        url,
        {
            "contents": [
                {
                    "parts": [
                        {"text": SYSTEM_PROMPT + "\n\nGloss words: " + " ".join(words)}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": max_tokens,
            },
        },
        {"Content-Type": "application/json"},
        timeout,
    )
    candidates = body.get("candidates") or []
    if not candidates:
        raise ValueError(f"Gemini returned no candidates for model '{model}'")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
    return _clean_sentence("".join(texts))


def _try_provider(provider: str, words: list, timeout: float, max_tokens: int):
    """Try each model of one provider; return (sentence, model) or None."""
    if provider == "groq":
        api_key = os.environ.get("GROQ_API_KEY", "")
        models = _setting_list(
            "GROQ_MODELS",
            "openai/gpt-oss-20b,qwen/qwen3.8-27b,openai/gpt-oss-120b",
        )
        caller = _call_groq
    elif provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY", "")
        models = _setting_list(
            "GEMINI_MODELS",
            "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash-lite",
        )
        caller = _call_gemini
    else:
        print(f"[sentence] unknown provider '{provider}' — skipping.")
        return None

    if not api_key:
        print(f"[sentence] {provider}: no API key configured — skipping.")
        return None

    for model in models:
        try:
            sentence = caller(model, words, api_key, timeout, max_tokens)
            # Accept only sentences that represent EVERY gloss word. This
            # rejects collapsed replies ('How are you?' for WHERE HOW YOU)
            # and fragments (', is' for HELLO) — the next model is tried.
            if sentence and _covers(sentence, words):
                return sentence, model
            print(f"[sentence] {provider}/{model}: dropped words {repr(_for_log(sentence))} — trying next model.")
        except urllib.error.HTTPError as e:
            print(f"[sentence] {provider}/{model}: HTTP {e.code} — ", end="")
            if e.code in (401, 403):
                print("auth failed; skipping rest of this provider.")
                break
            print("trying next model.")
        except Exception as e:
            print(f"[sentence] {provider}/{model}: {type(e).__name__} ({e}) — trying next model.")
    return None


@router.post("/api/sentence")
def make_sentence(req: SentenceRequest, request: Request):
    limited = _limited("sentence", request)
    if limited is not None:
        return limited
    words = [str(w).strip() for w in (req.words or []) if str(w).strip()]
    if not words:
        raise HTTPException(status_code=400, detail="words must be a non-empty list")
    # Cap length so one request cannot burn the whole rate-limit budget.
    words = words[:40]
    # Letter-level judging FIRST: complete partial letter strings to full
    # known words ("watr" -> "water"). The LLM is then told the completed
    # list, so it can never echo a fragment back. Cache keys on completed
    # words — "watr" and "water" share one cache entry.
    completed, corrections = correct_words(words, req.knownWords or [])
    if corrections:
        print(f"[sentence] completed letters: {corrections}")
    words = completed
    # Locked rule: ONE token is spoken literally, never expanded into a
    # sentence. No LLM call at all — "A" stays the letter A, "WATER" stays
    # the word water. Sentences only start at two or more tokens.
    if len(words) == 1:
        token = str(words[0])
        spoken = token.replace("_", " ").strip() or token
        if len(spoken) == 1:
            spoken = spoken.upper()
        elif "_" in token:
            spoken = spoken[0].upper() + spoken[1:]
        return {"sentence": spoken, "provider": "literal", "model": "single-word",
                "cached": False, "corrections": corrections, "completedWords": words}
    cache_key = tuple(w.upper() for w in words)

    with _cache_lock:
        hit = _cache.get(cache_key)
    if hit:
        sentence, provider, model = hit
        return {"sentence": sentence, "provider": provider, "model": model, "cached": True,
                "corrections": corrections, "completedWords": words}

    timeout = _timeout()
    max_tokens = _max_tokens()
    order = _setting_list("SENTENCE_PROVIDER_ORDER", "groq,gemini")

    for provider in order:
        result = _try_provider(provider.lower(), words, timeout, max_tokens)
        if result:
            sentence, model = result
            with _cache_lock:
                _cache[cache_key] = (sentence, provider.lower(), model)
            print(f"[sentence] '{_for_log(' '.join(words))}' -> '{_for_log(sentence)}' ({provider}/{model})")
            return {
                "sentence": sentence,
                "provider": provider.lower(),
                "model": model,
                "cached": False,
                "corrections": corrections,
                "completedWords": words,
            }

    raise HTTPException(
        status_code=503,
        detail="Sentence AI unavailable: no API key configured or every model failed. "
        "Check GROQ_API_KEY / GEMINI_API_KEY and network access.",
    )
