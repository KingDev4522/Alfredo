import { VOCABULARY } from "./vocabulary";

/**
 * Custom words — for things with no fixed ISL sign, like a person's own
 * name — work with zero extra recognition code. Since the recognizer
 * just groups recordings by whatever signId is actually in the data (see
 * buildTemplateLibrary in recognizer.js), a custom word recorded through
 * the exact same Record Signs flow is picked up by the live interpreter
 * automatically, the moment it's recorded — no retraining, no separate
 * pipeline. This file only needs to solve one small remaining problem:
 * letting the person define a new word's label before they've recorded
 * anything for it yet, and remembering that definition across reloads.
 *
 * Stored in localStorage rather than IndexedDB — this is tiny metadata
 * (a label and an id), not landmark data, so a heavier database doesn't
 * add anything here.
 */
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

function slugify(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Adds a new custom word from a typed label, returning the created word
 * (or the existing one, if this exact word was already added — adding
 * the same word twice just reuses it rather than creating a duplicate).
 * Returns null if the label was empty/invalid.
 */
export function addCustomWord(label) {
  const id = slugify(label);
  if (!id) return null;

  const words = getCustomWords();
  const existing = words.find((w) => w.id === id);
  if (existing) return existing;

  const newWord = { id, label: label.trim(), category: "Custom", twoHanded: false };
  saveCustomWords([...words, newWord]);
  return newWord;
}

export function removeCustomWord(id) {
  saveCustomWords(getCustomWords().filter((w) => w.id !== id));
}

/** The fixed vocabulary plus any custom words, for anywhere that needs
 * the complete, current word list — the sign picker, label lookups, etc.
 */
export function getAllWords() {
  return [...VOCABULARY, ...getCustomWords()];
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
