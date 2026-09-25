# PRD 09 — MASTER RECORD: Instructions, Changes, Problems, Open-Issue Register

> Date: 2026-09-24. Read this FIRST before any other PRD.
> Prior PRDs 01–08 hold the detail; this file is the binding index + verdicts.
> Machine protocol (§6) is MANDATORY for any future AI session touching this repo.

## 1. Owner instructions log (all directives received, all honored)

| # | Instruction | Disposition |
|---|---|---|
| I-01 | Read-only audit first; pull from gate; understand architecture; GitHub-as-DB feasibility | Done — PRD 01 |
| I-02 | Supabase for DB+Auth, Vercel for frontend; admin hardcoded-password idea → replaced with RLS role; Main vs personal DBs; custom-wins priority; 2-hand avatar preference; full PRD, no code | Done — PRD 02 v2 |
| I-03 | Save PRDs 01–02 in PRD folder; push | Done |
| I-04 | Push PRDs; gated site (login wall, Record hidden); admin double-confirm Publish (not git); Supabase storage map; custom always wins; avatar Main 2-hand>1-hand; interpreter searches all templates; update PRDs; push; then implement (asking blockers first) | Done — PRD 01 §6, PRD 02 v2, commits `1d9ec4d`, `2a79612` |
| I-05 | Phased scope: NO backend hosting; Supabase Auth+recordings only; backend stays localhost; Vercel frontend, redirect URL after deploy | Done — architecture as built |
| I-06 | Admin email `debjeetmazumder3232@gmail.com` (sole admin; its recordings → Main; all others → own DB); no hardcoded password (verified zero hits); prove + verify everything | Done — code defaults admin→Main; email lives ONLY in DB + chat, never in repo |
| I-07 | Elaborate how-tos for SQL/admin/Google/Vercel steps | Done — PRD 03 §4, chat runbooks |
| I-08 | Dual storage: Main recordings ALSO in GitHub-tracked `recordings.json`, same format; never gitignore; bridge file↔Supabase both ways; push + pull | Done — PRD 05, dual-write + `syncLegacyFileToMain`, commits `3e6517c`, `f7b93be` |
| I-09 | Avatar routing truth: gloss vs normalized; confirm local-record→Publish→Supabase+file→git-push chain | Done — byte-level proof, PRD 05 §1 + chat |
| I-10 | Append-only guarantee for recordings | Done — proven per write-path + chat |
| I-11 | Delete must work in both stores, Vercel + localhost | Done — dual-delete fixes, commit `f7b93be` |
| I-12 | All 37 buttons working everywhere | Done — PRD 08 census, all wired |
| I-13 | THIS file: consolidate everything; future AI must raise proper errors on unfixed items and notify user | Done — this file + `OPEN_ISSUES.json` |
| I-14 | Analyze avatar hand gap (above head) + overlap (chest); verify other AI's claims (2-bone IK / palm-axis) before acting; fix without breaking the working baseline; quick backend restart; write PRD; pull then push | Done — PRD 16: root cause proven numerically (direction-only FK ignores wrist positions), arms now two-bone IK, X-closure removed; `scripts/diagnose_fk_reach.py` + `scripts/verify_avatar_ik.mjs` are the proof |

## 2. Change log (commits, oldest→newest)

`25e2f5e` PRDs 01–02 · `12e0f31` v2 locked decisions · `1d9ec4d` Auth+isolation implementation ·
`2a79612` admin-defaults-Main · `a839331` PRD 03 · `8648476` PRD 04 · `7e167fc` PRD 04 cache addendum ·
`3e6517c` dual-storage + PRD 05 · `c403e33` PRD 04 resolution · `d4a80ea` MERGE with remote
`4dcde4b` (cyberpunk restyle + RLS hardening, compatible) · `1739b9e` image asset ·
`05381d1` PRD 06 Vercel connection · `be79a9d` PRD 07 gap analysis ·
`acc1b71` PRD 08 button audit · `f7b93be` dual-delete fixes ·
`4215398` clear-recording-database · `e63edce` palm-0.04+swing-twist (superseded) ·
**AVATAR-IK: arms rendered by two-bone IK landing wrists exactly on recorded positions;
X-axis palm closure removed from gloss converter; proof harnesses
`scripts/diagnose_fk_reach.py` + `scripts/verify_avatar_ik.mjs` (PRD 16).**

## 3. Problems found → verdicts

P-01 GitHub-as-live-DB unworkable for CRUD (100 MB cap, no locks, token-in-browser) → redesigned to Supabase, GitHub keeps snapshots only. CLOSED.
P-02 PostgREST `503 schema-cache` after correct SQL run → stuck cache, fixed via reload (baked into migration). Tables `200` since. CLOSED.
P-03 Main single-delete silent no-op → fixed (row-count verified deletes). CLOSED.
P-04 Clear-for-sign ignored Main target → fixed (target-aware + scoped confirms). CLOSED.
P-05 Deletes didn't mirror stores → fixed (Main-only mirror both directions). CLOSED.
P-06 Hardcoded `localhost:8000` everywhere → env-driven `VITE_*` URLs. CLOSED.
P-07 Push rejected (remote `4dcde4b`) + `package-lock.json` collision → merged, reviewed hunk-by-hunk, backup removed, build green. CLOSED.
P-08 Avatar hands rendered apart above head / overlapping at chest → single renderer bug: direction-only arm FK with fixed bone lengths never placed wrists at recorded positions (measured: A 0.503 recorded vs 0.332 rendered; B 0.413 vs 0.530). Fixed with two-bone IK (PRD 16). CLOSED.
P-09 Suspected "force field" above head / palm-closure axis mismatch → measured: face collision never fired (0/82 frames) and was already disabled; X-closure never fired on real takes (gap 0.017 < 0.04). Neither was the cause; closure removed anyway so wide signs render true (PRD 16). CLOSED.

## 4. Locked decisions (do not regress)

D-01 Whole site login-gated; anon sees `/login` only. D-02 No passwords/emails/secrets in repo (grep-proven). D-03 Admin = `profiles.is_admin`, sole admin `debjeetmazumder3232@gmail.com`; admin defaults to Shared Main with type-PUBLISH confirm (not git). D-04 Custom recordings always outrank Main per user; avatar order user→Main-2-hand→Main-1-hand→fingerspell; interpreter searches ALL templates, custom-first two-stage. D-05 `recordings.json` stays git-tracked, same format both stores, both directions bridged. D-06 Deletes mirror Main-only; Clear-All is own-space-only under Supabase. D-07 No backend hosting (localhost); Vercel serves frontend.

## 5. Open-issue register (binding — see `OPEN_ISSUES.json` for machine form)

| ID | Sev | Issue | Verify (run me) | Status |
|---|---|---|---|---|
| ISS-01 | HIGH | Google OAuth provider disabled → credentials PATCHed live 2026-09-24, re-GET verified `external_google_enabled=true` + ID/secret set; awaiting first real click test | Management API `config/auth` read | FIXED-VERIFY |
| ISS-02 | HIGH | Zero logins; admin flag unset (0 `profiles` rows) | `profiles?select=email` via service_role (expect 0 until first login) | OPEN — owner: first login → flag SQL → relogin |
| ISS-03 | HIGH | Vercel env vars + redeploy unverified (invisible from here) | Owner: Vercel dashboard check | OPEN — owner |
| ISS-04 | MED | Import Dictionary not admin-gated (UI shows to all; `POST /api/import-poses` unauthenticated) | grep `useAuth` in `MediaInterpreter.jsx` (expect hits after fix) | OPEN — code |
| ISS-05 | MED | `ReviewFlagged` lacks Main\|Mine toggle | grep `isAdmin` in `ReviewFlagged.jsx` | OPEN — code |
| ISS-06 | MED | Avatar gloss file-dependent; no Supabase gloss cache / Main→file pull | check for `gloss_cache` migration or backend Supabase read | OPEN — enhancement (~30 lines) |
| ISS-07 | LOW | `LandingPage.jsx` orphaned (unrouted since `/`→HomePage) | grep `LandingPage` outside its file | OPEN — delete or re-mount |
| ISS-08 | LOW | Local vite may predate `.env.local` (env needs restart) | compare vite process start vs `.env.local` mtime | OPEN — owner: restart vite |
| ISS-09 | HIGH | Privileged `sbp_` token + anon key pasted in chat history | — | OPEN — owner: revoke token in dashboard Access Tokens |

## 6. MANDATORY protocol for any future AI session (read + obey before coding)

1. Read this file and `PRD/OPEN_ISSUES.json` first. Sync JSON statuses with §5 if drifted.
2. For every `OPEN` item: re-verify LIVE with its Verify command/probe. Do not trust old greens.
3. For every item still unfixed: raise it as a PROPER ERROR (blocking, itemized, with file:line
   evidence) — never silently proceed, never downgrade severity yourself.
4. Notify the user with: (a) the failing item IDs, (b) exact owner vs code actions, (c) what is
   blocked until each clears. Stop and wait where an owner click is required (Supabase dashboard,
   Google Cloud, Vercel); implement immediately where the fix is code (ISS-04/05/06/07).
5. After any fix: re-verify live, flip status here + JSON, commit, pull-before-push, report.
