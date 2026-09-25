import { useState } from "react";
import { getAllRecordings, deleteRecording } from "../lib/recordingStorage";
import { getAllWords } from "../lib/customWords";
import { SkeletonPlayback } from "./SkeletonPlayback";

/**
 * A small, repeatable workflow: type the name of a sign, review every
 * recording associated with it, and delete just the genuinely bad ones.
 * This is deliberately surgical — clearing an entire sign's recordings to
 * remove one bad example would throw away every good recording alongside
 * it. (Previously this took raw numeric recording IDs from the evaluation
 * script's "individual recordings most often responsible for a wrong
 * answer" list — now it looks the sign up by name instead, so you don't
 * need the script's output on hand to browse a sign's recordings.)
 */
export function ReviewFlagged() {
  const allWords = getAllWords();
  const signLabelById = Object.fromEntries(allWords.map((w) => [w.id, w.label]));
  const [nameInput, setNameInput] = useState("");
  const [flagged, setFlagged] = useState([]); // [{ id, signId, conditionLabel, frames }]
  const [playTokens, setPlayTokens] = useState({});
  const [message, setMessage] = useState("");

  async function loadFlagged() {
    const query = nameInput.trim().toLowerCase();
    if (!query) {
      setMessage("Type a sign name first.");
      return;
    }

    const matchingWords = allWords.filter((w) => w.label.toLowerCase().includes(query));
    if (matchingWords.length === 0) {
      setFlagged([]);
      setMessage(`No sign matches "${nameInput.trim()}" — check the spelling.`);
      return;
    }
    const matchingIds = new Set(matchingWords.map((w) => w.id));

    const all = await getAllRecordings();
    const matches = all.filter((r) => matchingIds.has(r.signId));
    setFlagged(matches);
    setMessage(
      matches.length === 0
        ? `"${matchingWords.map((w) => w.label).join('", "')}" has no recordings yet.`
        : `Found ${matches.length} recording(s) for ${matchingWords.map((w) => `"${w.label}"`).join(", ")}.`
    );
  }

  async function handleDelete(id) {
    await deleteRecording(id);
    setFlagged((prev) => prev.filter((r) => r.id !== id));
    setMessage(`Deleted recording ${id}.`);
  }

  function replay(id) {
    setPlayTokens((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
        <label className="text-sm text-slate-300">
          Type the name of a sign to review every recording for it:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            list="sign-name-options"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadFlagged()}
            placeholder="e.g. Hello, Help, Water…"
            className="flex-1 rounded-md bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            onClick={loadFlagged}
            className="rounded-md bg-[#FF4D6D] px-4 py-2 font-semibold text-white"
          >
            Load recordings
          </button>
        </div>
        <datalist id="sign-name-options">
          {allWords.map((w) => (
            <option key={w.id} value={w.label} />
          ))}
        </datalist>
        {message && <p className="text-sm text-[#2DE2E6]">{message}</p>}
      </div>

      {flagged.map((recording) => (
        <div
          key={recording.id}
          className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col sm:flex-row gap-4 items-center"
        >
          <SkeletonPlayback
            frames={recording.frames}
            isPlaying={true}
            playToken={playTokens[recording.id] || 0}
          />
          <div className="flex-1 flex flex-col gap-2">
            <div>
              <span className="font-semibold text-slate-100">
                {signLabelById[recording.signId] || recording.signId}
              </span>
              <span className="ml-2 text-xs text-slate-500 font-mono">
                id: {recording.id}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              batch: {recording.conditionLabel || "unspecified"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => replay(recording.id)}
                className="rounded-md bg-white/10 hover:bg-white/15 transition-colors px-3 py-1.5 text-sm text-slate-200"
              >
                ↻ Replay
              </button>
              <button
                onClick={() => handleDelete(recording.id)}
                className="rounded-md bg-rose-950 border border-rose-700 px-3 py-1.5 text-sm text-rose-300"
              >
                Delete this recording
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
