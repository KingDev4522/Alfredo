# ISL Interpreter — Product Requirements Documentation

This folder contains the code-derived PRD set for the ISL Interpreter browser prototype. It documents the current implementation, the proposed target product, functional behavior, UX/accessibility, technical/data/privacy/security architecture, and verification/release requirements.

## Document status

| Field | Value |
|---|---|
| Baseline date | 2026-09-25 |
| Product stage | Hackathon/browser prototype |
| Current release recommendation | **No-go for general release** |
| PRD status | Proposed; owners and numeric targets still require approval |
| Source baseline | All first-party source/configuration/docs/scripts and checked-in evaluation artifact; generated dependency internals excluded except where integrated |

## Reading order

1. [`01-master-product-requirements.md`](01-master-product-requirements.md) — product definition, scope, personas, journeys, goals, metrics, release approach, and open decisions.
2. [`02-functional-requirements.md`](02-functional-requirements.md) — testable requirements for lifecycle, recording, vocabulary, storage, recognition, transcript/speech, review, and errors.
3. [`03-ux-accessibility-requirements.md`](03-ux-accessibility-requirements.md) — navigation, screen flows, interaction states, responsive behavior, and WCAG-oriented requirements.
4. [`04-technical-data-privacy-security.md`](04-technical-data-privacy-security.md) — target architecture, schemas, storage, recognition policy, security/privacy, performance, deployment, and migration.
5. [`05-decisions-risks-and-assumptions.md`](05-decisions-risks-and-assumptions.md) — unresolved product/engineering choices, assumptions, risk register, and claim-control rules.
6. [`06-current-state-codebase-audit.md`](06-current-state-codebase-audit.md) — evidence-based inventory of what exists, what was validated, and what is missing or contradictory.
7. [`07-verification-release-roadmap.md`](07-verification-release-roadmap.md) — test strategy, evaluation protocol, release gates, current gate status, and milestone exit criteria.

## Product summary

ISL Interpreter is intended to be a privacy-conscious, browser-based communication aid for a bounded vocabulary. The current code:

- Is configured to detect up to two hands with MediaPipe; cross-browser/device runtime support remains unvalidated.
- Records normalized hand-landmark sequences.
- Stores recordings in IndexedDB and custom labels in localStorage.
- Segments continuous hand motion using movement/pause heuristics.
- Classifies sequences through weighted Dynamic Time Warping against user-recorded templates.
- Builds a rule-based English phrase and optionally uses browser speech synthesis.
- Supports recording review, JSON import/export, and deletion.

It is a personalized nearest-template engine, not a trained general ISL translator.

## Current release blockers

1. A clean install contains no recognition templates.
2. Continuous/live segmentation and confidence behavior are not validated end to end.
3. The checked-in 97.535% result is a historical pre-segmented leave-one-out artifact and is not reproducible from this repository.
4. Recording can be saved under a sign changed after capture.
5. Invalid recordings/imports can pollute or crash recognition.
6. Camera/model lifecycle can leak resources or hide failure.
7. Custom labels/IDs and exports are not portable or collision-safe.
8. Speech failure can erase the visible sentence.
9. There are no first-party tests, CI, supported-device matrix, deployment configuration, or production privacy/accessibility evidence.
10. README/title/timing/threshold/privacy/visual claims are stale or overstated.

## Validation snapshot

| Check | Result |
|---|---|
| Production build | Pass; Vite emitted 5,109,672 raw asset bytes and warned on multiple large chunks |
| First-party lint | 5 warnings, 0 errors |
| Full lint | 536 warnings, 3 generated-WASM false-positive errors |
| Evaluation rerun | Blocked by missing external dataset; hard-coded paths are not portable |
| Stored evaluation | 0.975352 accuracy on 277/284 pre-segmented recordings; no mixed hand counts |
| Dependency audit | Two high-severity React Router records; upgrade/disposition required |
| Route smoke | `/`, `/record`, `/interpret`, `/delete` returned HTTP 200 from Vite |
| Interactive browser/device | Not validated; no connected browser and no physical-device matrix run |

See `06-current-state-codebase-audit.md` for command details and limitations.

## Requirement conventions

### Status labels

- **Current** — implemented behavior.
- **Target** — required proposed behavior.
- **Placeholder** — value/policy requiring owner approval.
- **Open** — unresolved product or engineering decision.
- **Out of scope** — explicitly excluded from this release.
- **Verified** — target behavior with passing linked evidence; current requirements are not verified merely because UI exists.

### Priorities

- **P0** — release-blocking data integrity, privacy, safety, accessibility, or core behavior.
- **P1** — required for the public beta unless explicitly deferred.
- **P2** — candidate improvement after beta.

### ID patterns

- `PRD-P0-###`, `PRD-P1-###` — master product requirements.
- `FR-{DOMAIN}-###` — functional requirements.
- `AC-{REQ-ID}-##` — acceptance criteria.
- `UX-{DOMAIN}-###` — UX requirements.
- `NFR-{DOMAIN}-###` — non-functional requirements.
- `GAP-###` — current-state gaps.
- `GATE-###` — release gates.
- `DEC-###`, `ARC-###` — product and architecture decisions.

IDs are stable. Retired IDs must not be reused.

## Product decisions still required

1. Final product name and “Interpret” versus “Translate” terminology.
2. Whether release bundles an approved starter recognition library, supports an approved import-only setup, or launches calibration-first.
3. Final ISL vocabulary, variants, hand-count metadata, and high-stakes word policy.
4. Whether/how ambiguous Good / Bad is represented.
5. Supported browser/device/OS matrix.
6. Recognition quality, rejection, latency, and resource thresholds.
7. Local retention, persistence, deletion/undo, and import duplicate policy.
8. Whether health/emergency vocabulary is included in the public release.
9. Remote telemetry policy (proposed default: no remote telemetry).
10. Project license, notices, model/dataset/scene/font provenance, and distribution model.

## Source-of-truth hierarchy

When documents disagree:

1. Executed, reproducible evidence from the approved release build wins for current behavior.
2. First-party code/config is next for current implementation.
3. Check-in artifacts/comments/UI copy are supporting evidence, not automatic truth.
4. This PRD set records the proposed target; it becomes authoritative only after the assigned owners approve it.
5. Unresolved differences are open decisions, not assumptions.

## Maintenance rules

- Update the master scope and affected functional/UX/technical requirements together.
- Never mark a target requirement Verified without linked test/evaluation evidence.
- Keep Current and Target statements separate.
- Update public claims only after their release gate passes.
- Preserve old approved results by dataset, policy, and build hash; do not overwrite historical evidence silently.
- Record data-schema, vocabulary, model, and policy migrations with compatibility/rollback behavior.
- Re-review the PRD set after a recognition engine, data model, browser-storage, deployment, privacy, or vocabulary change.

## Approval owners still to assign

- Product owner.
- Engineering owner.
- QA/release owner.
- ISL domain reviewer.
- UX/accessibility owner.
- Privacy/security owner.
- Legal/license/provenance owner.
- Support/operations owner.

Until those owners approve the relevant documents and thresholds, the PRDs are implementation guidance rather than a public release authorization.
