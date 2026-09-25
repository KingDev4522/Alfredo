/**
 * The fixed 25-word vocabulary for the hackathon build, grouped by
 * category for a more organized recording screen.
 *
 * twoHanded signs need BOTH hands visible and tracked during recording.
 * The recording tool uses this flag to warn if the wrong number of hands
 * is visible before letting you save a recording for that sign.
 */
export const VOCABULARY = [
  // Courtesy
  { id: "hello", label: "Hello", category: "Courtesy", twoHanded: false },
  { id: "thank_you", label: "Thank you", category: "Courtesy", twoHanded: false },
  { id: "please", label: "Please", category: "Courtesy", twoHanded: false },
  { id: "sorry", label: "Sorry", category: "Courtesy", twoHanded: false },
  { id: "yes", label: "Yes", category: "Courtesy", twoHanded: false },
  { id: "no", label: "No", category: "Courtesy", twoHanded: false },

  // Needs & Emergency
  { id: "help", label: "Help", category: "Needs & Emergency", twoHanded: false },
  { id: "water", label: "Water", category: "Needs & Emergency", twoHanded: false },
  { id: "food", label: "Food", category: "Needs & Emergency", twoHanded: false },
  { id: "hungry", label: "Hungry", category: "Needs & Emergency", twoHanded: false },
  { id: "pain", label: "Pain", category: "Needs & Emergency", twoHanded: false },
  { id: "doctor", label: "Doctor", category: "Needs & Emergency", twoHanded: false },
  { id: "emergency", label: "Emergency", category: "Needs & Emergency", twoHanded: false },
  { id: "stop", label: "Stop", category: "Needs & Emergency", twoHanded: false },

  // Identity & Questions
  { id: "i_me", label: "I / Me", category: "Identity & Questions", twoHanded: false },
  { id: "you", label: "You", category: "Identity & Questions", twoHanded: false },
  { id: "name", label: "Name", category: "Identity & Questions", twoHanded: false },
  { id: "what", label: "What", category: "Identity & Questions", twoHanded: false },
  { id: "where", label: "Where", category: "Identity & Questions", twoHanded: false },
  { id: "how", label: "How", category: "Identity & Questions", twoHanded: false },

  // Numbers
  { id: "one", label: "1", category: "Numbers", twoHanded: false },
  { id: "two", label: "2", category: "Numbers", twoHanded: false },
  { id: "three", label: "3", category: "Numbers", twoHanded: false },
  { id: "four", label: "4", category: "Numbers", twoHanded: false },
  // "five" was deliberately dropped from the vocabulary during Phase 3
  // accuracy testing and is no longer recorded or supported — the
  // vocabulary is 25 solid signs rather than 26 with one shaky entry.

  // State
  { id: "good_bad", label: "Good / Bad", category: "State", twoHanded: false },
];

// This is a target to aim for, not a hard limit — you can record more
// than this per sign if you want, and doing so with deliberate variation
// (different angle, distance, lighting) genuinely helps recognition
// generalize better, especially when one person is recording everything
// alone rather than pooling recordings from multiple people.
export const TARGET_REPS_PER_SIGN = 15;

export function getCategories() {
  const seen = new Set();
  const categories = [];
  for (const word of VOCABULARY) {
    if (!seen.has(word.category)) {
      seen.add(word.category);
      categories.push(word.category);
    }
  }
  return categories;
}
