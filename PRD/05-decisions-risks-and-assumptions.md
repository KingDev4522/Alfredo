# Decisions, Risks, and Assumptions Register

| Field | Value |
|---|---|
| Product | ISL Interpreter |
| Document status | Proposed register |
| Version | 1.0 |
| Baseline | 2026-09-25 codebase and validation evidence |
| Owner | Product owner — assign |
| Review cadence | At every scope/policy/data-model milestone and before each release gate |
| Related documents | `01-master-product-requirements.md`, `04-technical-data-privacy-security.md`, `06-current-state-codebase-audit.md`, `07-verification-release-roadmap.md` |

## 1. Purpose

This register centralizes unresolved product decisions, assumptions, and material risks. It prevents unresolved targets from being silently converted into implementation requirements or public claims.

## 2. Status labels

- **Open** — no accountable decision exists.
- **Proposed** — a recommendation is documented but not approved.
- **Approved** — owner, date, evidence, and affected requirements are recorded.
- **Rejected** — option is explicitly not selected; affected documents are updated.
- **Superseded** — replaced by a later decision ID.

A decision is not approved merely because code currently behaves that way.

## 3. Decision register

### DEC-001 — Product name and primary verb

- **Status:** Open
- **Question:** Is the public name “ISL Interpreter,” and is the primary action “Interpret” or “Translate”?
- **Evidence:** UI/README inconsistently use ISL Interpreter, interpreter, interpret, and Start Translating; title says Phase 1.
- **Options:** (A) “ISL Interpreter / Interpret”; (B) “ISL Communicator / Interpret”; (C) retain “Translate.”
- **Proposed recommendation:** Use “ISL Interpreter” and “Interpret” unless the product owner/domain owner approve stronger positioning.
- **Owner:** Product + ISL domain
- **Needed by:** UX/content approval
- **Affected:** Home, navigation, titles, privacy/limitations, README.

### DEC-002 — Clean-install recognition strategy

- **Status:** Open
- **Question:** Does a public release include approved starter templates, launch as personal calibration only, or require an imported library?
- **Evidence:** Current repository contains no templates; interpreter tells users to record first.
- **Options:** (A) bundle rights-cleared starter library; (B) calibration-first; (C) import-only.
- **Proposed recommendation:** Permit calibration-first immediately; include starter templates only after rights, signer/domain, quality, consent, and size review.
- **Owner:** Product + ISL domain + legal/provenance
- **Needed by:** Alpha scope
- **Affected:** Product positioning, onboarding, data package, quality claims, release gate 002.

### DEC-003 — Fixed vocabulary and variants

- **Status:** Open
- **Question:** Which signs, regional/contextual variants, facial/body components, and expected hand counts are in scope?
- **Evidence:** 25 fixed words, all marked one-handed; stale comments say Help is two-handed; no body/face landmarks.
- **Options:** Approve a bounded list matching the representation; narrow/remove unsupported items; expand sensing model.
- **Proposed recommendation:** Approve only entries whose meaning and performance can be represented/evaluated by the current hand-landmark sensing; document unsupported variants.
- **Owner:** ISL domain
- **Needed by:** Before dataset/build and public vocabulary approval
- **Affected:** Vocabulary schema, recording validation, grammar, evaluation, high-stakes policy.

### DEC-004 — Ambiguous Good / Bad behavior

- **Status:** Open
- **Question:** Split into separate signs, choose one meaning, or display both with disambiguation?
- **Evidence:** One ID/label is “Good / Bad”; speech always says “good.”
- **Options:** Separate IDs/templates; rename to approved one; require explicit disambiguation/no speech.
- **Proposed recommendation:** Split or remove from beta until domain semantics and templates are approved; never silently choose “good.”
- **Owner:** ISL domain + product
- **Needed by:** Vocabulary sign-off
- **Affected:** Vocabulary, speech/grammar, data migration, tests.

### DEC-005 — Health/emergency vocabulary policy

- **Status:** Open
- **Question:** Should Pain, Help, Doctor, and Emergency be included in a public accessibility/communication beta?
- **Evidence:** Rules can assert “I am in pain” or “I need a doctor”; no emergency/medical safeguards exist.
- **Options:** Exclude; include with explicit non-clinical/non-emergency limitations; create separate high-stakes release.
- **Proposed recommendation:** Exclude high-stakes terms from the initial public beta unless domain/safety/privacy owners approve specific behavior and claims.
- **Owner:** Product + ISL domain + privacy/safety
- **Needed by:** Public vocabulary approval
- **Affected:** Grammar, consent/limitations, evaluation, UI copy, support.

### DEC-006 — Automatic grammar behavior

- **Status:** Open
- **Question:** Should standalone state/need words imply “I,” and should grammar inject subjects at all?
- **Evidence:** Current rules can invent a first-person subject.
- **Options:** Literal-only; conservative approved phrase rules; user-editable templates.
- **Proposed recommendation:** Default to literal visible text; add grammar as explicitly labeled, conservative, reversible enhancement with approved rules.
- **Owner:** Product + ISL domain + language/content
- **Needed by:** Functional/UX sign-off
- **Affected:** Grammar, transcript, speech, tests, copy.

### DEC-007 — Custom-word identity and label support

- **Status:** Open
- **Question:** What custom labels/scripts are supported, and how are stable IDs/pronunciation generated?
- **Evidence:** ASCII slug IDs can collide, reject non-Latin-only labels, and lose punctuation/case in speech.
- **Options:** ASCII policy with guidance; collision-resistant generated IDs plus full Unicode display labels; curated custom vocabulary only.
- **Proposed recommendation:** Use generated globally unique IDs independent of display text; support reviewed Unicode labels with pronunciation policy.
- **Owner:** Product + domain + engineering
- **Needed by:** Schema implementation
- **Affected:** Custom words, export/import, speech, review.

### DEC-008 — Speech behavior and platform disclosure

- **Status:** Open
- **Question:** Is browser Speech Synthesis an optional output, default output, or user-configured local/remote voice?
- **Evidence:** No feature detection/error, sentence clears on scheduling, platform voice may be remote.
- **Options:** Optional with persistent text; require explicit opt-in; local voice only where verifiable.
- **Proposed recommendation:** Optional, explicit, error-safe browser speech with persistent transcript and platform behavior disclosure.
- **Owner:** Product + privacy + accessibility
- **Needed by:** Alpha UX
- **Affected:** Transcript/speech requirements, privacy copy, browser matrix.

### DEC-009 — Model and visual asset hosting/offline mode

- **Status:** Open
- **Question:** Which assets are bundled, first-party hosted, remote, cached, or optional?
- **Evidence:** Model, fonts, and three Spline scenes are remote; WASM is local; no service worker.
- **Options:** Fully local static assets; approved CDN with disclosure; online-only with accurate copy.
- **Proposed recommendation:** Bundle or first-party host required core model/WASM; make 3D/fonts progressive enhancement with fallbacks; make no offline claim without verification.
- **Owner:** Engineering + privacy/security + product
- **Needed by:** Deployment architecture
- **Affected:** CSP, cache, privacy, performance, deployment.

### DEC-010 — Data retention, persistence, and deletion UX

- **Status:** Open
- **Question:** What retention, storage persistence, individual-delete confirmation/Undo, and recovery behavior is approved?
- **Evidence:** Browser-local data may be evicted; individual delete has no confirmation/Undo; clear does not remove labels.
- **Options:** Retain until delete; time-based; explicit backup-only; encrypt/recover.
- **Proposed recommendation:** Retain until explicit user deletion in beta, offer export/persistence request, and provide confirmation plus Undo for individual delete where feasible.
- **Owner:** Product + privacy + engineering
- **Needed by:** Data UX and privacy approval
- **Affected:** Storage requirements, privacy notice, release tests.

### DEC-011 — Import duplicate and compatibility policy

- **Status:** Open
- **Question:** Reject duplicates, skip, import copies, or merge by content hash/identity?
- **Evidence:** Current import always creates new records and can partially commit.
- **Options:** Strict all-or-nothing; staged with user choices; content-hash deduplication.
- **Proposed recommendation:** Validate first, show a preview, use content hashes to default-skip exact duplicates, and make invalid/partial outcomes explicit.
- **Owner:** Product + engineering
- **Needed by:** Schema/import implementation
- **Affected:** Data portability, migration, release tests.

### DEC-012 — Recording quality/readiness policy

- **Status:** Open
- **Question:** What makes a template approved, and when is a sign “ready”?
- **Evidence:** Current raw count target is 15; invalid recordings count; no quality state.
- **Options:** Manual approval only; automated thresholds; hybrid with evaluator feedback.
- **Proposed recommendation:** Hybrid automated structural/quality checks plus review, with readiness based on approved usable evidence—not count alone.
- **Owner:** Product + domain + engineering/QA
- **Needed by:** Recording quality implementation
- **Affected:** Capture, template library, progress, evaluation.

### DEC-013 — Recognition policy and abstention

- **Status:** Open
- **Question:** Retain nearest-template DTW, add class aggregation/margins/outlier handling, or adopt another evaluated model?
- **Evidence:** k=1 individual template can decide output; score is a distance transform; current threshold not live-validated.
- **Options:** Improve current engine; add class prototypes/margin; replace after baseline.
- **Proposed recommendation:** Preserve DTW as baseline, evaluate quality-weighted class aggregation and class margin/unknown policy first.
- **Owner:** Engineering + ISL domain/QA
- **Needed by:** Recognition-quality milestone
- **Affected:** Worker, result contract, metrics, UI confidence copy.

### DEC-014 — Segmentation interaction model

- **Status:** Open
- **Question:** Continue automatic pause segmentation, add explicit boundaries/calibration, or use another approach?
- **Evidence:** Current centroid/threshold logic is unvalidated and can merge/split/truncate.
- **Options:** Tune baseline; add advanced/user-calibrated settings; explicit Sign/Next fallback.
- **Proposed recommendation:** Validate timestamped baseline and provide an explicit boundary/retry alternative for users when segmentation is unreliable.
- **Owner:** Product + domain + engineering
- **Needed by:** Live-quality milestone
- **Affected:** Interpret UX, segment contract, evaluation.

### DEC-015 — Supported browser/device/OS matrix

- **Status:** Open
- **Question:** Which platforms are supported and at what minimum version/hardware?
- **Evidence:** README says Chrome/Edge and warns Safari; no tested matrix; current runtime Node requirement is also stale.
- **Options:** Desktop Chrome/Edge only; add Firefox; add mobile Safari/Android.
- **Proposed recommendation:** Start with explicitly versioned desktop Chrome/Edge; add platforms only after device/quality/accessibility evidence.
- **Owner:** Engineering + QA + product
- **Needed by:** Test environment design
- **Affected:** Compatibility, UX copy, CI, performance.

### DEC-016 — Quality and latency thresholds

- **Status:** Open
- **Question:** What metrics constitute a releasable interpreter for the approved vocabulary and users?
- **Evidence:** No approved continuous-sign metric; stored 97.535% artifact is not a live release benchmark.
- **Options:** Accuracy-only; balanced accuracy/coverage/latency; scenario-specific acceptance.
- **Proposed recommendation:** Approve class/coverage/error/latency thresholds and subgroup floors with a representative held-out dataset.
- **Owner:** Product + ISL domain + engineering/QA
- **Needed by:** Before public claims
- **Affected:** Evaluation, release gates, marketing/support.

### DEC-017 — Accessibility conformance target

- **Status:** Open
- **Question:** Confirm WCAG 2.2 AA and testing obligations/exceptions.
- **Evidence:** Significant form, heading, live-region, motion, contrast, reflow, and canvas barriers.
- **Options:** WCAG 2.2 AA; AA plus enhanced motion/cognitive requirements; platform-specific standard.
- **Proposed recommendation:** WCAG 2.2 AA with manual assistive-technology verification and no P0/P1 defects.
- **Owner:** Accessibility + product
- **Needed by:** UX approval
- **Affected:** UX PRD, release gate 010, support.

### DEC-018 — Production telemetry and support diagnostics

- **Status:** Open
- **Question:** Is production telemetry permitted, and what local/redacted diagnostics are required?
- **Evidence:** No monitoring; console errors only; gesture data is sensitive.
- **Options:** Local-only; opt-in analytics; first-party error reporting without content.
- **Proposed recommendation:** Local redacted diagnostics for beta; remote telemetry only after separate privacy approval.
- **Owner:** Product + privacy/security + support
- **Needed by:** Before monitoring implementation
- **Affected:** Observability, consent, support, privacy notice.

### DEC-019 — Project license, notices, and distribution

- **Status:** Open
- **Question:** What license/distribution model applies to code, model, fonts, scenes, and datasets?
- **Evidence:** No project LICENSE/NOTICE; generated WASM and remote assets have unclear local provenance; GSAP/Spline/MediaPipe terms require review.
- **Options:** Internal prototype only; permissive distribution; custom terms.
- **Proposed recommendation:** No public distribution until an owner completes dependency/model/dataset/asset license and notice review.
- **Owner:** Legal + product + engineering
- **Needed by:** Before public release
- **Affected:** Repository, deployment, templates, release gate 015.

### DEC-020 — Privacy copy and external-request disclosure

- **Status:** Open
- **Question:** What exact user-facing claim describes local processing, external assets, and speech?
- **Evidence:** “Nothing leaves your device” is broader than the actual network/platform behavior.
- **Options:** Narrow local-data claim; no speech; fully local assets.
- **Proposed recommendation:** Use the draft disclosure in `04-technical-data-privacy-security.md` as a starting point for privacy/legal approval.
- **Owner:** Privacy/legal + product
- **Needed by:** Before alpha testing
- **Affected:** Home/Interpret/README/consent/support.

## 4. Assumptions register

| ID | Assumption | Why needed | If false | Validation/owner | Status |
|---|---|---|---|---|---|
| ASM-001 | The initial release is a communication aid, not a regulated medical/emergency system | Shapes safety and claims | Scope/architecture changes materially | Product/domain/privacy | Open |
| ASM-002 | A static client-side architecture remains acceptable | Avoids premature backend complexity | Accounts/sync/central templates may be required | Product/engineering | Open |
| ASM-003 | Users are willing and permitted to record named signer/condition metadata | Current fields exist | Make metadata optional/remove and update copy | Product/privacy | Open |
| ASM-004 | The approved vocabulary can be represented sufficiently by hand landmarks | Core technical feasibility | Add pose/face/body sensing or narrow vocabulary | ISL domain/engineering | Open |
| ASM-005 | A target of roughly 25 built-ins remains useful | Scope/evaluation design | Vocabulary and data/performance targets change | Product/domain | Open |
| ASM-006 | Personal calibration templates can be legally/ethically collected and exported | Clean-install/import strategy | Remove import/custom dataset features or add controls | Legal/domain/privacy | Open |
| ASM-007 | Browser Speech Synthesis can be optional | Current output path | Text-only beta or alternate service after review | Product/privacy | Open |
| ASM-008 | Desktop Chrome/Edge is an acceptable initial target | Test/performance scope | Expand matrix and release work | Product/QA | Open |
| ASM-009 | No production telemetry is required for beta | Privacy-safe measurement | Add telemetry consent/governance work | Product/privacy | Open |
| ASM-010 | Legacy recordings can be migrated or clearly marked for re-recording | Data continuity | Force clean reset with explicit warning | Engineering/product | Open |
| ASM-011 | Representative signers/conditions/devices can be recruited under consent | Quality evidence | Public accuracy claims cannot be made | Product/domain/QA | Open |
| ASM-012 | Remote 3D scenes are nonessential | Core fallback/performance | Replace/remove or fully support first-party rendering | Product/engineering | Open |
| ASM-013 | Users can understand a bounded-vocabulary limitation with plain-language copy | Trust/onboarding | Product may not be appropriate for intended audience | User research/accessibility | Open |
| ASM-004A | The current normalized hand representation captures enough motion for approved signs | Engine quality | Redefine normalization/sensing/quality scope | Domain/engineering | Open |
| ASM-014 | The same browser profile is an acceptable local data security boundary | No account/encryption | Add stronger at-rest protection or clear threat | Privacy/security | Open |
| ASM-015 | Export files can be stored/backed up securely by users | Recovery strategy | Add persistence/recovery guidance or service | Product/privacy/support | Open |

## 5. Risk register

Likelihood and impact are initial qualitative assessments, not calculated scores.

| ID | Risk | Likelihood | Impact | Current controls | Required treatment | Owner | Residual status |
|---|---|---|---|---|---|---|---|
| RSK-001 | Wrong sign/message misleads communication partner | High | High | Visible text; fixed vocabulary | Held-out live evaluation, abstention/margin, limitations, no high-stakes reliance | Domain/product | Open |
| RSK-002 | Pseudo-confidence overstates certainty | High | High | Threshold exists | Rename score, class margin, calibration evidence, clear unknown | Engineering/domain | Open |
| RSK-003 | Recording saved under wrong sign | High | High | Review replay | Immutable pending identity and transaction tests | Engineering | Open |
| RSK-004 | Invalid/dropout template poisons library | High | High | Sequence normalization | Structural/quality validation, class aggregation, review/delete | Engineering/domain | Open |
| RSK-005 | Import corrupts/DoSes data | High | High | Basic JSON/shape check | Full prevalidation, limits, atomic/staged import, fuzz tests | Engineering/security | Open |
| RSK-006 | Live segmentation merges/splits/truncates | High | High | Pause heuristic | Timestamp/quality contract, continuous evaluation, correction | Domain/engineering | Open |
| RSK-007 | Camera/model resource/privacy leak | High | High | Cleanup on some paths | Unified controller, late-resolution disposal, explicit close, lifecycle tests | Engineering | Open |
| RSK-008 | Main-thread DTW stalls camera loop | High | Medium/High | 18-frame downsample | Worker/cancellation/bounded queue, class optimization, benchmarks | Engineering | Open |
| RSK-009 | Custom ID collision/orphan label causes wrong deletion/output | High | High | Slug check within custom list only | Global stable IDs, complete export, migration/conflict tests | Engineering/product | Open |
| RSK-010 | Browser eviction/site clearing loses recordings | Medium | High | IndexedDB persistence | Plain-language warning, export, optional persistence request, recovery UX | Product/privacy | Open |
| RSK-011 | Speech fails/cancels and phrase appears lost | High | High | Visible sentence exists | Move side effects out of state updater, errors, persistent transcript/replay | Engineering/UX | Open |
| RSK-012 | Accessibility barriers exclude users | High | High | Some native controls/semantics | WCAG 2.2 AA program, semantic/focus/live/motion/reflow fixes | Accessibility/product | Open |
| RSK-013 | Remote assets fail, disclose network metadata, or dominate performance | High | Medium/High | Lazy Spline component | Asset strategy, CSP/allowlist, fallbacks, budget, offscreen stop | Engineering/privacy | Open |
| RSK-014 | Dependency/model/asset vulnerability or license issue | Medium | High | Lockfile; npm audit available | Upgrade/disposition, SBOM/notices/provenance, controlled updates | Security/legal/engineering | Open |
| RSK-015 | Browser/device incompatibility | Medium/High | High | Modern-browser assumptions | Approved matrix, capability checks, device lab, fallback | Engineering/QA | Open |
| RSK-016 | No clean-install templates makes product unusable | High | High | “Record first” message | Starter dataset or calibration-first positioning/onboarding | Product/domain | Open |
| RSK-017 | Historical metrics are presented as production proof | High | High | Checked-in JSON | Claim governance, manifest, held-out CI, approval | Product/QA | Open |
| RSK-018 | Dataset bias/overfit hides signer/condition/device failures | High | High | None | Signer/condition/device splits, subgroup floors, collection protocol | Domain/QA | Open |
| RSK-019 | Health/emergency grammar invents high-stakes meaning | High | High | Small rule set | Exclude/approve explicitly, visible literal default, no reliance | Product/domain/privacy | Open |
| RSK-020 | Storage/UI stale across tabs | Medium | Medium/High | Manual reload in Interpret | Versioned cross-tab update/invalidation policy | Engineering | Open |
| RSK-021 | Public distribution without rights/provenance | Medium | High | None complete | Legal/license/provenance gate | Legal/product | Open |
| RSK-022 | Support cannot diagnose camera/model/device issues | High | Medium | Camera Test | Redacted local diagnostics, matrix, runbook, owner | Support/engineering | Open |

## 6. Claim control

### Claims currently supportable with qualification

- “The prototype is configured to detect up to two hands; cross-browser/device runtime support remains unvalidated.”
- “Camera frames and normalized landmarks are not intentionally uploaded by first-party code.”
- “Recordings are stored in the current browser and can be exported as JSON.”
- “Recognition uses user-recorded templates and Dynamic Time Warping.”
- “The checked-in pairwise pre-segmented artifact reports 97.535%; the source dataset is not included.”

### Claims not currently supportable

- “Works offline” or “no internet dependency after first load.”
- “Nothing leaves your device” without qualification.
- “No wrong guesses get through.”
- “97.5% live/sign-language accuracy.”
- “Recognizes ISL” without stating the fixed vocabulary and representation limits.
- “WCAG compliant.”
- “Production-ready,” “secure,” or “private” without approved review/evidence.
- “Exact motion replay” when timing/depth/context are not stored.
- “Speech is instant” or a fixed speech delay that does not match code.
- README Phase/default-route/threshold/visual claims that contradict source.

## 7. Decision procedure

1. State the decision ID, owner, deadline/milestone, and affected requirements.
2. Gather code evidence, user/domain evidence, privacy/security impact, and alternatives.
3. Record options and consequences; do not hide rejected options.
4. Obtain required domain/product/engineering/legal/privacy approvals.
5. Update all affected PRD sections, tests, migration plans, and user copy.
6. Add or update release-gate evidence.
7. Mark prior status **Superseded**; never silently rewrite history.

## 8. Review checklist

A decision is ready to close when:

- The question is explicit and bounded.
- Evidence is reproducible and current.
- Domain, user, privacy/security, accessibility, and operational impacts are considered as applicable.
- Numeric targets include method/environment/dataset.
- Data/schema/migration implications are identified.
- A rollback/revisit trigger is documented.
- Named owners approve or reject it.
- Public claims and tests are updated.
