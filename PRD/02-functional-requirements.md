# Functional Requirements — ISL Interpreter

| Field | Value |
|---|---|
| Document | Functional product requirements |
| Status | Proposed |
| Version | 1.0 |
| Baseline | 2026-09-25 codebase |
| Owner | Product + Engineering — assign before approval |
| Related documents | `01-master-product-requirements.md`, `03-ux-accessibility-requirements.md`, `04-technical-data-privacy-security.md`, `07-verification-release-roadmap.md` |

## 1. Conventions

### Priority

- **P0** — release-blocking: data integrity, privacy, safety, accessibility, or core-function failure.
- **P1** — required for the public beta unless explicitly deferred with approval.
- **P2** — valuable follow-up; not required for the first beta.

### Requirement state

- **Current** — implemented behavior, including known defects.
- **Target** — required behavior.
- **Placeholder** — a value, vocabulary item, policy, or threshold requiring an accountable decision.

Requirement IDs are stable and should not be reused after retirement.

## 2. Product entry, capability detection, and session lifecycle

### FR-BRW-001 — Explicit camera activation (P0)

**Current:** Interpret, Record, and Camera Test begin camera/model work on mount.

**Target:** The application shall not request camera permission or initialize the hand model until the user activates a camera-dependent flow.

**Acceptance criteria:**

- **AC-BRW-001-01:** Given a first-time visitor on `/interpret` or `/record`, when the page loads and the user has not activated the tool, then no `getUserMedia` or model creation occurs.
- **AC-BRW-001-02:** Given a valid activation control, when the user activates it, then the application explains the camera purpose and requests permission/initiates setup.
- **AC-BRW-001-03:** Given setup is active, when the user leaves the route or presses Stop, then camera and model resources are released according to the session contract.

### FR-BRW-002 — Secure-context and capability preflight (P0)

**Target:** Before permission, the application shall check and explain required capabilities: secure context, camera/mediaDevices, IndexedDB, WebAssembly/hand model, Canvas, and local file support. Speech and persistence support shall be checked separately before those features are used.

**Acceptance criteria:**

- **AC-BRW-002-01:** Given an insecure origin, when a camera flow is opened, then the application explains that camera access requires HTTPS or localhost and does not request permission.
- **AC-BRW-002-02:** Given IndexedDB is unavailable, when the user attempts to save, then no false success is shown and the user receives a storage recovery action.
- **AC-BRW-002-03:** Given Speech Synthesis is unavailable, when the user opens speech controls, then text remains usable and speech is identified as unsupported.

### FR-BRW-003 — Shared session state machine (P0)

**Target:** Interpret, Record, and diagnostics shall use one session controller with typed states and transitions for idle, requesting, loading, ready, active, interrupted, stopping, stopped, and failure states.

**Acceptance criteria:**

- **AC-BRW-003-01:** Given camera or model failure, when the session resolves, then the UI never reports a ready/watching state that cannot process frames.
- **AC-BRW-003-02:** Given Strict Mode/remount/retry in development, when effects are cleaned up, then no prior camera stream or model instance remains active.
- **AC-BRW-003-03:** Given a `getUserMedia` promise resolves after cancellation/unmount, then its tracks are stopped and not attached to a new view.
- **AC-BRW-003-04:** Given GPU creation times out, when CPU fallback starts, then any late GPU instance is disposed rather than leaked.
- **AC-BRW-003-05:** Given a camera track ends or permission is revoked, when the event occurs, then the application transitions to a recoverable stopped/error state.

### FR-BRW-004 — Camera constraints and mirroring (P1)

**Target:** Camera setup shall request explicit supported constraints, report negotiated settings, and apply one consistent mirrored crop to video and overlay.

**Acceptance criteria:**

- **AC-BRW-004-01:** Given a 4:3 camera stream, when displayed in the preview, then video and landmark overlay use the same crop and transform.
- **AC-BRW-004-02:** Given mirroring is enabled, when the user changes orientation/aspect ratio, then the hand remains aligned with the displayed preview.

### FR-BRW-005 — Background and visibility handling (P1)

**Target:** Tab visibility, background throttling, route transitions, and device sleep shall not corrupt active capture or silently produce invalid segments.

**Acceptance criteria:**

- **AC-BRW-005-01:** Given an active recording when the page becomes hidden, when capture cannot remain reliable, then recording is cancelled or finalized into an explicit recoverable state.
- **AC-BRW-005-02:** Given a live segment spans a long background interval, then it is invalidated/paused rather than classified using a sparse time series.
- **AC-BRW-005-03:** Given the page returns visible, then the user receives a resume/restart action and stale hands are not immediately interpreted.

## 3. Vocabulary and custom words

### FR-VOC-001 — Authoritative vocabulary (P0)

**Target:** Built-in and custom vocabulary shall be represented by one versioned schema with globally unique stable identity, display label, category/domain metadata, hand-count expectations, semantic/pronunciation metadata, and lifecycle status.

**Acceptance criteria:**

- **AC-VOC-001-01:** Given any sign selection, when displayed/persisted/exported, then one stable identity and its display label are used consistently.
- **AC-VOC-001-02:** Given a vocabulary schema migration, when the app starts, then data is migrated atomically or the user receives a recovery/blocked state.
- **AC-VOC-001-03:** Given built-in and custom entries, when combined, then identities are unique and selection/count/delete operations cannot target an unintended entry.

### FR-VOC-002 — Custom-word creation (P0)

**Target:** Custom-word creation shall validate, normalize, and show the proposed label/identity before saving.

**Acceptance criteria:**

- **AC-VOC-002-01:** Given a label that collides by normalized identity with a built-in or custom word, when the user submits it, then creation is blocked or handled by an explicit merge/rename decision.
- **AC-VOC-002-02:** Given a duplicate display label, when submitted, then the existing entry is selected or the user is offered an explicit distinct custom label.
- **AC-VOC-002-03:** Given a label unsupported by the current ID/display policy, when submitted, then the user can still receive a clear display label and a collision-resistant internal identity, or receive actionable guidance.
- **AC-VOC-002-04:** Given localStorage is corrupt or unavailable, when the vocabulary loads, then the app does not crash or silently discard data without a recovery message.

### FR-VOC-003 — Custom-word edit and deletion (P1)

**Target:** Custom labels and pronunciation metadata shall be editable without changing stable recording identity. Deletion shall distinguish label removal from recording deletion.

**Acceptance criteria:**

- **AC-VOC-003-01:** Given a custom label edit, when saved, then existing recordings remain attached to the same stable identity and display the new approved label.
- **AC-VOC-003-02:** Given “remove label only,” when confirmed, then recordings remain and are handled according to the approved orphan policy.
- **AC-VOC-003-03:** Given “remove label and recordings,” when confirmed, then the exact count is shown and deletion/storage completion is verified before success.

### FR-VOC-004 — Domain metadata approval (P0)

**Target:** Hand-count metadata, sign variants, pronunciation, and meaning shall be approved by the ISL domain owner. Conflicting comments/metadata shall not ship.

**Acceptance criteria:**

- **AC-VOC-004-01:** Given Help or any other sign, when expected hand count is displayed or used for validation, then it matches one approved source of truth.
- **AC-VOC-004-02:** Given a semantically ambiguous item such as Good / Bad, when it is output, then the behavior is explicitly approved and testable; otherwise it is excluded or split.
- **AC-VOC-004-03:** Given a health/emergency sign, when it is included, then its high-stakes limitations and release approval are recorded.

## 4. Recording and template creation

### FR-REC-001 — Recording state machine (P0)

**Target:** Recording shall implement explicit states: ready → countdown → capturing → processing → reviewing → saving → saved, plus cancelled, discarded, and failed paths.

**Acceptance criteria:**

- **AC-REC-001-01:** Given ready state, when Start is activated, then the immutable vocabulary identity/label, expected hand count, recorder and condition metadata are snapshotted on the pending recording; `captureStartedAt` shall be bound when capture begins.
- **AC-REC-001-02:** Given countdown or capture, when Cancel is activated, then timers/frame collection stop and the flow returns to a clean ready state.
- **AC-REC-001-03:** Given frame callbacks stop during capture, when the watchdog threshold expires, then capture finalizes/cancels into a recoverable state rather than remaining “Recording…” indefinitely.
- **AC-REC-001-04:** Given the model fails while camera is ready, when Start is available, then the invalid state is not possible.
- **AC-REC-001-05:** Given a pending recording, when the user changes the selected sign, recorder label, or condition label during countdown/capture/review, then the Start-time snapshot remains unchanged; expected hand count changes only through an approved vocabulary/version change. When capture finishes, `captureEndedAt` shall be bound and frozen before review, and edits apply only to the next recording.

### FR-REC-002 — Capture timing contract (P0)

**Target:** Every captured frame shall have an actual timestamp and the recording shall preserve timing sufficient for approved normalization, replay, and evaluation.

**Acceptance criteria:**

- **AC-REC-002-01:** Given frames arrive at different frame rates, when a recording is saved, then frame timestamps reflect elapsed time rather than an assumed constant FPS.
- **AC-REC-002-02:** Given replay, when timing is shown, then it uses stored timing and clearly labels any resampling.
- **AC-REC-002-03:** Given dropped/duplicate frames, when a recording is saved, then provenance/quality metadata records the issue.

### FR-REC-003 — Structural recording validation (P0)

**Target:** The application shall reject or quarantine recordings that do not satisfy the approved schema: supported hand count, valid number of hands per frame, 21 landmarks per hand, finite numeric coordinates, legal coordinate ranges/policy, minimum/maximum sequence length, and consistent required metadata.

**Acceptance criteria:**

- **AC-REC-003-01:** Given a zero-hand, empty, one-frame, malformed, or infinite-value capture, when review completes, then it cannot be saved as a usable template.
- **AC-REC-003-02:** Given transient empty frames, when quality validation runs, then the approved filtering/penalty policy is applied and the user sees a warning.
- **AC-REC-003-03:** Given a sign expects one/two hands, when observed hand count violates the approved ratio, then the user is warned and Save/Keep follows the approved blocking or override policy.

### FR-REC-004 — Quality validation and readiness (P0)

**Target:** Structural validity shall be combined with approved quality checks for hand presence, motion, landmark stability/outliers, duration, capture conditions, and signer/batch metadata.

**Acceptance criteria:**

- **AC-REC-004-01:** Given quality passes, when saved, then the recording receives a versioned quality state and score/flags that are explainable enough for review.
- **AC-REC-004-02:** Given quality is borderline/fails, when the user reviews it, then the app explains why and does not count it as an approved usable example by default.
- **AC-REC-004-03:** Given any sign, when progress is shown, then raw count and approved usable-template readiness are separate.
- **AC-REC-004-04:** Given the current target of 15 examples, when shown, then it is labeled a collection target rather than a guarantee of accuracy unless evaluation proves otherwise.

### FR-REC-005 — Immutable review association (P0)

**Target:** While a recording is pending, the vocabulary identity/display label, expected hand count from the Start-time vocabulary snapshot, and recorder/condition metadata shall be immutable. `captureStartedAt` is bound when capture begins and `captureEndedAt` when capture finishes; both are then frozen. Changes shall apply only to the next recording.

**Acceptance criteria:**

- **AC-REC-005-01:** Given a pending recording, when the user attempts to change its sign or metadata, then the pending review snapshot does not change; expected hand count is not edited independently of the snapshotted vocabulary.
- **AC-REC-005-02:** Given capture finishes and Keep is activated, when persistence completes, then the saved record contains the Start-time identity/metadata plus the actual capture start/end timestamps and the review displays those same values.
- **AC-REC-005-03:** Given rapid Keep activation, when save is pending, then one transaction/record is created only.

### FR-REC-006 — Replay and save (P0)

**Target:** Replay shall support valid/invalid states, Play/Pause/Replay, and metadata. Keep shall be idempotent and preserve pending data on failure.

**Acceptance criteria:**

- **AC-REC-006-01:** Given a valid recording, when replayed, then the sequence is displayed according to stored timing and a text alternative is available.
- **AC-REC-006-02:** Given a failed save, when the error is returned, then the pending recording remains available for retry/export/discard.
- **AC-REC-006-03:** Given successful save, when the transaction completes, then counts/template readiness update from committed data and one success message is announced.

## 5. Local storage, import, and export

### FR-DAT-001 — Versioned data model (P0)

**Target:** Recordings, vocabulary, exports, and persisted settings shall include explicit schema versions and provenance sufficient to validate, migrate, and diagnose them.

**Acceptance criteria:**

- **AC-DAT-001-01:** Given an old/unsupported schema, when opened, then the app follows an explicit migration/compatibility policy and never partially writes it.
- **AC-DAT-001-02:** Given a current schema, when persisted, then all required fields/types are present and extra fields do not break loading.

### FR-DAT-002 — Transaction completion (P0)

**Target:** Storage APIs shall resolve success only after the relevant IndexedDB transaction completes, and shall reject on request, transaction, quota, blocked, abort, or version-change errors.

**Acceptance criteria:**

- **AC-DAT-002-01:** Given a successful request followed by transaction abort, when completion occurs, then the UI reports failure.
- **AC-DAT-002-02:** Given quota exhaustion, when save/import occurs, then existing data remains valid and the user receives actionable recovery.
- **AC-DAT-002-03:** Given database upgrade is blocked, when it occurs, then the app reports a recoverable compatibility error.

### FR-DAT-003 — Deep import validation (P0)

**Target:** Import shall validate the entire package and every record before committing data, including package version, vocabulary metadata, stable IDs, labels, provenance, frame/timestamp shape, coordinate finiteness/ranges, hand counts, size/count limits, duplicates, and compatibility.

**Acceptance criteria:**

- **AC-DAT-003-01:** Given one invalid record in a package, when import is attempted, then the approved all-or-nothing/quarantine policy is applied and the user sees item-level reasons.
- **AC-DAT-003-02:** Given a package that could exhaust storage or freeze the UI, when limits are exceeded, then import is rejected or requires an explicit approved staged path.
- **AC-DAT-003-03:** Given an unknown vocabulary identity, when imported, then it is not silently recognized until label/status is explicitly resolved.
- **AC-DAT-003-04:** Given the same package/record is imported again, when duplicate policy runs, then skip/import-as-copy behavior is deterministic and reported.
- **AC-DAT-003-05:** Given import interruption, when the transaction is incomplete, then the store remains at the pre-import state or a recoverable staged state.

### FR-DAT-004 — Complete portable export (P0)

**Target:** Export shall include recordings, custom vocabulary, compatibility metadata, provenance, quality state, schema version, and a non-sensitive manifest/summary.

**Acceptance criteria:**

- **AC-DAT-004-01:** Given custom recordings, when exported, then their display labels and metadata travel with them.
- **AC-DAT-004-02:** Given an approved fixture, when exported and imported into a clean compatible store, then all valid records, identities, labels, timestamps, and quality/provenance fields round-trip.
- **AC-DAT-004-03:** Given export, when initiated, then the user sees the approximate record count/size and a warning that the file contains local interaction data.
- **AC-DAT-004-04:** Given export fails, when the error occurs, then no false success is shown and existing data is unchanged.

### FR-DAT-005 — Deletion semantics (P0)

**Target:** The product shall support delete one, delete sign, remove custom label, delete label plus recordings, and clear all, with explicit scope, confirmation/undo, transaction completion, and refreshed recognizer state.

**Acceptance criteria:**

- **AC-DAT-005-01:** Given delete one, when confirmed/undone according to policy, then only the selected record changes and success waits for commit.
- **AC-DAT-005-02:** Given bulk deletion, when confirmed, then the exact sign/count is named and other signs remain unchanged.
- **AC-DAT-005-03:** Given clear all, when confirmed, then the user is told custom labels/settings are not included unless they are also selected.
- **AC-DAT-005-04:** Given deletion failure, when returned, then the item remains visible and no stale template remains active.

### FR-DAT-006 — Persistence and eviction (P1)

**Target:** The product shall explain browser storage persistence/eviction risk and test quota/clear-site-data behavior. Optional persistence APIs shall be used only after informed user action and with fallback messaging.

**Acceptance criteria:**

- **AC-DAT-006-01:** Given browser storage is not persistent, when the user chooses to request persistence or backup, then the result and limitations are shown.
- **AC-DAT-006-02:** Given site data is cleared externally, when the app starts, then missing data is explained without claiming recovery.
- **AC-DAT-006-03:** Given multiple tabs mutate data, when counts/templates are refreshed, then stale or conflicting UI is detected through the approved synchronization policy.

## 6. Live segmentation and recognition

### FR-LIV-001 — Timestamped live frames (P0)

**Target:** Every live frame supplied to segmentation shall include a monotonic timestamp and stable frame identity/order. Segmentation shall not infer elapsed duration from an assumed FPS.

**Acceptance criteria:**

- **AC-LIV-001-01:** Given varying frame rates, when a pause/max-duration rule runs, then elapsed time uses actual timestamps.
- **AC-LIV-001-02:** Given background throttling/missing frames, when the sequence is too sparse, then it is marked interrupted/invalid rather than silently classified.

### FR-LIV-002 — Segment quality and interruption (P0)

**Target:** A segment shall be classified only when it satisfies approved hand presence, duration, motion, frame cadence, and interruption rules. Merged, split, or forced segments shall be represented in diagnostics.

**Acceptance criteria:**

- **AC-LIV-002-01:** Given adjacent signs without a detectable pause, when segmentation ends, then the segment is marked `merged-risk` or `interrupted` rather than treated as a verified sign.
- **AC-LIV-002-02:** Given a maximum-duration split, when a segment is forced, then it is marked potentially truncated.
- **AC-LIV-002-03:** Given a tracking dropout, when the sequence remains processable, then the dropout is represented in the frame contract and quality policy.

### FR-LIV-003 — Usable template library (P0)

**Target:** Live recognition shall use only approved, structurally valid, quality-eligible templates for the active vocabulary/version. The library shall report which signs are usable and why others are excluded.

**Acceptance criteria:**

- **AC-LIV-003-01:** Given zero usable templates, when Interpret opens, then a direct setup/import path appears and no false ready state is shown.
- **AC-LIV-003-02:** Given a sign has no usable templates, when classification runs, then it cannot be accepted.
- **AC-LIV-003-03:** Given storage changes, when reload/rebuild completes, then all indexes/counts/quality summaries reflect committed data only.

### FR-LIV-004 — Versioned recognition policy (P0)

**Target:** Segmentation, normalization, template weighting, DTW options, hand-count policy, acceptance/abstention, and duplicate policy shall be represented by a versioned configuration/policy identifier.

**Acceptance criteria:**

- **AC-LIV-004-01:** Given a policy change, when a result is produced, then its policy/version is available in local diagnostics.
- **AC-LIV-004-02:** Given a template was created under an incompatible policy/schema, then it is migrated or excluded with a reason.
- **AC-LIV-004-03:** Given an internal policy/configuration changes, when applied, then a safe approved default/reset path exists; user-facing per-sign settings are optional and are not implied by this requirement.

### FR-LIV-005 — Non-probabilistic uncertainty (P0)

**Target:** The system shall expose a separate library-readiness state, including no usable templates, and return one typed segment outcome: accepted, ambiguous, not recognized, or interrupted. A not-recognized outcome shall retain an approved reason such as below-threshold, unknown/out-of-distribution gesture, or policy-error; ambiguity is its own outcome. Any displayed score shall be labeled as a similarity/decision score unless calibration proves it is a probability.

**Acceptance criteria:**

- **AC-LIV-005-01:** Given one winning template and no approved margin/quality rule, when the policy accepts it, then the UI does not call the score “confidence probability.”
- **AC-LIV-005-02:** Given the top **classes** are too close under the approved policy, when classification completes, then the segment outcome is `ambiguous` and no word is appended.
- **AC-LIV-005-03:** Given an out-of-distribution/unknown gesture, when the approved policy detects or cannot accept it, then the segment outcome is `not-recognized` with reason `unknown` and the UI offers retry/clear feedback.

### FR-LIV-006 — Class-level aggregation and outlier handling (P1)

**Target:** The target policy should avoid allowing one poor nearest template to determine output. It shall use approved class-level aggregation, prototype selection, template quality weighting, or an evaluated alternative.

**Acceptance criteria:**

- **AC-LIV-006-01:** Given multiple templates for a sign, when one is removed/quarantined, then a later classification uses the updated approved library.
- **AC-LIV-006-02:** Given an individual template repeatedly causes confusion, when evidence identifies it, then review can flag it without deleting unrelated valid data.
- **AC-LIV-006-03:** Given an alternative classifier is proposed, when compared, then it must pass held-out live and performance gates before replacing the baseline.

### FR-LIV-007 — Hand-count policy (P0)

**Target:** One-hand/two-hand expectation shall be explicit in vocabulary metadata and the runtime fallback policy shall be evaluated rather than assumed neutral.

**Acceptance criteria:**

- **AC-LIV-007-01:** Given a hand-count mismatch, when a segment is captured, then the policy records the majority/observed counts and applies the approved primary/secondary search behavior.
- **AC-LIV-007-02:** Given cross-hand-count search is enabled, when evaluated, then performance and false-accept impact are included in release evidence.
- **AC-LIV-007-03:** Given a hand-count tie/malformed sequence, when classification runs, then the result is deterministically `interrupted` and the behavior is tested.

### FR-LIV-008 — Duplicate/repeat behavior (P1)

**Target:** Duplicate suppression shall distinguish segmenter re-emission from an intentional repeated sign using an approved timing/segment identity policy rather than adjacent sign ID alone.

**Acceptance criteria:**

- **AC-LIV-008-01:** Given the same sign appears in two accepted segments, when the second is within the re-emission window, then the system can suppress only the duplicate segment.
- **AC-LIV-008-02:** Given a user intentionally repeats a sign after a completed boundary, when accepted, then both words are retained.
- **AC-LIV-008-03:** Given suppression occurs, then the current status explains that a segment was suppressed rather than silently dropping evidence.

## 7. Transcript, grammar, and speech

### FR-TXT-001 — Authoritative visible transcript (P0)

**Target:** The current phrase shall be an ordered collection of accepted transcript entries. Recognized entries retain stable vocabulary identity, recognized label, editable display text, timestamp, and score; an explicitly manual entry may have no vocabulary/segment/score. The text transcript shall not depend on Speech Synthesis.

**Acceptance criteria:**

- **AC-TXT-001-01:** Given an accepted word, when appended, then the visual transcript updates with text and accessible status.
- **AC-TXT-001-02:** Given speech is unsupported/fails/cancels, when the event occurs, then the transcript remains.
- **AC-TXT-001-03:** Given a user removes/edits a word or adds an explicitly manual phrase entry, when confirmed, then the preview and spoken output use the same current display text.

### FR-TXT-002 — Rule-based language policy (P1)

**Target:** The grammar layer shall be explicitly labeled as deterministic phrase expansion, shall not invent a subject unless the rule is approved, and shall use display/spoken labels rather than reconstructing text from internal IDs.

**Acceptance criteria:**

- **AC-TXT-002-01:** Given a custom label, when previewed/spoken, then its approved display/pronunciation text is used.
- **AC-TXT-002-02:** Given a standalone ambiguous/state/need sign, when grammar output is generated, then the approved literal/assumption behavior and limitation are testable.
- **AC-TXT-002-03:** Given auto sentences are off, when a phrase is previewed, then only the approved literal transformation occurs and copy does not promise free-form composition.

### FR-TXT-003 — Speech capability and lifecycle (P0)

**Target:** Speech shall support unsupported, idle, queued, speaking, completed, canceled, and failed states, with language/voice policy and user Stop/Replay controls.

**Acceptance criteria:**

- **AC-TXT-003-01:** Given no `SpeechSynthesisUtterance`, when the flow loads, then speech controls are disabled/annotated and no runtime exception occurs.
- **AC-TXT-003-02:** Given an utterance error/cancel, when it occurs, then the text remains and a non-destructive message is available.
- **AC-TXT-003-03:** Given speech is requested, then synthesis is not initiated inside a React state updater or other side-effect path that may run more than once.
- **AC-TXT-003-04:** Given speech is unsupported or fails, then recording, visual interpretation, export, and deletion remain available.

### FR-TXT-004 — Completion trigger (P1)

**Target:** Hands-out auto-speak shall use a timestamped, user-configurable or approved completion policy. Manual Speak remains available as an equivalent trigger.

**Acceptance criteria:**

- **AC-TXT-004-01:** Given hands leave frame, when the approved absence duration is reached, then the sentence is spoken once for that absence interval.
- **AC-TXT-004-02:** Given a brief hand dropout shorter than the trigger, when hands return, then the sentence is not auto-cleared or spoken.
- **AC-TXT-004-03:** Given the page is backgrounded, when the absence timer is unreliable, then auto-speak does not fire from stale timing.

## 8. Review, playback, and data repair

### FR-REV-001 — Search and visibility (P0)

**Target:** Review shall search known display labels and support raw identity recovery for unknown/orphaned records. It shall display provenance and quality metadata.

**Acceptance criteria:**

- **AC-REV-001-01:** Given a label with multiple matches, when searched, then all matching identities and counts are explicit.
- **AC-REV-001-02:** Given an unknown imported identity, when recovery search is used, then its recordings are findable and not silently hidden.
- **AC-REV-001-03:** Given results are loading/empty/error, when state changes, then the user receives specific status.

### FR-REV-002 — Single-active playback (P1)

**Target:** Skeleton review shall use one active playback by default and provide Play, Pause, Replay, and timing/quality state.

**Acceptance criteria:**

- **AC-REV-002-01:** Given many results load, when the page becomes idle, then only one timer/animation is active.
- **AC-REV-002-02:** Given a new recording is selected, when playback starts, then any prior playback pauses/stops.
- **AC-REV-002-03:** Given an invalid/empty sequence, when rendered, then a text error/empty state is shown instead of a blank canvas.

### FR-REV-003 — Rebuild after mutation (P0)

**Target:** Save, import, delete, clear, migration, and custom-word changes shall invalidate/rebuild template indexes only after storage commit and report failures.

**Acceptance criteria:**

- **AC-REV-003-01:** Given a successful mutation, when the UI updates, then counts and recognition library match the committed store.
- **AC-REV-003-02:** Given a failed mutation, when the UI handles it, then prior recognizer state remains coherent and retry is safe.
- **AC-REV-003-03:** Given multiple tabs mutate data, when stale state is detected, then the app prompts/reloads according to the approved policy.

## 9. Diagnostics and local support

### FR-DIA-001 — Privacy-safe diagnostics (P1)

**Target:** The application shall expose local diagnostics for browser capabilities, negotiated camera settings, delegate, actual frame cadence, dropped/error counts, processing scale, template/quality counts, policy version, and latency samples without storing raw frames/landmarks by default.

**Acceptance criteria:**

- **AC-DIA-001-01:** Given Camera Test is opened, when a session is active, then FPS, delegate, settings, scale, and errors are understandable and timestamped.
- **AC-DIA-001-02:** Given diagnostics are exported for support, when the package is created, then it excludes recordings, labels, camera imagery, and other sensitive content unless the user explicitly includes approved data.
- **AC-DIA-001-003:** Given primary flows adapt quality, when scale changes, then the user is informed and the same diagnostics exist outside Camera Test.

## 10. Cross-functional state and error requirements

### FR-ERR-001 — Approved error catalog (P0)

**Target:** Product states shall include: unsupported browser/secure context, permission denied/revoked, no camera, camera busy/unavailable, track ended, model network load failure, WASM/WebGL failure, GPU/CPU failure, storage unavailable/corrupt/version blocked/quota, recording validation failure, frame interruption, import invalid/duplicate/version, export failure, speech unsupported/error, template rebuild failure, and unexpected error.

**Acceptance criteria:**

- **AC-ERR-001-01:** Given any catalog error, when shown, then it identifies impact, data preservation, and at least one next action.
- **AC-ERR-001-02:** Given an unexpected exception in the frame loop, when caught, then processing can recover or stop safely with a user-visible state.
- **AC-ERR-001-03:** Given an operation cannot proceed, when disabled controls are rendered, then their disabled reason is available to assistive technology or adjacent copy.

### FR-ERR-002 — Pending and retry policy (P0)

**Target:** Every asynchronous mutation shall be idempotent or protected against duplicate activation and shall define retry behavior.

**Acceptance criteria:**

- **AC-ERR-002-01:** Given a save/delete/import/clear is pending, when the user activates it again, then no duplicate or overlapping transaction occurs.
- **AC-ERR-002-02:** Given retry is safe, when activated, then it retries the same logical operation with the latest validated state.
- **AC-ERR-002-03:** Given retry is not safe, when the first attempt fails, then the user must resolve/import a new input rather than unknowingly duplicating data.

## 11. Minimum target data contracts

Detailed engineering design is in `04-technical-data-privacy-security.md`. Functionally, the following information must survive the approved lifecycle:

### 11.1 Vocabulary entry

- Stable globally unique ID.
- Schema/policy version.
- Display label.
- Domain/category and lifecycle status.
- Approved hand-count expectation.
- Approved spoken/pronunciation text where different.
- Source/ownership/approval metadata.

### 11.2 Recording

- Stable record ID and schema version.
- Vocabulary identity and immutable display-label snapshot.
- Capture-start timestamp, capture-end timestamp, and persistence timestamp (with their distinct meanings).
- Expected and observed hand-count summary.
- Frame timestamps and validated landmark sequence.
- Normalization/provenance/policy metadata.
- Structural and quality state.
- Import/export provenance and content hash where approved.

### 11.3 Recognition outcome

- Separate library-readiness state, including no usable templates.
- Segment outcome: accepted, ambiguous, not recognized, or interrupted.
- For not recognized, an approved reason: below-threshold, unknown/out-of-distribution, policy-error, or another versioned reason; ambiguous is its own outcome rather than a hidden reason.
- Candidate identity/label and clearly named score type when a candidate exists.
- Alternative/class margin when used.
- Segment quality and hand-count summary.
- Policy version and local diagnostic timestamp.

### 11.4 Export package

- Package/schema version and compatible app range.
- Vocabulary and recordings.
- Non-sensitive manifest/counts.
- Provenance/license metadata.
- Import compatibility/duplicate policy.

## 12. Traceability rule

Every P0/P1 requirement must have:

- At least one positive acceptance criterion.
- Applicable negative/boundary criterion.
- Applicable error/recovery criterion.
- Owner and test owner.
- A release gate in `07-verification-release-roadmap.md`.
- Implementation evidence before status can change to **Verified**.

Current first-party code does not provide this test evidence. No requirement in this document may be marked Verified solely because related UI text exists.
