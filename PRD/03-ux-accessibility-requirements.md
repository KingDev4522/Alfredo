# UX and Accessibility Product Requirements

| Field | Value |
|---|---|
| Product | ISL Interpreter |
| Document status | Proposed target requirements |
| Version | 1.0 |
| Baseline | 2026-09-25 codebase |
| Owner | Product Design + Accessibility Lead — assign before approval |
| Related documents | `01-master-product-requirements.md`, `02-functional-requirements.md`, `04-technical-data-privacy-security.md`, `06-current-state-codebase-audit.md`, `07-verification-release-roadmap.md` |

## 1. Purpose

This PRD defines the target experience for first-time users, ISL signers, recording-data contributors, reviewers, and people using assistive technologies. It converts the current UI audit into testable requirements and separates implemented behavior from proposed target behavior.

### Evidence labels

- **[CURRENT]** — present in the codebase.
- **[TARGET]** — required for the proposed release.
- **[PLACEHOLDER]** — threshold or copy requiring owner approval.
- **[OPEN]** — product decision not yet made.

## 2. Experience principles

1. **Communication clarity over cleverness.** Recognition status, current phrase, limitations, and recovery actions must always be understandable without interpreting decorative visuals.
2. **Permission after intent.** Camera and model access should begin from an explicit user action, not merely because a route or tool mounted.
3. **Local-data transparency.** Users must know what skeleton data is stored, where it is stored, and how to export or delete it.
4. **Uncertainty is visible.** The interface must not imply certainty when the classifier abstains, a segment is incomplete, or a word is ambiguous.
5. **Accessible by default.** Keyboard, screen-reader, reduced-motion, zoom/reflow, contrast, and non-camera alternatives are release requirements, not enhancements.
6. **One clear next action.** Permission, empty, error, review, and destructive states must provide a specific recovery path.
7. **Destructive actions are distinct.** Search, playback, record, delete, clear, and import/export must not share ambiguous emphasis.
8. **Core function over decoration.** 3D scenes and animation must not compete with camera processing or become prerequisites for understanding the product.

## 3. Primary actors

| Actor | Goal | Current entry | Primary needs |
|---|---|---|---|
| First-time visitor | Understand scope and decide whether to try | Home | Clear capability/limitation statement, setup prerequisites, direct next action |
| ISL signer | Turn signs into visible/spoken text | Interpret | Low-friction activation, accurate status, transcript, manual speech, recovery |
| Recording contributor | Build or repair a recognition library | Record | Immutable sign association, capture validation, replay, clear progress |
| Data reviewer | Find and remove bad recordings | Delete / Record | Searchable metadata, one-at-a-time playback, confirmation, provenance |
| Device diagnostician | Check camera/model compatibility | Record → Camera Test | Detailed FPS, delegate, constraints, scale, and actionable errors |
| Assistive-technology user | Operate equivalent workflows without visual motion/pointer input | All | Semantics, labels, focus, live announcements, reduced motion, scalable layout |

No role-based access or authentication currently exists. The product must not imply that one browser profile safely separates ordinary signer data from administrator/reviewer actions.

## 4. Information architecture and navigation

### 4.1 Current structure

| Route | Current purpose | Current status |
|---|---|---|
| `/` | Marketing/onboarding landing page | Implemented |
| `/interpret` | Marketing hero plus live interpreter | Implemented; tool activates on mount |
| `/record` | Marketing hero plus recording tool and camera test | Implemented; tool activates on mount |
| `/delete` | Review/search/delete recordings | Implemented |
| Unknown route | Empty content below global navigation | Missing |

Evidence: `src/App.jsx:18-24`, `src/components/Navbar.jsx:53-84`.

### 4.2 Target navigation requirements

#### UX-NAV-001 — Route completeness (P0)

**Target:** The application shall provide a useful catch-all not-found view with a Home action and a way to report the invalid path locally or through an approved support channel.

**Acceptance criteria:**

- Navigating to an unknown in-app path does not render a blank content area.
- The not-found view has one page heading, readable context, and a working Home action.
- Refresh and browser Back/Forward behavior are verified for the not-found view.

#### UX-NAV-002 — Page identity and focus (P0)

**Target:** Every route shall expose a unique document title, one semantic page heading, and a programmatically focusable main landmark or heading. Client-side navigation shall move focus to the new page context and reset scroll to the top.

**Acceptance criteria:**

- Home, Interpret, Record, and Delete have distinct document titles.
- Each route has exactly one primary `h1` representing the page purpose.
- Keyboard and screen-reader users are informed of a route change without relying on visual scroll.
- Smooth-scrolling to a tool moves focus to the tool heading or first required activation control.

#### UX-NAV-003 — Responsive navigation (P1)

**Target:** The global navigation shall remain understandable and operable at supported viewport widths without becoming a tall wrapping sticky bar that obscures content.

**Acceptance criteria:**

- At 320 CSS pixels width, all primary destinations remain reachable.
- The active route is programmatically and visually identifiable.
- Any menu/disclosure exposes `aria-expanded` and `aria-controls`, supports Escape, returns focus predictably, and does not trap keyboard users.
- Anchor offset is calculated from the actual navigation height rather than a hard-coded 64 pixels.

#### UX-NAV-004 — Information hierarchy (P1)

**Target:** Interpretation shall be the primary product task. Recording and review are necessary setup/data-management tasks and shall be visually and structurally secondary without being hidden from users who need them.

**Acceptance criteria:**

- Home presents interpretation as the primary path and explains that recording may be required.
- A user with no templates receives a direct link to the first-recording action.
- Destructive/data-management actions are distinguishable from primary interpretation and recording actions.

## 5. Global interaction and state requirements

#### UX-STATE-001 — Explicit camera activation (P0)

**Current:** `/interpret` and `/record` request camera/model access on component mount, even when the user has only viewed the hero.

**Target:** Camera/model setup shall begin only after an explicit “Enable camera” or equivalent user action, except where the user has already granted session-level permission in the same flow and the action remains clear.

**Acceptance criteria:**

- Initial page load does not request camera permission.
- The activation control explains that video is processed for hand tracking and is not intentionally recorded unless the user starts a capture.
- Activating starts one camera/model session and exposes status, Cancel where applicable, and Stop.
- Leaving the page/tool stops the stream and model resources.

#### UX-STATE-002 — Unified readiness and failure model (P0)

**Target:** Interpret, Record, and Camera Test shall use a shared state model with at least: idle, requesting permission, loading model, ready, active, permission denied, camera unavailable, camera in use, model failed, processing failed, stopped, and unexpected error.

**Acceptance criteria:**

- Start/capture controls are enabled only in a genuinely ready state.
- Every failure state identifies what failed, whether camera is active, and the next recovery action.
- Retry does not create duplicate camera or model sessions.
- No flow can enter an indefinite countdown/recording state after model/camera loss.

#### UX-STATE-003 — Async mutation protection (P0)

**Target:** Save, import, export, delete, clear, and custom-word mutation shall expose pending state and prevent duplicate activation while in flight.

**Acceptance criteria:**

- Pending controls are disabled or idempotent.
- Success is announced only after persistence completes.
- Failure preserves the pending recording/selection where applicable.
- Overlapping delete/clear operations cannot produce inconsistent UI and store state.

#### UX-STATE-004 — Status communication (P0)

**Target:** Camera, model, capture, recognition, sentence, import/export, save, search, playback, and deletion states shall use text and programmatic semantics in addition to color.

**Acceptance criteria:**

- Visual state is not the sole means of communication.
- Dynamic status uses an appropriate live region without excessive repetition.
- User-action errors identify the affected item and preserve context.
- Status banners do not rely on remote decorative assets for meaning.

## 6. Screen requirements

### 6.1 Home / onboarding

#### UX-HOME-001 — Explain product scope before permission (P0)

**Target:** Home shall state that the current product recognizes a bounded, user-recorded vocabulary and provides an experimental interpretation aid. It shall not imply unrestricted ISL understanding or authoritative translation.

**Acceptance criteria:**

- The page explains the three supported modes: Interpret, Record, and Review/Delete.
- “Translation” versus “interpretation” terminology is consistent with the approved product name.
- The fixed-vocabulary/custom-calibration model and known limitations are visible before camera use.
- The primary CTA leads to a clear activation step rather than silently requesting camera access.

#### UX-HOME-002 — Resilient visual hero (P1)

**Target:** The 3D hero shall have an understandable first-party fallback and shall not be the only source of the product name, value proposition, or CTA.

**Acceptance criteria:**

- When Spline, WebGL, or network loading fails, core copy and actions remain usable.
- The remote scene does not remain mounted and consume GPU resources while camera tools are active below the fold.
- Decorative scene text is not repeated confusingly by first-party DOM content.

### 6.2 Interpret

#### UX-INT-001 — Transcript-first layout (P0)

**Target:** The live tool shall prioritize: camera preview, current hand/session status, recognized-word transcript, interpretation status/uncertainty, speech controls, and settings/help. Decorative 3D content shall not displace these on small screens.

**Acceptance criteria:**

- The current phrase is available as text, not only as speech.
- Accepted, ambiguous, not-recognized, and interrupted segment states have distinguishable semantics; a not-recognized state includes an approved reason.
- Manual Speak, Stop/Replay behavior, Clear, auto-grammar control, and template reload have explicit names and states.
- The manual Speak action remains available when the hands-out trigger is unsuitable.

#### UX-INT-002 — Recognition uncertainty (P0)

**Target:** The interface shall distinguish observing, capturing, classifying, and one terminal outcome: accepted, ambiguous, not recognized, or interrupted. A not-recognized outcome shall display an approved reason such as below-threshold or unknown gesture. The interface shall use neutral wording and shall not claim no incorrect output is possible.

**Acceptance criteria:**

- A movement segment produces exactly one terminal outcome: accepted, ambiguous, not recognized, or interrupted.
- Ambiguous and not-recognized outcomes never append an unapproved word, and their reason is available to assistive technology and visual users.
- Duplicate suppression does not hide that a repeated sign was intentionally suppressed.
- If runner-up ambiguity is shown, the UI explains how the user can retry or correct it.
- The current phrase is never cleared solely because speech scheduling was invoked.

#### UX-INT-003 — Speech controls and failure (P0)

**Target:** Speech shall be feature-detected and expose speaking, queued, completed, failed, and stopped states.

**Acceptance criteria:**

- Unsupported Speech Synthesis produces a visible non-blocking message and preserves the text.
- Speech failure/error does not erase the phrase.
- Users can replay the current phrase and stop active speech.
- The phrase preview uses the same text that is sent to speech, including custom labels.

#### UX-INT-004 — Camera geometry and feedback (P1)

**Target:** Video and landmark overlay shall use a consistent crop/aspect model and provide a mirrored/non-mirrored setting that is clear and consistent.

**Acceptance criteria:**

- Skeleton landmarks align with the displayed hand at supported aspect ratios.
- Switching routes or orientation does not leave a stretched overlay.
- The user can tell whether the preview is mirrored.
- A no-hand state gives positioning guidance without implying recognition is occurring.

### 6.3 Record

#### UX-REC-001 — Capture state machine (P0)

**Target:** Recording shall use explicit states: ready, countdown, capturing, processing, review, saving, saved, discarded, cancelled, and failed. Countdown and capture shall be cancellable.

**Acceptance criteria:**

- The sign/label, expected hand count, recorder and condition metadata, and capture start context associated with a pending recording are visibly immutable during review; edits apply to the next recording.
- Start is disabled unless camera/model readiness and minimum capture conditions pass.
- Cancel returns to ready and releases capture resources.
- A watchdog ends a capture if frames stop arriving.
- Empty, short, or invalid-hand recordings cannot be saved.

#### UX-REC-002 — Replay review (P0)

**Target:** Replay shall show the sign label, expected/observed hand count, frame count/duration, recorder/batch metadata, and capture quality warnings before Keep.

**Acceptance criteria:**

- Replay works for valid and recoverable invalid captures.
- The review identifies the exact sign/label that Keep will save.
- Keep remains disabled until the capture meets approved validity criteria.
- Discard asks only when work would otherwise be lost; it returns a clear ready state.

#### UX-REC-003 — Dataset progress (P0)

**Target:** Per-sign and overall progress shall distinguish “saved examples” from “approved/usable templates,” because raw count alone does not prove recognition readiness.

**Acceptance criteria:**

- The UI explains whether the target is a recommended count or a tested requirement.
- Invalid/imported/quarantined recordings are not silently counted as approved examples.
- Users can see which signs still lack enough usable data for the current classifier policy.

#### UX-REC-004 — Custom word creation (P0)

**Target:** Custom-word creation shall show the generated display label, stable internal ID, collision status, required example target, speech pronunciation behavior, and delete consequences before save.

**Acceptance criteria:**

- Duplicate or fixed-vocabulary ID collisions are blocked with plain-language guidance.
- Labels supported only in a restricted character set are explained before save.
- The user can cancel without side effects.
- Later edits and deletions cannot orphan or mislabel existing recordings.

### 6.4 Review and deletion

#### UX-REV-001 — Findable records (P0)

**Target:** Review shall support searching by display label and, for advanced recovery, raw/internal ID. Unknown imported IDs shall not become invisible.

**Acceptance criteria:**

- Search results state the query, match count, and no-result reason.
- Recorder, timestamp, batch, hand count, and frame/duration metadata are visible where available.
- The user can sort/filter by at least sign and quality/capture state if those fields are retained.
- Clear-all is not required to remove one bad item.

#### UX-REV-002 — Playback control (P1)

**Target:** One skeleton shall play at a time by default. Playback shall support Play, Pause, Replay, and speed/step controls appropriate to review needs.

**Acceptance criteria:**

- Loading many results does not start one animation timer per card.
- Playback state is programmatically exposed and visually obvious.
- Playback remains aligned with the recording metadata and frame timestamps.
- Invalid recordings have a descriptive state rather than a blank canvas.

#### UX-REV-003 — Destructive action hierarchy (P0)

**Target:** Search and replay are neutral. Delete is destructive. Clear Sign, Remove Custom Word plus Recordings, and Clear All use progressively stronger warnings and require scoped confirmation.

**Acceptance criteria:**

- Individual deletion provides confirmation or a reversible Undo window; the approved behavior must be consistent.
- Bulk confirmation names the exact count/sign/custom word affected.
- Remove Custom Word cannot silently delete recordings unless the confirmation explicitly states that consequence.
- Success is announced only after deletion completes; failure leaves the item visible and actionable.

### 6.5 Camera Test / diagnostics

#### UX-DIAG-001 — Optional, non-competing diagnostics (P1)

**Target:** Camera Test shall be a proper disclosure, shall not start a second camera/model session while Recording is active, and shall provide remediation for low FPS or unavailable delegates.

**Acceptance criteria:**

- Disclosure state is keyboard and screen-reader accessible.
- Opening diagnostics reuses or clearly stops the active session according to the approved architecture.
- FPS, delegate, negotiated constraints, processing scale, dropped frames, and errors include units and timestamp.
- “Diagnostics” information does not use a 16-pixel bare text target.

## 7. Accessibility requirements

The proposed target is **WCAG 2.2 Level AA**, subject to accessibility-owner approval and documented exceptions. Product requirements shall be verified with automated and manual methods; automated checks alone are insufficient.

### 7.1 Semantics and names

#### UX-A11Y-001 — Form labels (P0)

Every input, select, textarea, and button shall have a persistent programmatic name. Placeholder text may provide an example but shall not be the only label.

**Acceptance criteria:**

- Review search, custom word, recorder, batch, remove-word, and future settings controls have associated labels.
- Grouped/related controls use fieldsets and legends where applicable.
- Validation errors are programmatically associated with their field.

#### UX-A11Y-002 — Headings and landmarks (P0)

Each route and each primary tool shall have a logical heading hierarchy. Decorative imagery shall not replace semantic page titles.

**Acceptance criteria:**

- One `h1` exists per route.
- Tool regions have named headings.
- Navigation and main landmarks are unique and correctly nested.
- A skip link is the first keyboard focus target and becomes visible on focus.

#### UX-A11Y-003 — Accessible names for media and canvas (P0)

Camera video and skeleton canvases shall have names/descriptions and equivalent textual status. Canvas-only information shall never be the sole output.

**Acceptance criteria:**

- Preview names include purpose and current mode.
- Landmark overlays have a concise text alternative.
- Current recognized phrase, confidence/uncertainty, and speech state are available as text.
- Decorative canvases/scenes are hidden from the accessibility tree.

### 7.2 Keyboard and focus

#### UX-A11Y-004 — Full keyboard operation (P0)

All navigation, camera activation, capture, replay, recording review, search, import/export, custom-word management, and deletion shall be operable without a pointer.

**Acceptance criteria:**

- No keyboard trap exists outside intentional modal confirmation.
- Custom skeleton controls and canvases are not focusable unless they expose meaningful keyboard behavior.
- Escape closes menus/dialogs predictably; destructive dialogs retain safe default focus.
- Disabled controls do not receive hidden pointer-only actions.

#### UX-A11Y-005 — Focus visibility and management (P0)

**Target:** A high-contrast `:focus-visible` treatment shall be defined globally. Opening dialogs, completing async actions, switching playback, and route changes shall manage focus deliberately.

**Acceptance criteria:**

- Focus is never hidden behind sticky navigation.
- Focus moves to an error summary or invalid field when submission fails.
- Focus returns to the invoking control after a non-destructive dialog closes.
- Route and anchor changes move focus to the new context.

### 7.3 Dynamic communication

#### UX-A11Y-006 — Live status and transcript (P0)

**Target:** Meaningful changes shall be announced through restrained live regions.

**Acceptance criteria:**

- Polite status: camera ready, countdown, recognition accepted/ambiguous/not-recognized/interrupted, transcript update, save/search success.
- Assertive alert: permission revoked, model/camera fatal error, destructive failure, storage/quota failure.
- Countdown does not announce every redundant render.
- Users can review the full current transcript and history without hearing every intermediate confidence update.

### 7.4 Visual presentation

#### UX-A11Y-007 — Contrast and non-color cues (P0)

**Target:** Text and meaningful UI components shall meet WCAG 2.2 AA contrast. Status shall not depend on teal/rose/amber alone.

**Acceptance criteria:**

- Normal text meets at least 4.5:1; large text and UI component boundaries meet applicable AA thresholds.
- Muted slate microcopy and white-on-rose primary buttons are corrected.
- Focus, selected, accepted, not-recognized, interrupted, destructive, and disabled states include text/icon/shape cues.

#### UX-A11Y-008 — Reflow and zoom (P0)

**Target:** Core workflows shall remain usable at 320 CSS pixels width and at 200% browser zoom without two-dimensional scrolling, except where an identified complex canvas requires an accessible alternative.

**Acceptance criteria:**

- Navigation, action rows, recording review, data management, and transcript wrap or stack.
- Fixed 320-pixel canvases do not overflow their cards.
- Remote 3D scenes do not force horizontal overflow.
- Content remains readable with browser text spacing overrides where feasible.

#### UX-A11Y-009 — Motion and animation (P0)

**Target:** `prefers-reduced-motion: reduce` shall disable or substantially minimize non-essential GSAP, pulsing, cursor-following, and continuous 3D/skeleton animation. Skeleton replay shall offer pause.

**Acceptance criteria:**

- No auto-playing decorative animation persists under reduced motion.
- Countdown and recording feedback remain understandable without scaling/pulsing.
- Essential status is available as static text.
- Remote scene loading/failure does not block core content.

#### UX-A11Y-010 — Target size and pointer behavior (P1)

Interactive targets shall meet the applicable WCAG 2.2 target-size requirement or provide sufficient spacing/exception. Compact destructive/replay controls and Camera Test shall be resized or spaced accordingly.

### 7.5 Error and recovery accessibility

#### UX-A11Y-011 — Plain-language errors (P0)

Error messages shall identify the problem, affected action/item, whether data was preserved, and the next recovery step without relying on browser error codes.

**Acceptance criteria:**

- Permission, no camera, camera busy, model download, WASM/WebGL, storage quota, malformed import, speech, and unknown errors have approved copy.
- Technical details may be expandable but do not replace the recovery instruction.
- Repeated failure offers a safe route back without infinite retry.

## 8. Responsive and visual-system requirements

#### UX-VIS-001 — Shared design primitives (P1)

**Target:** Color roles, typography, spacing, focus, radii, status tones, button variants, and motion tokens shall be centralized rather than duplicated across page-specific GSAP handlers.

**Acceptance criteria:**

- Interpretation, recording, review, and destructive actions use documented semantic variants.
- Disabled, hover, focus, active, loading, and error variants are defined.
- Visual changes do not alter layout unexpectedly.

#### UX-VIS-002 — 3D and WebGL fallback (P0)

Remote Spline content shall be optional enhancement. Product name, instructions, controls, and status shall be available without it.

**Acceptance criteria:**

- Scene errors, WebGL denial, offline behavior, and reduced motion produce a usable fallback.
- The 3D payload is not active during an active camera session when it causes contention.
- External scene controls do not duplicate or conflict with first-party actions.

#### UX-VIS-003 — Remote asset disclosure (P1)

Where fonts or 3D assets are remote, the experience shall remain legible with system-font and static fallbacks and shall disclose external requests in the privacy notice.

## 9. Content, terminology, and limitations

### Approved-copy decisions still required

- Product name: “ISL Interpreter” versus another name.
- Primary verb: “Interpret” versus “Translate.”
- Whether “Start Translating” remains user-facing.
- Whether “Phase 1” is removed entirely.
- Whether “Good / Bad” is split, disambiguated, or renamed.
- Exact accuracy/limitations wording.
- Whether speech pronunciation is configurable for custom labels.

### Required content principles

1. Define “ISL” in full at first use.
2. Describe the product as a bounded-vocabulary interpretation aid, not a complete ISL translator.
3. State that camera frames/landmarks are processed locally by first-party code while remote assets may be requested.
4. Distinguish skeleton recordings from video/audio recordings.
5. Explain that custom words require recorded examples and do not instantly add general recognition capability.
6. Explain deletion scope before every destructive operation.
7. Use “recognized sign” rather than presenting a machine result as an unquestionable translation.

## 10. UX verification matrix

| Area | Automated minimum | Manual minimum | Release disposition |
|---|---|---|---|
| Routes/navigation | Link, title, heading, landmark checks | Keyboard traversal, Back/Forward, direct route refresh | P0 |
| Camera/model states | State reducer/component tests | Permission grant/deny/revoke, device busy, model failure | P0 |
| Recording | State-machine and validation tests | Countdown/cancel, interrupted frames, replay/keep/discard | P0 |
| Live transcript | Segmentation/UI integration fixtures | Different signers/lighting/devices | P0/P1 quality gate |
| Data management | Storage and import validation tests | Search, delete, clear, export/import round trip | P0 |
| Speech | Mock Speech Synthesis errors | Supported/unsupported voices and failure | P0 |
| Accessibility | axe/Lighthouse plus component checks | Keyboard, screen reader, zoom, reduced motion, contrast, reflow | P0 |
| Responsive | CSS/layout regression checks | 320, 375, 768, 1280, and representative large widths | P1 |
| 3D/fallback | Component failure tests | Offline, WebGL denial, reduced motion, slow network | P1 |

## 11. Approval and evidence required

Before this PRD can move from **Proposed** to **Approved**, the team must assign:

- Product owner for scope and terminology.
- UX owner for information architecture and interaction states.
- Accessibility owner and target conformance level.
- ISL domain reviewer for vocabulary, gesture, and interpretation claims.
- Privacy owner for camera/storage/speech copy.
- Engineering owner for shared session/state architecture.

Evidence must include approved wireframes or equivalent flows, content review, an accessibility test protocol, representative device/browser results, and traceability from every P0 UX requirement to tests and release gates.
