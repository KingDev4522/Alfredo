import { buildTemplateLibrary, classifySequence } from "./recognizer.js";

/**
 * PRD 02 v2 §5.1 + §5.3 - merged Main + User library with hard custom priority.
 *
 * - Union keeps EVERY template (no handCount / motion exclusion).
 * - Stage A: DTW against user templates only. Accept on threshold.
 * - Stage B: DTW against main templates only. Accept on threshold.
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
 * Two-stage classify: user library first (hard custom-wins), then main.
 * Returns { ...result, source } where source is 'you' | 'shared' | null.
 */
export function classifyWithPriority(liveFrames, mergedLibrary, options = {}) {
  const { threshold, ...dtwOptions } = options;

  if (mergedLibrary.userCount > 0) {
    const userResult = classifySequence(liveFrames, mergedLibrary.user, dtwOptions);
    const limit = threshold ?? options.confidenceThreshold ?? 0.36;
    if (userResult.signId && userResult.confidence >= limit) {
      return { ...userResult, source: "you" };
    }
  }

  const mainResult = classifySequence(liveFrames, mergedLibrary.main, dtwOptions);
  if (!mainResult.signId) return { ...mainResult, source: null };
  return { ...mainResult, source: "shared" };
}

/**
 * Avatar golden pick - PRD 02 v2 §5.2.
 * candidates: array of { frames, handCount, created_at, source }
 * Order: user latest > main 2-hand latest > main 1-hand latest > null.
 */
export function pickAvatarGolden(candidates = []) {
  const users = candidates.filter((c) => c.source === "user");
  if (users.length > 0) {
    users.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return users[0];
  }
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
  return null;
}
