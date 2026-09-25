# Master Product Requirements Document — ISL Interpreter

| Field | Value |
|---|---|
| Product | ISL Interpreter |
| Document | Master PRD and release scope |
| Status | **Proposed — not approved for implementation or release** |
| Version | 1.0 |
| Baseline | Codebase and validation evidence as of 2026-09-25 |
| Product owner | Assign before approval |
| Engineering owner | Assign before approval |
| ISL domain owner | Assign before approval |
| Privacy/accessibility reviewers | Assign before approval |
| Target release | Public beta / 1.0 — naming and date require approval |

## 1. Product definition

ISL Interpreter is a privacy-conscious, browser-based communication aid that helps a person sign from a bounded vocabulary and receive a visible text interpretation with optional spoken output. The current implementation is a personalized nearest-template prototype: MediaPipe extracts hand landmarks, users record examples, and Dynamic Time Warping compares live motion with those examples.

The next product release should be defined as a **reliable, accessible, fixed-vocabulary interpretation aid**, not as a complete Indian Sign Language translator.

## 2. Problem statement

People who sign may need a quick way to communicate a word or short phrase to someone who does not sign. Existing general-purpose communication tools may not cover a locally recorded ISL vocabulary, may not keep landmark data in the browser, or may not provide a visible transcript alongside speech.

The current repository addresses the basic interaction concept, but it is not dependable enough for public use:

- A clean browser has no recognition library.
- The live segmentation path has no validated benchmark.
- Template storage and import can corrupt the recognition data set.
- Camera/model lifecycle and error recovery are unsafe.
- Custom labels, exports, and speech are not portable or semantically consistent.
- The product has no tests, CI, supported-device contract, deployment setup, or release privacy/accessibility evidence.
- Documentation and interface claims materially overstate current behavior.

## 3. Product vision

Enable a person to:

1. Understand the product's bounded scope and data behavior.
2. Explicitly enable the camera.
3. Use an approved starter vocabulary, import an approved versioned library, or create a personal vocabulary through guided recording.
4. See recognized words and uncertainty in text.
5. Speak, replay, edit, or clear the current phrase without losing it on failure.
6. Review and delete their locally stored landmark recordings.
7. Export and re-import a complete, validated, versioned data package when approved.

## 4. Goals

### G-01 — Trustworthy interpretation scope (P0)

The product must clearly state what it recognizes, how recognition works, and that results can be wrong or incomplete.

### G-02 — Valid recognition data (P0)

Every saved example must be unambiguously associated with its intended sign/label and satisfy approved structural, motion, hand-count, and quality rules.

### G-03 — Safe browser lifecycle (P0)

Camera and model resources must start only after user intent, stop deterministically, survive permission/model changes, and never remain active after leaving a flow.

### G-04 — Visible and recoverable communication (P0)

The current phrase must remain available as text. Speech is an optional output, not the sole record of a result.

### G-05 — User-controlled local data (P0)

Users must understand, export, and delete locally stored landmark recordings and custom vocabulary. First-party code must not upload camera frames or landmarks.

### G-06 — Accessible operation (P0)

Core workflows must be keyboard and screen-reader operable, meet the approved WCAG target, reflow at narrow widths, honor reduced motion, and never rely on color/animation alone.

### G-07 — Reproducible quality evidence (P0)

Recognition, segmentation, rejection, performance, storage, import/export, and browser compatibility claims must be linked to reproducible datasets, methods, build identifiers, and release thresholds.

### G-08 — Operable release (P1)

The product must build, lint, test, deploy, monitor through privacy-safe diagnostics, and roll back through documented gates.

## 5. Non-goals for the proposed release

- Complete or unrestricted ISL translation.
- Recognition of arbitrary signers, sign variants, facial expressions, body movement, or spatial reference outside the supplied landmark representation.
- Medical diagnosis, clinical documentation, emergency dispatch, or replacement for emergency services.
- Cloud accounts, cross-device sync, social sharing, or collaborative editing unless separately approved.
- A general natural-language grammar or conversational AI system.
- Native iOS/Android applications.
- Storing raw audio or video.
- Replacing a qualified human interpreter in high-stakes communication.
- Claiming emergency accuracy from the current 25-word vocabulary.

## 6. Actors and jobs to be done

| Actor | Job | Success outcome |
|---|---|---|
| ISL signer | Communicate a short known message | Understandable text is produced quickly and can be corrected/replayed |
| Communication partner | Receive the message | Visible and optional spoken output reflects the signer's accepted words with clear limitations |
| Vocabulary contributor | Teach the local system a sign | Valid examples are recorded, labeled, reviewed, and recoverable |
| Data reviewer | Repair a local recognition library | Bad examples can be found, understood, and deleted without deleting unrelated data |
| Evaluator/researcher | Assess quality fairly | Held-out, signer/condition/device-stratified evidence is reproducible |
| Accessibility user | Operate an equivalent workflow | Keyboard, assistive technology, zoom, contrast, and reduced-motion needs are supported |
| Privacy-conscious user | Know where data goes | Data inventory, external requests, retention, export, and deletion are clear |

## 7. Current product baseline

### 7.1 Implemented

- React/Vite single-page application with Home, Interpret, Record, and Delete routes.
- Webcam hand tracking for up to two hands through MediaPipe.
- 25-word built-in vocabulary and user-created custom words.
- Countdown-based skeleton recording and replay.
- IndexedDB recording persistence and localStorage custom-word metadata.
- Motion/pause segmentation and normalized hand-landmark sequences.
- Weighted DTW nearest-template recognition.
- Rule-based English expansion and browser speech synthesis.
- JSON import/export and recording deletion.
- Optional camera diagnostics and adaptive resolution in Camera Test.

### 7.2 Not production-ready

- No bundled/starter template library or self-contained setup path.
- No validated continuous-signing or held-out recognition gate.
- No first-party tests, CI, or reproducible evaluation command.
- P0 recording, import, identity, lifecycle, and error-handling defects.
- No approved supported browser/device matrix or deployment configuration.
- No approved accessibility, privacy, retention, security, or support contract.
- No monitoring, licensing/notices, model/dataset provenance, or project release metadata.

See `06-current-state-codebase-audit.md` for evidence.

## 8. Target product scope for public beta

### 8.1 In scope

#### A. First-use and consent

- Explain fixed-vocabulary/custom-calibration scope.
- Explain local landmark processing and external asset/speech behavior.
- Require an explicit camera activation action.
- Show secure-context, browser, camera, storage, model, and speech capability status.
- Provide direct setup choices when no usable templates exist.

#### B. Vocabulary and template management

- One authoritative vocabulary schema for built-in and custom signs.
- Collision-resistant custom identity and display label.
- Approved hand-count metadata and domain review.
- Guided capture with immutable sign association.
- Structural and quality validation before save.
- Skeleton replay using stored frame/timing information.
- Per-sign usable-template status and clear progress.

#### C. Live interpretation

- Timestamp-based, testable segmentation.
- Validated hand-count policy and unknown/ambiguous handling.
- Configurable/versioned recognizer policy with a safe default.
- Visible current transcript, accepted/ambiguous/not-recognized/interrupted state, and non-probabilistic score labeling.
- Manual Speak, Stop/Replay, Clear, and text edit/remove actions.
- Graceful Speech Synthesis unsupported/error behavior.

#### D. Local data management

- Versioned recording and vocabulary schemas.
- Deep import validation, size/frame limits, duplicate/provenance policy, and atomic import.
- Complete export containing custom labels and compatibility metadata.
- Per-item deletion, bulk deletion, clear-all, storage quota/corruption recovery, and clear deletion semantics.
- No unapproved first-party transmission of recordings, frames, landmarks, or labels.

#### E. Review and correction

- Search by label and recoverable internal ID.
- Metadata and quality warnings on each recording.
- One-active playback with pause/replay and timing fidelity.
- Confirmation/undo policy for destructive actions.
- Reload/rebuild recognizer only after storage operations complete successfully.

#### F. Quality, accessibility, and release

- Unit, property/fixture, integration, browser, accessibility, and performance tests.
- Reproducible pre-segmented and live end-to-end evaluations.
- Supported browser/device matrix.
- CI and release gates.
- Privacy/security review, deployment/SPA fallback, diagnostics, and rollback plan.
- Documentation synchronized with the approved product.

### 8.2 Conditional scope decisions

| Decision | Option A | Option B | Current recommendation |
|---|---|---|---|
| Clean-install recognition | Bundle an approved, licensed starter template dataset | Import an approved versioned library, or position first release as personal calibration only | Permit only an explicitly selected approved strategy; if no approved starter/import strategy is ready, launch calibration-first with clear limitations |
| Network model | Host model remotely | Bundle/cache model in the application | Bundle or provide an approved first-party asset strategy for reliable setup; do not imply offline unless verified |
| 3D visuals | Retain Spline as optional progressive enhancement | Remove/replace with lightweight first-party visual | Retain only with static fallback, performance budget, and no core dependency |
| Speech | Browser Speech Synthesis | Text-only / user-provided audio later | Keep optional browser speech with feature/error handling; do not depend on it |
| Sync | Local-only export/import | Add encrypted account/cloud sync | Defer cloud sync; it requires a separate privacy/security product |
| Data protection | Browser-managed local storage | Platform keystore/encryption abstraction | Retain local-only for beta; investigate encryption only if threat model justifies it |

### 8.3 Out of scope / deferred

- General ISL vocabulary expansion beyond an approved release set.
- Full-body, face, facial-expression, and spatial-relation recognition.
- Automatic emergency escalation.
- Third-party template marketplace.
- Model training on user recordings in the beta.
- Collaborative datasets without consent/provenance controls.
- Clinical or regulated-use claims.

## 9. Core user journeys

### J-01 — First-time activation and calibration

1. User reads scope, privacy, browser, and camera prerequisites.
2. User chooses an approved starter library, imports an approved versioned library, or begins guided personal calibration.
3. User explicitly enables the camera when live interpretation or calibration is required.
4. System establishes one healthy camera/model session.
5. User records, reviews, and saves valid examples for the first sign when calibration is selected.
6. System explains that interpretation readiness is sign-dependent and evidence-based, not a raw count alone.

**Primary success:** first valid recording is saved under the intended sign without camera leaks or misassociation.

### J-02 — Live interpretation and speech

1. User opens Interpret and activates the camera.
2. System verifies an approved usable template library.
3. User signs continuously.
4. System presents observing/capturing/classifying states and one segment outcome: accepted, ambiguous, not recognized, or interrupted. Library readiness (including no usable templates) is a separate setup state; “not recognized” includes an explicit reason such as below-threshold or unknown gesture.
5. Accepted words append to a visible transcript.
6. User speaks manually or via approved completion gesture/timer.
7. Text remains available; user can replay, edit, or clear.

**Primary success:** an accepted result is understandable and recoverable even when audio fails.

### J-03 — Review and delete one bad example

1. User searches a sign.
2. System displays relevant recordings with provenance and quality.
3. User previews one recording at a time.
4. User confirms or undoes deletion.
5. System rebuilds/refreshes templates only after the transaction completes.

**Primary success:** only the selected recording is removed and the recognizer state matches storage.

### J-04 — Export and re-import

1. User requests export and sees a data summary/warning.
2. Browser produces a versioned package containing recordings, labels, provenance, and compatibility metadata.
3. Import validates the whole package before commit.
4. User sees imported/skipped/rejected counts and reasons.
5. Invalid or duplicate policy outcomes are explicit and reversible according to the approved design.

**Primary success:** an approved fixture round-trips without data loss or label loss.

### J-05 — Recover from denial/failure

1. User receives a specific error and recovery action.
2. Retry reuses or replaces the session exactly once.
3. Current text/pending recording is preserved where safe.
4. User can continue without camera (for example, review/delete/export) or return to a healthy state.

**Primary success:** no false “ready” state, duplicate stream, or unrecoverable capture.

## 10. Product requirements

### P0 — Release-blocking

| ID | Requirement |
|---|---|
| PRD-P0-001 | The application shall describe itself as a bounded-vocabulary interpretation aid and disclose material limitations before camera activation. |
| PRD-P0-002 | Camera/model initialization shall require explicit user intent and shall have one shared, observable lifecycle across Interpret, Record, and diagnostics. |
| PRD-P0-003 | A recording shall save the immutable vocabulary identity, display label, expected hand count, and recorder/condition metadata snapshotted at Start; capture start time shall be bound when capture begins and capture end time shall be bound when capture finishes, then both shall remain frozen. |
| PRD-P0-004 | Recording and import shall enforce versioned structural, hand-count, landmark, sequence, quality, size, and vocabulary validation. |
| PRD-P0-005 | The visible transcript shall be authoritative and shall not be erased because speech is unsupported, queued, canceled, or fails. |
| PRD-P0-006 | Accepted, ambiguous, not-recognized, and interrupted segment outcomes shall be distinct. Library readiness/no-usable-templates is separate. Not-recognized results shall retain a reason such as below-threshold or unknown gesture; any displayed score shall not be described as a calibrated probability unless proven. |
| PRD-P0-007 | The first-party application shall not transmit camera frames, landmark recordings, custom labels, or recorder metadata. External resource requests and platform speech behavior shall be disclosed accurately. |
| PRD-P0-008 | Core workflows shall meet the approved accessibility target, including keyboard operation, labels, live status, reduced motion, reflow, contrast, focus, and non-canvas text equivalents. |
| PRD-P0-009 | Every release shall pass reproducible unit, integration, browser, storage, accessibility, security/dependency, and performance gates on the approved device/browser matrix. |
| PRD-P0-010 | Public accuracy, latency, offline, privacy, and readiness claims shall be traceable to a specific dataset, method, build, and approved threshold. |
| PRD-P0-011 | Users shall be able to export and import a complete versioned custom vocabulary and recording library without silent label loss or partial commit. |
| PRD-P0-012 | The system shall expose usable-template readiness and per-sign quality rather than treating raw recording count as proof of recognition readiness. |

### P1 — Required for a credible public beta

| ID | Requirement |
|---|---|
| PRD-P1-002 | Review shall show recorder, timestamp, condition, hand count, duration/frame count, quality state, and provenance where available. |
| PRD-P1-003 | The application shall provide actionable model, camera, storage, speech, import, quota, and unknown-error recovery. |
| PRD-P1-004 | The application shall provide 404/error handling, route titles/headings, focus management, and a responsive navigation model. |
| PRD-P1-006 | The product shall be deployable with HTTPS, direct-route fallback, correct WASM MIME behavior, and a documented root/subpath strategy. |
| PRD-P1-007 | The product shall reconcile README, page title, terminology, thresholds, timing, privacy wording, and visual documentation with the approved implementation. |
| PRD-P1-008 | Privacy-safe diagnostics and support procedures shall exist without recording raw gesture content by default. |
| PRD-P1-009 | The approved recognition policy shall use class-level aggregation, quality/outlier handling, and a class margin where needed so one poor template cannot solely determine accepted output. |
| PRD-P1-010 | Review shall support quality/provenance filters and prioritized identification of high-risk recordings beyond exact sign search. |
| PRD-P1-011 | Calibration UX shall recommend the next valid action and explain the evidence or blocker for each sign's readiness. |

### Retired master requirement IDs

| Retired ID | Superseded by | Reason |
|---|---|---|
| PRD-P1-001 | PRD-P0-011 | Complete portable import/export is a P0 data-integrity requirement, not a P1 enhancement. |
| PRD-P1-005 | PRD-P0-012 | Usable-template readiness and raw-count distinction are P0 release requirements. |

Retired IDs are retained for history and must not be reused.

### P2 — Candidate after beta

| ID | Candidate |
|---|---|
| PRD-P2-001 | User-facing per-sign recognizer settings with safe reset and explainable defaults. |
| PRD-P2-002 | Advanced prototype/outlier optimization beyond the required class-level quality/abstention policy. |
| PRD-P2-003 | Recognition search in a Worker if performance evidence selects it over an approved optimized main-thread design. |
| PRD-P2-004 | Optional persistent local history and copy/share controls beyond the current authoritative phrase workflow. |
| PRD-P2-005 | Approved signer/condition/device evaluation dashboard. |
| PRD-P2-006 | Optional encrypted sync after a separate threat model and consent design. |

## 11. Success measures

No production analytics are currently approved. Quality and usability must initially be measured through consented research sessions, local diagnostics, and release-test evidence. Remote telemetry requires a separate privacy decision.

### 11.1 Outcome measures

| ID | Measure | Definition | Target |
|---|---|---|---|
| OUT-01 | First-valid-capture completion | Eligible first-time users who save a valid example for their selected sign | `[PLACEHOLDER]` after usability baseline |
| OUT-02 | Successful short-message task | Participants who produce the intended visible phrase for an approved scripted scenario | `[PLACEHOLDER]` by vocabulary/scenario |
| OUT-03 | User comprehension | Participants who correctly state recognized words and known limitations | `[PLACEHOLDER]` |
| OUT-04 | Data trust | Participants who can identify, export, and delete their local recording data without assistance | `[PLACEHOLDER]` |
| OUT-05 | Accessibility completion | Core tasks completed using approved keyboard/screen-reader/zoom/reduced-motion configurations | 100% of supported critical test cases, no P0/P1 accessibility defect |
| OUT-06 | Release integrity | Saved examples with wrong sign identity or invalid schema | 0; hard release gate |
| OUT-07 | Resource safety | Sessions leaving an active camera/model after stop/navigation/unmount | 0 in automated lifecycle tests; hard release gate |

### 11.2 Quality measures

| ID | Measure | Target |
|---|---|---|
| QUAL-01 | Held-out continuous-sign top-1 accuracy | `[PLACEHOLDER: define class/sign/scenario and acceptable floor]` |
| QUAL-02 | Held-out accepted-result precision / false acceptance | `[PLACEHOLDER]` |
| QUAL-03 | Unknown-gesture rejection/coverage tradeoff | `[PLACEHOLDER]` |
| QUAL-04 | Signer/condition/device subgroup performance | `[PLACEHOLDER; no protected subgroup may be silently omitted]` |
| QUAL-05 | End-to-end recognized-word latency | `[PLACEHOLDER by device class and percentile]` |
| QUAL-06 | Recording validation false reject/false accept | `[PLACEHOLDER]` |
| QUAL-07 | Import/export round-trip fidelity | 100% for approved valid fixtures |
| QUAL-08 | Critical-browser workflow pass rate | 100% of P0 flows on approved browser/device matrix |

### 11.3 Guardrails

- No claim of “no incorrect guesses.”
- No medical/emergency reliance.
- No implicit upload of camera/landmark data.
- No accessibility target below the approved WCAG level.
- No release with unresolved P0 defects, migration/data-loss risk, known active camera leak, or unreproducible recognition claim.
- No production dataset without provenance, consent/license evidence, and domain review.

## 12. Dependencies

1. MediaPipe Hand Landmarker and compatible WASM runtime.
2. Approved sign vocabulary and domain review.
3. Approved and rights-cleared starter dataset, if bundled.
4. Browser/device camera, WASM/WebGL, storage, file, and speech capabilities.
5. Privacy/security and accessibility review.
6. CI infrastructure, deployment host, HTTPS, and direct-route fallback.
7. Representative signers, recording conditions, and test devices.
8. Legal/license/provenance review for dependencies, model, fonts, 3D scenes, and datasets.

## 13. Key risks and mitigations

| Risk | Impact | Primary mitigation |
|---|---|---|
| Incorrect or misleading interpretation | Communication failure, particularly for health/emergency words | Held-out live evaluation, abstention/margin policy, visible transcript, explicit limitations, no high-stakes reliance |
| Template contamination | Recognition degradation and hard-to-diagnose errors | Immutable identity, deep validation, replay, quality state, review/delete, complete exports |
| Segmentation merges/splits/truncates signs | Core live failures | Timestamped frame contract and dedicated continuous-sign benchmark |
| False confidence | Users over-trust wrong output | Stop calling the score probability; use class margin/robust prototypes and a clear not-recognized reason |
| Camera/model resource leak | Privacy and device impact | Unified session controller, cancellation, explicit disposal, lifecycle tests |
| Main-thread recognition stalls | Poor responsiveness and dropped frames | Benchmark, Worker/cancellation/prototype/cache design, adaptive processing in primary flows |
| Custom data loss/collision | Incorrect labels or deletion of wrong data | Namespaced stable IDs, vocabulary export, transactional migrations, conflict tests |
| Unsupported speech | Silent communication failure | Feature detection, error handling, persistent transcript, replay/manual alternatives |
| Remote assets/privacy wording mismatch | Trust and offline failures | Accurate disclosure, approved asset strategy, static fallbacks |
| Accessibility exclusion | Core users cannot complete tasks | Accessibility owner, semantic refactor, automated/manual testing, release gate |
| No reproducible dataset/evaluation | Misleading quality and regressions | Dataset manifest, held-out protocol, CI evaluation, artifact retention |
| Dependency/license/model provenance | Security or legal exposure | Lockfile review, updates, SBOM/notice process, asset/data manifests |

## 14. Release approach

### Phase 0 — Stabilize the evidence and architecture

- Freeze unsupported claims.
- Fix camera/model lifecycle, recording identity, import validation, custom identity, storage errors, and speech side effects.
- Exclude generated WASM from first-party lint.
- Upgrade or disposition the React Router advisory.
- Add schema/version foundations and test tooling.

### Phase 1 — Controlled alpha

- Personal calibration workflow with no public accuracy claim.
- Guided recording, strict validation, local review/delete, complete export/import.
- Supported desktop Chrome/Edge matrix and manual camera testing.
- Accessibility alpha and privacy review.

### Phase 2 — Recognition-quality candidate

- Reproducible continuous-sign dataset/evaluation.
- Approved segmentation, rejection, template-quality, and performance policies.
- Device/browser matrix and performance budgets.
- Decide whether an approved starter library is included.

### Phase 3 — Public beta candidate

- All P0/P1 requirements and release gates pass.
- Privacy notice, support process, known limitations, licenses/notices, deployment, monitoring, and rollback ready.
- Product claims match evidence.

## 15. Go/no-go criteria

A release is **no-go** if any of the following is true:

- A recording can be saved under the wrong sign.
- Invalid/imported landmarks can crash or poison the live recognizer.
- Camera/model resources can remain active after intended shutdown/navigation.
- Live/Record can report readiness while unable to process frames.
- Speech failure can erase the only visible phrase.
- Core flows are inaccessible or critical browser/device tests fail.
- Data export cannot round-trip approved custom vocabulary/recordings.
- Accuracy/latency/privacy claims lack reproducible evidence.
- A P0/P1 security, privacy, accessibility, or data-loss defect is open.
- Required dataset/model/dependency licenses or provenance are unresolved.

## 16. Open product decisions

The canonical decision register is `05-decisions-risks-and-assumptions.md`; IDs in that register are authoritative and must not be redefined here.

| Canonical ID | Decision summary | Owner | Needed by | Default if unresolved |
|---|---|---|---|---|
| DEC-001 | Public product name and “interpret” vs. “translate” terminology | Product + ISL domain | Before UX/content approval | ISL Interpreter; Interpret |
| DEC-002 | Bundle starter templates, import-only, or launch calibration-first | Product + domain + legal | Before alpha scope | Calibration-first; no turnkey claim |
| DEC-003 / DEC-004 | Approved fixed vocabulary/variants and ambiguous Good/Bad behavior | ISL domain | Before data import/release | Do not publish unsupported or ambiguous output |
| DEC-005 | Whether health/emergency words are included in public release | Product + domain + safety/privacy | Before vocabulary sign-off | Exclude high-stakes words until specifically approved |
| DEC-010 | Local retention/eviction, persistence, and individual-delete UX | Product + privacy + engineering | Before alpha | Retain until user deletes; explain browser eviction risk |
| DEC-015 | Supported desktop/mobile browsers and minimum hardware | Engineering + QA | Before device testing | Explicitly limit support; do not imply unvalidated browsers |
| DEC-016 | Production quality/latency thresholds | Product + domain + engineering | Before public beta | No public numeric claims |
| DEC-018 | Production telemetry and support-diagnostics policy | Privacy + product | Before any remote telemetry | No remote telemetry; local diagnostics only |
| DEC-019 | Project license, notices, model/dataset rights, and distribution model | Legal/product owner | Before public distribution | No public distribution |

Additional canonical decisions DEC-006 through DEC-009 and DEC-011 through DEC-020 are tracked in `05-decisions-risks-and-assumptions.md`.

## 17. Approval

This PRD becomes implementation-authoritative only after the assigned product, engineering, ISL domain, UX/accessibility, privacy/security, and quality owners approve:

- Scope and non-goals.
- Target release and device/browser matrix.
- Vocabulary/data rights and domain claims.
- Functional requirements and acceptance tests.
- Quality thresholds and evaluation protocol.
- Privacy/consent/retention/deletion behavior.
- Accessibility conformance target.
- Deployment/support/monitoring approach.
- Known limitations and claim language.
