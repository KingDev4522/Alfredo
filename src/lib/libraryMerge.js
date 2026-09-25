import { buildTemplateLibrary, classifySequence } from "./recognizer.js";

/**
 * Merged Main + User library with hard MAIN priority (admin goldens win).
 *
 * Edge case this fixes: a user records a custom take for a word that already
 * exists in Shared Main (same sign as admin, or a different gesture under the
 * same word). The custom take must NEVER shadow the admin golden - both the
 * Interpreter and the Translate avatar always resolve overlapping words to
 * Main. Personal takes are only used for genuinely novel words Main lacks.
 *
 * - Union keeps EVERY template (no handCount / motion exclusion).
 * - Stage A: DTW against main templates only. Accept on threshold.
 * - Stage B: DTW against user templates only. Accept on threshold.
 * - Tag each template with `source: 'user' | 'main'` for UI badges.
 */
export function tagSource(recordings, source) {
  return recordings.map((r) => ({ ...r, source }));
}

export function buildMergedLibrary(mainRecs = [], userRecs = []) {
  return {
    user: buildTemplateLibrary(tagSource(userRecs, "user")),
    main: buildTemplateLibrary(tagSource(mainRecs, "main")),
    mainCount: mainRecs.length,
    userCount: userRecs.length,
    totalCount: mainRecs.length + userRecs.length,
  };
}

/**
 * Two-stage classify: MAIN library first (hard main-wins), then user.
 * Returns { ...result, source } where source is 'shared' | 'you' | null.
 *
 * Overlapping words always resolve to Main when Main matches confidently,
 * even if a personal take is closer on raw distance. Personal takes only win
 * for novel words Main cannot match (Main rejects below threshold).
 */
export function classifyWithPriority(liveFrames, mergedLibrary, options = {}) {
  const { threshold, ...dtwOptions } = options;
  const limit = threshold ?? options.confidenceThreshold ?? 0.36;

  // Stage A: Shared Main first. Confident Main match wins outright, even if a
  // personal take for the same word would score closer on raw DTW distance.
  const mainResult = classifySequence(liveFrames, mergedLibrary.main, dtwOptions);
  if (mainResult.signId && mainResult.confidence >= limit) {
    return { ...mainResult, source: "shared" };
  }

  // Stage B: personal takes, only for words Main cannot confidently match
  // (genuinely novel custom words, or Main misses). Overlapping words that
  // reach here had no confident Main match, so a confident personal match is
  // safe to accept.
  if (mergedLibrary.userCount > 0) {
    const userResult = classifySequence(liveFrames, mergedLibrary.user, dtwOptions);
    if (userResult.signId && userResult.confidence >= limit) {
      return { ...userResult, source: "you" };
    }
    // Neither stage confident: hand back the stronger of the two so the
    // caller can reject below threshold with the best available diagnostics.
    if (userResult.signId && userResult.confidence > (mainResult.confidence || 0)) {
      return { ...userResult, source: "you" };
    }
  }

  if (!mainResult.signId) return { ...mainResult, source: null };
  return { ...mainResult, source: "shared" };
}

/**
 * Avatar golden pick - Main always wins over personal takes.
 * candidates: array of { frames, handCount, created_at, source }
 * Order: main 2-hand latest > main 1-hand latest > user latest > null.
 * Within Main the 2-hand preference is kept (richer arms + both hands);
 * a personal take is only picked when Main has NO take for that word.
 */
export function pickAvatarGolden(candidates = []) {
  const twoHand = candidates.filter((c) => c.source === "main" && c.handCount === 2);
  if (twoHand.length > 0) {
    twoHand.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return twoHand[0];
  }
  const oneHand = candidates.filter((c) => c.source === "main" && c.handCount === 1);
  if (oneHand.length > 0) {
    oneHand.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return oneHand[0];
  }
  // No Main take for this word: fall back to the user's latest personal take
  // (novel custom words only). Overlapping words never reach here with a Main
  // take present.
  const users = candidates.filter((c) => c.source === "user");
  if (users.length > 0) {
    users.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return users[0];
  }
  return null;
}
