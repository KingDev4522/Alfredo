import { useEffect, useRef, useState } from "react";

export function PublishModal({ open, signLabel, count, onCancel, onConfirm, busy }) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);
  const canPublish = typed.trim().toUpperCase() === "PUBLISH";

  // Keep latest callbacks/flags in refs so the open-only effect below never
  // needs to re-run when the parent re-renders (RecordingTool re-renders on
  // every camera frame - re-running setTyped("") there is what wiped typing).
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;
  const stateRef = useRef({ busy, canPublish });
  stateRef.current = { busy, canPublish };

  useEffect(() => {
    if (!open) return undefined;
    setTyped("");
    // Focus once per open - NOT on every parent re-render. Re-scheduling
    // focus on each frame stole the caret and made typing impossible.
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    const handleKeyDown = (event) => {
      const { busy: isBusy, canPublish: ready } = stateRef.current;
      if (event.key === "Escape" && !isBusy) {
        event.stopPropagation();
        onCancelRef.current?.();
      } else if (event.key === "Enter" && ready && !isBusy) {
        event.preventDefault();
        event.stopPropagation();
        onConfirmRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4">
      <div
        className="cyber-panel grid w-full max-w-lg gap-5 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        aria-describedby="publish-dialog-description"
      >
        <div>
          <p className="cyber-page__eyebrow !mb-2">Admin write // Shared Main</p>
          <h2 id="publish-dialog-title" className="m-0 text-2xl font-semibold uppercase text-[#FFB000]">
            Publish to everyone?
          </h2>
        </div>
        <p id="publish-dialog-description" className="m-0 text-sm leading-relaxed text-[rgba(242,240,232,0.68)]">
          This publishes {count} recording(s) for “{signLabel}” to the shared Main database. Everyone
          will see them on their next template load. This writes to Supabase main_recordings. It is
          not a Git push.
        </p>
        <label className="cyber-login__label" htmlFor="publish-confirmation">
          Type PUBLISH to confirm
        </label>
        <input
          ref={inputRef}
          id="publish-confirmation"
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="PUBLISH"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          tabIndex={0}
          inputMode="text"
          enterKeyHint="done"
          onKeyDown={(event) => {
            // Handle keys locally (window listener won't see them once we stop
            // propagation) and keep global shortcuts from swallowing typing.
            if (event.key === "Enter" && canPublish && !busy) {
              event.preventDefault();
              onConfirm?.();
            } else if (event.key === "Escape" && !busy) {
              onCancel?.();
            }
            event.stopPropagation();
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="cyber-field font-mono uppercase"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="cyber-button">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canPublish || busy}
            className="cyber-button cyber-button--primary"
          >
            {busy ? "Publishing" : "Publish"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
