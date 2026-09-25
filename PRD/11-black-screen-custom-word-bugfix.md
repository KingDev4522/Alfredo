# PRD 11 — Bug Fix: Black Screen When Adding a Custom Word

> Date: 2026-09-24
> Symptom (owner-reported): pressing "Add" in Record → Add a custom word blanks the
> entire page to black; only a browser reload recovers.
> Root cause: render-time `TypeError` with no error boundary.

## 1. Root cause (traced to exact lines)

`RecordingTool.jsx:handleAddCustomWord` did this in order:

1. `addCustomWord(label)` — writes to `localStorage` synchronously.
2. `refreshWords()` — **async**, would eventually `setAllWords(...)`, but not awaited.
3. `setSelectedSignId(created.id)` — **synchronous**, runs immediately.

React re-renders with `selectedSignId` = the brand-new id while `allWords` (React state) does
**not yet contain it**. Therefore:

```js
const selectedSign = allWords.find((w) => w.id === selectedSignId);  // → undefined
...
const expectedHands = selectedSign.twoHanded ? 2 : 1;                // → TypeError
```

A `TypeError` thrown **during render** unmounts the whole React tree. There was no error
boundary, so the page went permanently black — exactly the reported symptom. Reloading
rebuilt state from `localStorage`, where the word *had* been saved, so the word survived
and the page worked again.

## 2. Fixes applied (three layers, so this class of bug cannot recur silently)

| # | Fix | File |
|---|---|---|
| 1 | **Ordering fix** — `setAllWords(getAllWords())` now runs *before* `setSelectedSignId`, so the selected sign always exists in the list. `refreshWords()` still runs after for cloud sync. | `RecordingTool.jsx` |
| 2 | **Defensive fallback** — `const selectedSign = allWords.find(...) ?? VOCABULARY[0];` guarantees a non-null selection under any future list/selection mismatch (protects all 7 other `selectedSign.*` dereferences). | `RecordingTool.jsx` |
| 3 | **Error boundary** — new `ErrorBoundary` wraps the routed content in `App.jsx`. Any future render crash now shows "Something broke on this screen" + the error message + a Reload button, instead of a blank black page. | `src/components/ErrorBoundary.jsx`, `App.jsx` |

Also cleaned: removed an unused `let query` intermediate in `customWords.js` (awaited the
PostgREST builder directly).

## 3. Data safety

No data was lost. The custom word had already been written to `localStorage` before the crash,
and cloud mirroring in `addCustomWord` is fire-and-forget, so Supabase was unaffected either way.

## 4. Verification

`npm run build` → `✓ built in 1.17s` (SyntaxError-free JSX after the `App.jsx` re-indent).
Functional re-test needs a browser: Record → Add a custom word → the word should appear in the
picker, be auto-selected, and the page must stay visible.
