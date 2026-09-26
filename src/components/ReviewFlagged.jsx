import { useCallback, useEffect, useMemo, useState } from "react";
import { getAllWords, syncCustomWordsWithDatabase } from "../lib/customWords";
import { deleteRecording, getAllRecordings, getSignCoverage } from "../lib/recordingStorage";
import { TARGET_REPS_PER_SIGN } from "../lib/vocabulary";
import { useAuth } from "../hooks/useAuth";
import { SkeletonPlayback } from "./SkeletonPlayback";

/*
 * Coverage status, derived from take counts against the rep target.
 *
 *   ready   at or past TARGET_REPS_PER_SIGN, so the recognizer has
 *           enough variation to work with
 *   partial something is on file but the library is thin, and a thin
 *           library is the usual cause of a sign that recognises badly
 *   missing nothing at all
 */
function coverageStatus(total) {
  if (total <= 0) return "missing";
  if (total >= TARGET_REPS_PER_SIGN) return "ready";
  return "partial";
}

const STATUS_COPY = {
  ready: { label: "Ready", className: "text-[#C8FF00]", dot: "bg-[#C8FF00]" },
  partial: { label: "Partial", className: "text-[#FFB000]", dot: "bg-[#FFB000]" },
  missing: { label: "Missing", className: "text-[rgba(242,240,232,0.46)]", dot: "bg-[rgba(242,240,232,0.28)]" },
};

export function ReviewFlagged() {
  const { isAdmin } = useAuth();
  const [allWords, setAllWords] = useState(getAllWords());
  const [nameInput, setNameInput] = useState("");
  const [scope, setScope] = useState(isAdmin ? "main" : "mine");
  const [recordings, setRecordings] = useState([]);
  const [playTokens, setPlayTokens] = useState({});
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("neutral");
  const [isLoading, setIsLoading] = useState(false);
  const [coverage, setCoverage] = useState({ shared: {}, mine: {} });
  const [isCoverageLoading, setIsCoverageLoading] = useState(true);

  const signLabelById = Object.fromEntries(allWords.map((word) => [word.id, word.label]));

  /*
   * Take counts keyed by sign id, lowercased on both sides.
   *
   * Storage writes the vocabulary slug verbatim, but nothing enforces the
   * case at the column, and a hand-imported file can carry "Hello" where
   * the vocabulary says "hello". getMainSignSet already uppercases for the
   * same reason, so matching case-insensitively here keeps the coverage
   * grid from silently reporting a word as missing.
   */
  const coverageIndex = useMemo(() => {
    const shared = {};
    const mine = {};
    for (const [id, count] of Object.entries(coverage.shared)) {
      shared[String(id).toLowerCase()] = (shared[String(id).toLowerCase()] || 0) + count;
    }
    for (const [id, count] of Object.entries(coverage.mine)) {
      mine[String(id).toLowerCase()] = (mine[String(id).toLowerCase()] || 0) + count;
    }
    return { shared, mine };
  }, [coverage]);

  const refreshCoverage = useCallback(async () => {
    try {
      setCoverage(await getSignCoverage());
    } catch {
      // getSignCoverage already swallows its own failures; this is belt and
      // braces so the panel can never take the page down with it.
      setCoverage({ shared: {}, mine: {} });
    } finally {
      setIsCoverageLoading(false);
    }
  }, []);

  useEffect(() => {
    async function sync() {
      const updated = await syncCustomWordsWithDatabase();
      if (updated) setAllWords(getAllWords());
    }
    sync();
  }, []);

  useEffect(() => {
    setScope(isAdmin ? "main" : "mine");
  }, [isAdmin]);

  useEffect(() => {
    refreshCoverage();
  }, [refreshCoverage]);

  function setFeedback(text, tone = "neutral") {
    setMessage(text);
    setMessageTone(tone);
  }

  /*
   * grouped: category -> words, so the grid mirrors how the Record picker
   * is organised rather than presenting one flat alphabet.
   *
   * Words present in the database but missing from the vocabulary still get
   * a row, labelled by a title-cased id. customWords.syncCustomWordsWithDatabase
   * normally folds those in already; this is the fallback for the window
   * before that sync resolves.
   */
  const coverageGroups = useMemo(() => {
    const known = new Set(allWords.map((word) => word.id));
    const byCategory = new Map();

    const push = (category, word) => {
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(word);
    };

    for (const word of allWords) push(word.category || "Custom", word);

    for (const [id, count] of Object.entries(coverageIndex.shared)) {
      if (known.has(id)) continue;
      push("Unlisted", {
        id,
        label: signLabelById[id] || id.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
        count,
      });
    }

    return Array.from(byCategory, ([category, words]) => ({
      category,
      words: words.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [allWords, coverageIndex, signLabelById]);

  const coverageTotals = useMemo(() => {
    let ready = 0;
    let partial = 0;
    let missing = 0;
    for (const group of coverageGroups) {
      for (const word of group.words) {
        const key = word.id.toLowerCase();
        const total = (coverageIndex.shared[key] || 0) + (coverageIndex.mine[key] || 0);
        if (coverageStatus(total) === "ready") ready += 1;
        else if (coverageStatus(total) === "partial") partial += 1;
        else missing += 1;
      }
    }
    return { ready, partial, missing, total: ready + partial + missing };
  }, [coverageGroups, coverageIndex]);

  async function loadRecordings(explicitLabel) {
    const rawLabel = explicitLabel !== undefined ? explicitLabel : nameInput;
    const query = String(rawLabel).trim().toLowerCase();
    if (!query) {
      setFeedback("Type a sign name first.", "error");
      return;
    }

    const matchingWords = allWords.filter((word) => word.label.toLowerCase().includes(query));
    if (matchingWords.length === 0) {
      setRecordings([]);
      setFeedback(`No sign matches "${String(rawLabel).trim()}". Check the spelling.`, "error");
      return;
    }

    // Non-admins are locked to My Space: they never list Shared Main takes and
    // can never delete them. The scope toggle is admin-only UI; clamp here too
    // so a crafted state cannot widen the query.
    const effectiveScope = isAdmin ? scope : "mine";
    // Storage tags personal rows source:"user" and shared rows source:"main"
    // (see recordingStorage.getAllRecordings); legacy file rows have no tag.
    const wantedSource = effectiveScope === "main" ? "main" : "user";

    setIsLoading(true);
    try {
      const matchingIds = new Set(matchingWords.map((word) => word.id));
      const allRecordings = await getAllRecordings();
      const scopedRecordings = allRecordings.filter(
        (recording) =>
          matchingIds.has(recording.signId) &&
          (!recording.source || recording.source === wantedSource),
      );
      setRecordings(scopedRecordings);
      const scopeLabel = effectiveScope === "main" ? "Shared Main" : "My Space";
      setFeedback(
        scopedRecordings.length === 0
          ? `${scopeLabel} has no recordings for ${matchingWords
              .map((word) => `"${word.label}"`)
              .join(", ")}.`
          : `Found ${scopedRecordings.length} recording(s) in ${scopeLabel}.`,
        scopedRecordings.length === 0 ? "error" : "success",
      );
    } catch (loadError) {
      setFeedback(loadError.message || "Could not load recordings.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(recording) {
    // Belt-and-braces: a non-admin must never delete a Shared Main take, even
    // if a stale row somehow renders. Storage + RLS enforce this too.
    if (!isAdmin && recording.source === "main") {
      setFeedback("Shared Main recordings can only be removed by an admin.", "error");
      return;
    }
    const sourceLabel =
      recording.source === "main"
        ? "Shared Main"
        : recording.source === "user"
          ? "My Space"
          : "Legacy file";
    const confirmed = window.confirm(
      `Delete recording ${recording.id} from ${sourceLabel}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      const result = await deleteRecording(recording.id);
      setRecordings((current) => current.filter((item) => item.id !== recording.id));
      refreshCoverage();
      const mirrorNote =
        result && result.fileMirror > 0
          ? ` Legacy file copies removed: ${result.fileMirror}.`
          : "";
      setFeedback(`Deleted recording ${recording.id}.${mirrorNote}`, "success");
    } catch (deleteError) {
      setFeedback(deleteError.message || "Delete failed. Check your account scope.", "error");
    }
  }

  function replay(id) {
    setPlayTokens((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
  }

  return (
    <div className="grid w-full gap-4">
      {/*
        Coverage. Answers "which words are already on file" without making
        anyone remember, which is the whole point: the search box below only
        works if you already know what to type.
      */}
      <section className="cyber-panel grid gap-4 p-4 sm:p-5" aria-label="Recording coverage">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="ss-eyebrow">Library coverage</span>
            <h2 className="m-0 text-xl font-semibold tracking-tight text-[#F2F0E8]">
              What is already recorded
            </h2>
          </div>
          <span className="font-mono text-xs text-[rgba(242,240,232,0.68)]">
            target {TARGET_REPS_PER_SIGN} takes per sign
          </span>
        </div>

        {isCoverageLoading ? (
          <p className="m-0 text-sm text-[rgba(242,240,232,0.46)]" role="status">
            Reading the database...
          </p>
        ) : (
          <>
            <p className="m-0 font-mono text-xs text-[rgba(242,240,232,0.68)]" role="status">
              <span className="text-[#C8FF00]">{coverageTotals.ready} ready</span>
              {" // "}
              <span className="text-[#FFB000]">{coverageTotals.partial} partial</span>
              {" // "}
              <span>{coverageTotals.missing} missing</span>
              {" of "}
              {coverageTotals.total}
            </p>

            <div className="grid gap-4">
              {coverageGroups.map((group) => (
                <div key={group.category} className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(242,240,232,0.46)]">
                    {group.category}
                  </span>
                  <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
                    {group.words.map((word) => {
                      const key = word.id.toLowerCase();
                      const sharedCount = coverageIndex.shared[key] || 0;
                      const mineCount = coverageIndex.mine[key] || 0;
                      const total = sharedCount + mineCount;
                      const status = coverageStatus(total);
                      const copy = STATUS_COPY[status];
                      const inSharedMain = sharedCount > 0;

                      return (
                        <li key={word.id}>
                          {/*
                            A button, not a div: the row is the fastest route
                            into the takes, and it has to be reachable by
                            keyboard. explicitLabel is passed rather than
                            relying on setNameInput, because state does not
                            settle before the click handler reads it.
                          */}
                          <button
                            type="button"
                            onClick={() => {
                              setNameInput(word.label);
                              loadRecordings(word.label);
                            }}
                            className={`flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors ${
                              inSharedMain
                                ? "border-[#55F6E5]/30 hover:border-[#55F6E5]/60"
                                : "border-white/10 hover:border-white/30"
                            } ${status === "missing" ? "border-dashed" : ""}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 flex-none rounded-full ${copy.dot}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-[#F2F0E8]">
                                {word.label}
                              </span>
                              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgba(242,240,232,0.46)]">
                                {total === 0
                                  ? "no takes"
                                  : `${total} take${total === 1 ? "" : "s"}`}
                                {inSharedMain ? " // shared main" : ""}
                                {mineCount > 0 ? ` // ${mineCount} yours` : ""}
                              </span>
                            </span>
                            <span className={`font-mono text-[10px] uppercase ${copy.className}`}>
                              {copy.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="cyber-panel grid gap-4 p-4 sm:p-5" aria-label="Recording search">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold tracking-tight text-[#F2F0E8]">Locate a sign</h2>
          </div>
          {isAdmin && (
            <div className="flex border border-white/10" aria-label="Recording scope">
              <button
                type="button"
                onClick={() => setScope("main")}
                className={`px-3 py-2 text-xs ${scope === "main" ? "bg-[#FFB000] text-[#050505]" : "bg-black text-[#F2F0E8]"}`}
              >
                Shared Main
              </button>
              <button
                type="button"
                onClick={() => setScope("mine")}
                className={`border-l border-white/10 px-3 py-2 text-xs ${scope === "mine" ? "bg-[#55F6E5] text-[#050505]" : "bg-black text-[#F2F0E8]"}`}
              >
                My Space
              </button>
            </div>
          )}
        </div>

        <label className="cyber-login__label" htmlFor="review-sign-name">
          Sign name
        </label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            id="review-sign-name"
            type="text"
            list="sign-name-options"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && loadRecordings()}
            placeholder="Hello, Help, Water"
            className="cyber-field"
          />
          <button
            type="button"
            onClick={loadRecordings}
            disabled={isLoading}
            className="cyber-button cyber-button--primary"
          >
            {isLoading ? "Scanning" : "Load recordings"}
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <datalist id="sign-name-options">
          {allWords.map((word) => (
            <option key={word.id} value={word.label} />
          ))}
        </datalist>

        {message && (
          <p
            className={`m-0 text-sm ${messageTone === "error" ? "text-[#FFB000]" : "text-[#C8FF00]"}`}
            role={messageTone === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </section>

      {recordings.length === 0 && !isLoading ? (
        <section className="cyber-panel grid min-h-52 place-items-center p-6 text-center">
          <div>
            <span className="ss-eyebrow justify-center before:hidden">Review queue idle</span>
            <h2 className="m-0 text-2xl font-semibold uppercase tracking-tight text-[#F2F0E8]">
              No takes loaded
            </h2>
            <p className="mt-2 text-sm text-[rgba(242,240,232,0.68)]">
              Search a sign to load its skeleton recordings.
            </p>
          </div>
        </section>
      ) : (
        recordings.map((recording) => (
          <article
            key={recording.id}
            className="cyber-panel grid items-center gap-4 p-4 sm:grid-cols-[auto_1fr]"
          >
            <SkeletonPlayback
              frames={recording.frames}
              isPlaying
              playToken={playTokens[recording.id] || 0}
            />
            <div className="grid min-w-0 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-lg font-semibold text-[#F2F0E8]">
                  {signLabelById[recording.signId] || recording.signId}
                </h3>
                <span className="border border-[#55F6E5]/40 px-2 py-1 font-mono text-[10px] uppercase text-[#55F6E5]">
                  {recording.source === "main"
                    ? "Shared Main"
                    : recording.source === "user"
                      ? "My Space"
                      : "Legacy file"}
                </span>
              </div>
              <span className="font-mono text-xs text-[rgba(242,240,232,0.46)]">
                ID {recording.id} // Batch {recording.conditionLabel || "unspecified"}
              </span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => replay(recording.id)} className="cyber-button">
                  Replay
                  <span aria-hidden="true">↻</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(recording)}
                  className="cyber-button cyber-button--danger"
                >
                  Delete take
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
