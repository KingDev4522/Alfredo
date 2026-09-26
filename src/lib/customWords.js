import { VOCABULARY } from "./vocabulary";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getSignCoverage } from "./recordingStorage";

// Custom words: Supabase `custom_words` when configured, localStorage fallback otherwise.
// Global admin words (is_global) are visible to everyone; personal words are owner-only.

const STORAGE_KEY = "isl-custom-words";

export function getCustomWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomWords(words) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

export function slugify(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function addCustomWord(label, explicitId = null) {
  const id = explicitId || slugify(label);
  if (!id) return null;

  // never shadow the fixed vocabulary - e.g. recording signId "food" must not
  // create a second Custom "food" entry that collides on key={word.id}
  if (VOCABULARY.some((w) => w.id === id)) {
    return VOCABULARY.find((w) => w.id === id);
  }

  const words = getCustomWords();
  const existing = words.find((w) => w.id === id);
  if (existing) return existing;

  const newWord = { id, label: label.trim(), category: "Custom", twoHanded: false };
  saveCustomWords([...words, newWord]);

  // Fire-and-forget cloud mirror (best effort; RLS decides).
  if (isSupabaseConfigured && supabase) {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      supabase.from("custom_words").upsert(
        { owner_id: user.id, word_id: id, label: label.trim(), is_global: false },
        { onConflict: "owner_id,word_id" }
      );
    });
  }
  return newWord;
}

export function removeCustomWord(id) {
  saveCustomWords(getCustomWords().filter((w) => w.id !== id));
  if (isSupabaseConfigured && supabase) {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      supabase.from("custom_words").delete().eq("owner_id", user.id).eq("word_id", id);
    });
  }
}

export function getAllWords() {
  // deduplicate - a stale localStorage entry for "food"/"hello" must not
  // produce two React children with the same key
  const vocabIds = new Set(VOCABULARY.map((w) => w.id));
  const customs = getCustomWords().filter((w) => !vocabIds.has(w.id));
  // self-heal: purge any stale shadowing entries from storage
  if (customs.length !== getCustomWords().length) {
    try { saveCustomWords(customs); } catch {}
  }
  return [...VOCABULARY, ...customs];
}

export function getAllCategories() {
  const seen = new Set();
  const categories = [];
  for (const word of getAllWords()) {
    if (!seen.has(word.category)) {
      seen.add(word.category);
      categories.push(word.category);
    }
  }
  return categories;
}

export async function syncCustomWordsWithDatabase() {
  try {
    // Merge cloud words first (global + own), then unknown signIds from recordings.
    if (isSupabaseConfigured && supabase) {
      const { data: session } = await supabase.auth.getSession();
      const user = session.session?.user;
      const { data: cloudWords } = await supabase
        .from("custom_words")
        .select("owner_id, word_id, label, is_global");
      const known = new Set(getAllWords().map((w) => w.id));
      for (const cw of cloudWords || []) {
        if (cw.is_global || (user && cw.owner_id === user.id)) {
          if (!known.has(cw.word_id)) {
            addCustomWord(cw.label, cw.word_id);
            known.add(cw.word_id);
          }
        }
      }
    }
    // Which sign ids exist in the database. getSignCoverage selects sign_id
    // only, so this is a few KB. It used to call getAllRecordings, which
    // hydrated every frames blob from both tables in order to read the same
    // set of ids off each row — the entire recording library, downloaded as
    // landmark JSON, on every page load, from three separate mount effects.
    const { shared, mine } = await getSignCoverage();
    const currentWords = getAllWords();
    const knownIds = new Set(currentWords.map(w => w.id));

    const dbIds = new Set([...Object.keys(shared), ...Object.keys(mine)]);
    for (const id of dbIds) {
      if (!knownIds.has(id)) {
        const label = id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        addCustomWord(label, id);
      }
    }
    // Success = sync completed without throwing, even if nothing new was found.
    return true;
  } catch (err) {
    console.error("Failed to sync custom words with database:", err);
    return false;
  }
}
