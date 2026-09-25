import { useEffect, useState } from "react";
import { getAllWords, syncCustomWordsWithDatabase } from "../lib/customWords";
import { deleteRecording, getAllRecordings } from "../lib/recordingStorage";
import { useAuth } from "../hooks/useAuth";
import { SkeletonPlayback } from "./SkeletonPlayback";

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

  const signLabelById = Object.fromEntries(allWords.map((word) => [word.id, word.label]));

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

  function setFeedback(text, tone = "neutral") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function loadRecordings() {
    const query = nameInput.trim().toLowerCase();
    if (!query) {
      setFeedback("Type a sign name first.", "error");
      return;
    }

    const matchingWords = allWords.filter((word) => word.label.toLowerCase().includes(query));
    if (matchingWords.length === 0) {
      setRecordings([]);
      setFeedback(`No sign matches "${nameInput.trim()}". Check the spelling.`, "error");
      return;
    }

    setIsLoading(true);
    try {
      const matchingIds = new Set(matchingWords.map((word) => word.id));
      const allRecordings = await getAllRecordings();
      const scopedRecordings = allRecordings.filter(
        (recording) =>
          matchingIds.has(recording.signId) && (!recording.source || recording.source === scope),
      );
      setRecordings(scopedRecordings);
      const scopeLabel = scope === "main" ? "Shared Main" : "My Space";
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
      <section className="cyber-panel grid gap-4 p-4 sm:p-5" aria-label="Recording search">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="cyber-page__eyebrow !mb-1">Scope // {scope === "main" ? "Shared Main" : "My Space"}</span>
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
            <span className="cyber-page__eyebrow justify-center before:hidden">Review queue idle</span>
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
