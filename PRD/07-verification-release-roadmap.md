# Verification, Release Gates, and Roadmap

| Field | Value |
|---|---|
| Document | Quality strategy and release plan |
| Status | Proposed |
| Version | 1.0 |
| Baseline date | 2026-09-25 |
| QA owner | Assign before approval |
| Release owner | Assign before approval |
| Product/domain/privacy/accessibility approvers | Assign before approval |
| Related documents | All other documents in `PRD/` |

## 1. Release quality policy

A feature is releasable only when:

1. Its current and target behavior are clearly distinguished.
2. Requirements have stable IDs and acceptance criteria.
3. Positive, negative, boundary, error, privacy, and accessibility cases are covered as applicable.
4. Evidence identifies source revision/build, dataset, environment, device/browser, date, owner, and result.
5. P0/P1 defects are resolved or explicitly rejected from scope by accountable owners.
6. Product claims match the measured evidence.
7. Data migration, export, deletion, and rollback are safe.
8. Required privacy, security, accessibility, ISL-domain, and legal/provenance reviews are complete.

No marketing statement, code comment, or checked-in JSON artifact is sufficient release evidence by itself.

## 2. Current verification baseline

| Area | Current evidence | Status |
|---|---|---|
| Production build | `npm run build` succeeded; 64 modules; 16.93 s on validation machine | **Pass**, not a performance benchmark |
| First-party lint | `npx oxlint src scripts`: 5 warnings, 0 errors | **Partial pass**; warnings unresolved |
| Full lint | `npm run lint`: 536 warnings, 3 generated-WASM false-positive errors | **Fail**; configuration not production-ready |
| Unit tests | None | **Blocked** |
| Integration tests | None | **Blocked** |
| Browser/E2E tests | None | **Blocked** |
| Accessibility audit | Static source review only | **Blocked for release** |
| Camera/device test | No controlled browser/device run | **Blocked** |
| Stored evaluation | 97.535% (277/284) pre-segmented leave-one-out artifact | **Historical artifact only** |
| Reproducible evaluation | Source dataset absent; default path invalid; output path hard-coded | **Fail** |
| Dependency audit | Two high-severity React Router records | **Fail pending upgrade/disposition** |
| Direct-route smoke | Vite returned 200 for `/`, `/record`, `/interpret`, `/delete` | **HTTP-level pass only** |
| Production deployment | No host/deployment config | **Blocked** |
| CI | None | **Blocked** |
| Privacy/security/accessibility approval | None | **Blocked** |
| Rollback/support/monitoring | None | **Blocked** |

## 3. Test environment matrix

### 3.1 Required environment definition

Every release candidate records:

- Git/source revision or source archive hash.
- `package-lock.json` hash.
- Application version/build ID.
- Model/WASM/scene/font/dataset versions.
- Recognition and segmentation policy version.
- Browser, OS, hardware, camera, and viewport.
- Network mode (online/offline, throttled).
- Storage state and fixture dataset.
- Test account/profile state (current app has no account).
- Test date and operator.

Because the current directory is not a git repository, a release must introduce source provenance (recommended: initialize/use version control and tag release commits).

### 3.2 Browser/device coverage

The exact matrix is an open decision, but minimum categories are:

| Category | Required coverage |
|---|---|
| Primary desktop | Approved Chrome and Edge versions on Windows, with at least one macOS/Linux validation if claimed |
| Secondary desktop | One additional browser only if claimed/supported |
| Mobile | Only if mobile is claimed; include background/resume, permission, WebGL/WASM, and viewport behavior |
| High performance | Integrated/discrete GPU device |
| Low performance | CPU-only or representative constrained device |
| Camera | Built-in and one external/alternate camera if supported |
| Network | Normal, slow, offline, failed model/scene/font requests |
| Permissions | Grant, deny, dismiss, revoke, device busy, no camera |
| Storage | Normal, quota pressure, corrupt/legacy data, blocked version upgrade, site-data cleared |
| Accessibility | 200% zoom, 320 CSS px reflow, reduced motion, high contrast where supported, keyboard, approved screen reader |

**Rule:** A platform not in the approved matrix is unsupported and must fail or degrade according to documented behavior; it cannot be implicitly “best effort.”

## 4. Test levels

### 4.1 Static quality

- First-party lint with generated/vendor files excluded.
- Type checking if TypeScript is adopted; otherwise JSDoc/schema checks where valuable.
- Formatting check.
- Dependency/license/advisory review.
- Secret scanning.
- Generated asset/model/dataset provenance and integrity checks.
- Documentation/link/config consistency.

### 4.2 Unit tests

Required pure modules/functions:

- Camera constraint and settings mapping adapters.
- Session state transitions and cancellation.
- Countdown/capture/cancel/watchdog logic.
- Recording structural and quality validators.
- Normalization and safe-scale behavior.
- Segmenter with deterministic clocks/frames.
- DTW boundaries, empty/malformed frames, one/two hands, maxFrames, band, weighting.
- Class aggregation/margin/abstention policy.
- Grammar/spoken-label rules.
- Schema validation and migrations.
- Import duplicate/limit/atomicity policy.
- Export manifest/content generation.
- Transcript reducer and speech state transitions.
- Playback timing.

### 4.3 Property and fuzz tests

At minimum:

- Random malformed landmark arrays never throw uncaught errors outside typed results.
- Non-finite/extreme values are rejected or safely handled.
- Arbitrary timestamp order/gaps produce invalid/interrupted outcomes, not false segments.
- Empty recordings never enter the template library.
- One/two-hand comparisons are symmetric/order-invariant as required and never give empty frames a free match.
- Schema validators accept only allowlisted fields and reject prototype/special keys.
- Import package limits bound work for adversarial sizes/counts.
- Grammar never loses transcript entries for supported IDs.

### 4.4 Integration tests

Use real/fake browser boundaries as appropriate:

- IndexedDB request success followed by transaction abort.
- Quota, blocked upgrade, version change, database close.
- Migration from every supported export/database version.
- Atomic import or approved staged import.
- Custom vocabulary + recording export/import round trip.
- Template library rebuild after save/delete/clear/migration.
- Recognition-engine classification result applied only to the matching session/generation; if a Worker is selected, its cancellation/stale-result contract is tested.
- Speech feature detection, error, cancel, and queue behavior.
- Cross-tab update/reload behavior.

### 4.5 Component tests

- Every page heading/title/landmark and 404 route.
- Form labels/errors and keyboard operation.
- Status/live-region behavior.
- Recording states and immutable pending identity.
- Review search/metadata/one-active playback.
- Destructive confirmation/undo and pending states.
- Reduced-motion and 3D/static fallbacks.
- 320-width wrapping and no horizontal overflow.

### 4.6 Browser end-to-end tests

Use browser automation plus controlled camera fixtures/mocks where possible:

1. First visit does not request camera.
2. Explicit activation, grant, model ready, Stop, route change, no active tracks.
3. Permission denied/revoked/device busy/no camera and recovery.
4. Record valid sample, review, save, count/readiness update.
5. Attempt sign change during pending review; original identity remains.
6. Invalid/interrupted capture cannot save.
7. Import valid/invalid/duplicate/oversized packages atomically.
8. Export, clean-profile import, labels and data round-trip.
9. Search/delete one; unrelated recording remains.
10. Inject deterministic live segments; verify accepted, ambiguous, not-recognized, and interrupted transcript behavior.
11. Speech unsupported/error preserves transcript.
12. Remount/Strict Mode/background/resume creates no duplicate resources.
13. Unknown route/direct refresh/error boundary.
14. Keyboard-only and accessibility smoke paths.

### 4.7 Manual device/live-signing tests

- Representative ISL signers/domain reviewers.
- Approved vocabulary signs and explicitly out-of-vocabulary gestures.
- Lighting, distance, angle, background, hand size, occlusion, motion speed, and pause variation.
- Left/right hand, hand-order changes, one/two hand, and tracker dropouts.
- Browser/device matrix.
- Human review of visible transcript, speech, and high-stakes limitations.

## 5. Recognition and segmentation evaluation protocol

### 5.1 Dataset manifest

A release evaluation dataset shall have a checked manifest containing:

- Dataset ID/version/content hash.
- Schema/policy/model versions.
- Sign/vocabulary version.
- Signer IDs in privacy-preserving form and split assignment.
- Recording/condition/device metadata.
- Capture protocol and inclusion/exclusion rules.
- Consent/license/ownership approval.
- Known limitations and prohibited uses.
- Pre-segmented versus continuous/live labels.
- Quality/outcome annotations and adjudication method.

No real names or unnecessary personal data are required in the repository.

### 5.2 Required evaluations

#### EV-01 — Pre-segmented template classification

Purpose: isolate normalization/DTW/class decision from segmentation.

Requirements:

- Strict held-out split by signer and, where possible, condition/device.
- No template and query from the same signer in their respective partitions unless a specifically approved personalization scenario.
- Report top-1 accuracy, macro/per-class results, confusion, coverage, accepted precision/recall, rejection, and class margins.
- Report hand-count policy, unknown gestures, and quality-excluded templates.
- Runtime and dataset size included.

#### EV-02 — Continuous-sign end-to-end

Purpose: measure the actual product path.

Requirements:

- Use timestamped live/continuous sequences.
- Include natural pauses, adjacent signs, repeated signs, static holds, and no-hand transitions.
- Report boundary detection, merged/split/truncated segments, accepted word accuracy, coverage, false acceptance, and end-to-end latency.
- Break down by signer, condition, device, and sign.

#### EV-03 — Segmentation-only

Purpose: isolate boundary quality from classification.

Metrics proposed for approval:

- Boundary tolerance in milliseconds/frames.
- False split/merge rates.
- Valid-segment rate.
- Empty/short/dropout segment rate.
- Forced maximum-duration truncation rate.

#### EV-04 — Unknown/out-of-distribution

Include:

- Out-of-vocabulary gestures.
- Non-sign hand movements.
- Partial hands/occlusion/dropout.
- Random/mirrored/time-reversed sequences where scientifically appropriate.

Report accepted false-positive rate and coverage tradeoffs. Do not tune and report on the same examples.

#### EV-05 — Personal calibration scenario

If the product launches calibration-first:

- Measure time and errors to create a usable personal library.
- Measure same-signer personalization versus cross-signer data.
- State clearly that this is not general-signer accuracy.

### 5.3 Thresholds

All public thresholds are placeholders until approved:

| Metric ID | Proposed threshold |
|---|---|
| QUAL-01 continuous held-out top-1 | `[PLACEHOLDER]` |
| QUAL-02 accepted-result precision | `[PLACEHOLDER]` |
| QUAL-03 unknown false acceptance | `[PLACEHOLDER]` |
| QUAL-04 subgroup floors | `[PLACEHOLDER; every approved subgroup reported]` |
| QUAL-05 recognition latency | `[PLACEHOLDER p50/p95 by device]` |
| QUAL-06 recording false accept/reject | `[PLACEHOLDER]` |
| Data integrity wrong-sign saves | 0 |
| Export/import approved fixture fidelity | 100% |
| Active resource leaks in lifecycle suite | 0 |

Thresholds shall include a rationale, dataset, method, and regression tolerance. A single global accuracy number is not sufficient.

### 5.4 Reproducibility

- `npm run evaluate` or an equivalent documented command uses configurable repository-relative paths.
- Output path is configurable and defaults beside a checked output/artifact directory.
- Runner writes machine-readable results and a run manifest.
- CI compares against an approved baseline and fails on threshold/regression failure.
- Historical results are retained by dataset/policy/build hash; results with no matching manifest are labeled non-release evidence.

## 6. Performance benchmark plan

### 6.1 Scenarios

| Benchmark | Measure |
|---|---|
| Cold route load | JS/CSS/3D/model requests, bytes, cache state, time to usable core UI |
| Warm route load | Same metrics with approved cache |
| Hand tracking | Detection FPS, dropped/late frames, CPU/GPU/memory, adaptive scale |
| Segmenter | Time per frame, segment-finalization latency |
| Classifier | Per-template and total class-search latency by template count/device |
| Worker queue | Queue age, dropped stale segments, main-thread long tasks |
| Recording | CPU/memory, save transaction time, replay smoothness |
| Review | Load/search/delete latency with 10/100/500-result fixtures |
| Import | Parse/validate/commit time by package size/validity |
| Route + 3D + camera | GPU/memory/frame rate with scene active/inactive/offscreen |

### 6.2 Budget process

- Set budgets only after baseline measurement on approved device classes.
- Include raw, compressed, and cache-transfer budgets.
- Record exemptions with owner/expiry.
- Fail CI on material regression and bundle-budget violations.
- Production Spline/WebGL must not remain active during camera recognition if it breaches the approved budget.

## 7. Accessibility verification

Target: WCAG 2.2 AA, pending accessibility-owner approval.

### Automated checks

- ESLint/Oxlint or other semantic checks where configured.
- axe-core on Home, Interpret, Record, Review, 404, and representative error states.
- Lighthouse/best-practice checks as supplemental evidence.
- Contrast checks on design tokens/components.
- Automated keyboard/focus and accessible-name assertions.

### Manual checks

- Keyboard-only operation and visible focus.
- Screen reader on an approved browser/OS combination.
- Heading/landmark/navigation and route announcements.
- Live status and transcript without excessive speech.
- Form labels/errors and destructive dialogs.
- 200% zoom and 320 CSS px reflow.
- Reduced motion/background animation and skeleton pause.
- Canvas/video text alternatives.
- Touch target/spacing where mobile is supported.
- No color-only state and no flashing content.

Any P0/P1 accessibility defect blocks release. Exceptions require accessibility-owner approval, user impact analysis, workaround, and removal date.

## 8. Privacy and security verification

### Required evidence

- Data-flow diagram and external-request inventory.
- Browser network capture showing no first-party frame/landmark/label upload.
- CSP/host allowlist and production header validation.
- Dependency audit/license/SBOM/provenance review.
- React Router advisory upgrade/disposition.
- Import fuzz/adversarial tests and safe-render tests.
- Storage deletion and export inspection.
- Permission/lifecycle and late-resolution resource tests.
- Draft privacy notice and retention/deletion behavior approved.
- Speech platform/voice disclosure verified on supported platforms.
- Remote asset failure/offline behavior verified.
- Security issue severity and response process assigned.

### Threat-model sign-off

Critical/high findings require remediation or explicit, time-bounded acceptance by product/security owners. Unaccepted critical/high findings block release.

## 9. CI pipeline

### Pull request

1. Clean install from lockfile.
2. First-party lint.
3. Format/type/schema checks as adopted.
4. Unit/property tests.
5. Integration/storage tests.
6. Production build.
7. Bundle/resource budget report.
8. Dependency/security/license checks.
9. Browser smoke/E2E against preview.
10. Accessibility automated checks.
11. Evaluation smoke/fixture; full dataset job if available.

### Main/release branch

- Full supported-browser/device job or approved hardware runner/lab.
- Full evaluation with manifest/hash and threshold gate.
- Performance benchmark and regression gate.
- Production deploy to staging.
- Direct-route, headers, MIME, model/assets, camera, and storage staging tests.
- Signed build/artifact manifest.
- Approval and promotion to production.
- Post-release smoke and rollback readiness.

## 10. Release gates

Status legend: **Pass** = evidence meets the condition; **Fail** = a known condition is unmet; **Blocked** = evidence, approval, or target is insufficient to decide; **N/A with approval** = explicitly out of scope with recorded approval.

| Gate | Pass condition | Current status | Failure action |
|---|---|---|---|
| GATE-001 Scope/traceability | Approved scope/non-goals; every P0/P1 requirement has owner, test, and gate | **Blocked** | Resolve unowned/untraceable scope |
| GATE-002 Clean-install journey | Supported user can activate, understand prerequisites, and reach a truthful usable/calibration state | **Fail** — no templates/setup path | No release or remove unsupported turnkey claim |
| GATE-003 Production build | `npm run build` passes on the documented build environment | **Pass** — local evidence only | Re-run on release environment |
| GATE-004 Lint/format/static | First-party lint has 0 errors and approved warning budget; vendor generated files excluded | **Fail** | Fix config and first-party warnings |
| GATE-005 Automated tests | All required P0/P1 unit/integration/E2E suites pass | **Blocked** | No release |
| GATE-006 Data integrity/migration | 0 wrong-sign/invalid saves; valid fixture round-trip 100%; atomic recovery passes | **Fail** | Fix and rerun |
| GATE-007 Camera/model lifecycle | 0 active-stream/model leaks across remount/timeout/error tests | **Fail** — source-proven lifecycle gaps | Fix architecture and rerun |
| GATE-008 Recognition/segmentation | Approved held-out live and class metrics pass with manifest/policy hash | **Fail** — no approved live evidence | No public quality claim/release under current scope |
| GATE-009 Performance/resources | Approved latency/FPS/main-thread/bundle/device budgets pass | **Blocked** | Optimize or narrow support/claims |
| GATE-010 Accessibility | WCAG target passes automated/manual critical suite; no P0/P1 defect | **Fail** — source-proven critical barriers | Remediate or no release |
| GATE-011 Privacy/security | Threat model, notices, dependency, CSP, storage/deletion/network evidence approved | **Fail** — dependency advisory and no approvals | Remediate/disposition |
| GATE-012 Browser/device matrix | All P0 flows pass on supported matrix | **Blocked** | Narrow matrix or fix |
| GATE-013 Import/export/deletion | Valid/invalid/duplicate/quota/corrupt/cleanup tests pass | **Fail** — source-proven validation/commit gaps | Fix data layer |
| GATE-014 Documentation/claims | README/title/help/privacy/limitations match approved build/evidence | **Fail** | Reconcile docs |
| GATE-015 Licensing/provenance | Project/dependency/model/font/scene/dataset rights and notices approved | **Blocked** | No distribution |
| GATE-016 Deployment/headers | Staging HTTPS, fallback, MIME, CSP, asset/model behavior pass | **Blocked** | Fix host/config |
| GATE-017 Observability/support | Redacted diagnostics, issue triage, known limitations, owner/contact process ready | **Blocked** | Assign ownership/process |
| GATE-018 Rollback | Prior build/asset/data compatibility and rollback rehearsal pass | **Blocked** | No promotion |
| GATE-019 P0/P1 defects | 0 open; approved P2 exceptions only | **Fail** — known P0/P1 gaps remain | No release |
| GATE-020 Final sign-off | Product, engineering, QA, domain, privacy/security, accessibility, legal/provenance approvals recorded | **Blocked** | No release |
| GATE-021 Clean install/reproducibility | `npm ci` from lockfile and production build pass on supported Node/environment | **Blocked** | Fix and rehearse clean release build |

## 11. Defect severity

| Severity | Definition | Release policy |
|---|---|---|
| P0 Critical | Data loss/wrong-sign save, privacy leak, unsafe high-stakes output, core app unusable, security compromise | Blocks immediately; no exception for public release |
| P1 High | Major core-flow failure, inaccessible critical task, speech-only loss, import corruption, reproducible device incompatibility | Blocks release |
| P2 Medium | Non-core defect with workaround, minor quality/UX issue | Requires owner/workaround/disposition; limited exception possible |
| P3 Low | Cosmetic/minor copy/quality issue | Backlog unless release-specific |

## 12. Roadmap

Dates and staffing require approval. Exit criteria, not time estimates, define completion.

### Milestone M0 — Claim and baseline freeze

**Work:**

- Mark current artifact metrics as historical/non-release.
- Correct stale title/README/privacy/behavior claims.
- Establish source/version control, owners, supported baseline decision.
- Create requirement/risk/decision registers.

**Exit criteria:**

- No known false current claim remains.
- Evidence baseline and owners are recorded.
- Open decisions have owners and deadlines.

### Milestone M1 — Data and lifecycle stabilization

**Work:**

- Shared session controller and explicit model/camera disposal.
- Immutable pending recording identity.
- Versioned schema/validation/transaction completion.
- Custom ID/label migration and collision prevention.
- Deep atomic/staged import and complete export.
- Speech feature/error/preservation fixes.
- First-party unit/integration/CI foundation.

**Exit criteria:**

- GATE-004, GATE-005, GATE-006, GATE-007, and GATE-013 pass.
- Legacy data migration/recovery is tested and documented.
- No P0/P1 data/lifecycle defect remains.

### Milestone M2 — Controlled calibration alpha

**Work:**

- Explicit activation/unified error UX.
- Recording quality/readiness and timestamped replay.
- Review provenance, one-active playback, deletion policy.
- Accessibility/privacy/security reviews.
- Supported desktop matrix and production-like staging.

**Exit criteria:**

- Alpha usability/accessibility/privacy tasks pass.
- Calibration workflow is truthful and supportable.
- No public accuracy claim is made.

### Milestone M3 — Recognition-quality candidate

**Work:**

- Dataset manifest/consent/splits.
- EV-01 through EV-05 protocol implementation.
- Segmentation timestamp/quality and class-margin/aggregation policy.
- Cancellable/queued recognition-engine design (Worker or approved optimized main-thread implementation) and performance evidence.
- Approved thresholds and device benchmarks.

**Exit criteria:**

- GATE-008, GATE-009, and GATE-012 pass.
- Dataset/policy/build provenance is reproducible.
- Product/domain owners approve claims and limitations.

### Milestone M4 — Public beta candidate

**Work:**

- Resolve remaining P1 requirements.
- Bundle/approve starter data or finalize calibration-only positioning.
- Documentation, licensing/provenance, CSP/headers, staging, diagnostics, support, rollback.
- Final usability/accessibility/privacy verification.

**Exit criteria:**

- All applicable release gates pass.
- Final sign-off is recorded.
- Known limitations and incident/rollback owners are published internally.

## 13. Traceability map

| Current evidence | Gap/risk | Target requirement domains | Release gates |
|---|---|---|---|
| Camera/model on mount; async cleanup | GAP-003/004/023 | BRW, ERR, NFR lifecycle | GATE-007, GATE-012 |
| Pending capture sign/metadata/timing not immutable | GAP-002 | REC, VOC, DAT | GATE-006 |
| Invalid recordings accepted | GAP-005/025 | REC quality, DAT schema, DTW | GATE-005/006/008/013 |
| Import validation/partial commits and request-level success | GAP-005/024/025 | DAT import/export, transactions | GATE-006/013 |
| Custom collisions/orphan export | GAP-006/007 | VOC, DAT, TXT | GATE-006/013 |
| Empty-frame DTW cost; one/two-hand behavior | GAP-025 | LIV, technical DTW | GATE-005/008 |
| Unvalidated segmentation and pseudo-confidence/class margin | GAP-008/026 | LIV, TXT, evaluation | GATE-008 |
| Synchronous full-library DTW | Performance/ARC-005 | LIV/NFR, recognition engine | GATE-009 |
| Hidden errors/infinite recording state | GAP-004 | BRW/ERR/REC | GATE-005/007/012 |
| No templates in repository | GAP-001 | Product scope, VOC/LIV | GATE-002/008/015 |
| Remote assets/broad privacy copy | GAP-012/018/019 | BRW/UX/SEC/content | GATE-011/014/016 |
| Accessibility gaps | GAP-015 | UX/A11Y | GATE-010 |
| No tests/CI | GAP-010 | All | GATE-005/009 |
| Router advisory | GAP-011 | Security | GATE-011 |
| No deployment/rollback/support | GAP-013/023 | Technical/operations | GATE-016/017/018 |
| Stale README/title/claims | GAP-019 | Product/content | GATE-014 |

### Orphan checks

Before approval:

- Every P0/P1 requirement maps to at least one acceptance criterion, test, owner, and gate.
- Every P0/P1 acceptance criterion maps to a test/evidence record.
- Every P0 gap maps to a target requirement or explicit out-of-scope decision.
- Every stored metric/claim maps to a reproducible artifact and approved threshold.
- Every retained data field has purpose, source, store, display/use, export, retention, deletion, and test.
- Every external dependency/asset has version, owner, license/provenance, security review, and fallback/removal plan.

## 14. Release artifact checklist

A release candidate must retain:

- Source revision/archive hash and lockfile hash.
- Node/npm/browser build environment.
- Application build ID and asset manifest.
- Model/WASM/scene/font/dataset versions and checksums.
- Vocabulary and recognition-policy versions.
- Test/evaluation result manifests.
- Performance benchmark report.
- Accessibility report and manual test record.
- Privacy/security/dependency/license approvals.
- Migration/rollback rehearsal record.
- Approved release notes, known limitations, and support owner.
- Final gate/sign-off record.

## 15. Current recommendation

**No-go for general release as of 2026-09-25.**

Recommended immediate release statement:

> This repository is a local browser prototype for a bounded, user-recorded ISL vocabulary. Continuous-sign accuracy, clean-install readiness, accessibility conformance, and production privacy/offline behavior have not yet been validated for public release.

A controlled internal/demo build may proceed only with explicit P0 remediation, a known working template set, manual device verification, and limitations that do not overstate the available evidence.
