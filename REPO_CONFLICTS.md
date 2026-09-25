# Repo Conflict Notes

Audit taken while cleaning up routing, hashes and em dashes.
Branch `main`, working tree at `KAVACHAI`.

## 1. Merge conflict that was blocking the repo (RESOLVED)

The repo was sitting in an unfinished merge that had never been committed:

```
MERGE_HEAD present: 61b4376
MERGE_MSG:         Merge branch 'main' of https://github.com/KingDev4522/ALFREDO-ISL
Unmerged paths:    isl-backend/server_stderr.log  (UD: deleted by them)
                   isl-backend/server_stdout.log  (UD: deleted by them)
```

`UD` means unmerged, deleted by them. The local branch still tracked both
files and the running backend had modified them, while `origin/main` commit
`61b4376` ("chore: stop tracking runtime logs") deleted them.

Root cause: `.gitignore` only stops *new* files from being added. It has no
effect on files already in the index, so the ignore rule and the tracked
files contradicted each other. The live backend holding the logs open then
made every future pull/rebase touch the same two paths.

Resolution applied:

```
git rm --cached isl-backend/server_stderr.log isl-backend/server_stdout.log
```

Both files stay on disk for the running backend. They are now untracked, and
`git diff --diff-filter=U` returns nothing. No unmerged paths remain.

## 2. `.gitignore` updated for server logs

The `*.log` rule arrived from the merge. It was broadened so the same class
of file cannot come back through a side door:

```
*.log
*.log.*
isl-backend/*.log
isl-backend/logs/
logs/
*.bak
*.tmp
isl-backend/database/*.backup-*.json
isl-backend/*.backup-*.json
```

Verified with `git check-ignore -v`:

```
.gitignore:25:isl-backend/*.log   isl-backend/server_stderr.log
.gitignore:25:isl-backend/*.log   isl-backend/server_stdout.log
.gitignore:25:isl-backend/*.log   isl-backend/uvicorn.log
.gitignore:23:*.log               foo.log
```

`git ls-files | Select-String '\.log'` now returns nothing. No log file is
tracked anywhere in the repo.

Note: the `*.backup-*.json` entries match files that are currently tracked
(`isl-backend/database/recordings.backup-2026-09-25.json`,
`isl-backend/gloss_poses.backup-2026-09-25.json`). They stay tracked until
someone runs `git rm --cached` on them. That is deliberate, they were added
on the remote side in this merge and removing them is a separate decision.

## 3. Branch divergence (NOT resolved, needs a decision)

```
Your branch and 'origin/main' have diverged,
and have 1 and 3 different commits each, respectively.
```

Only side:

- `5a29b64` feat: add landing page components and LoginPage

Remote side:

- `ca60a3b` fixing trial 2
- `c7e2561` feat: open Supabase-to-file sync to all signed-in users
- `61b4376` chore: stop tracking runtime logs

The merge that was interrupted would have brought all four together.

## 4. Uncommitted work stacked on top of an uncommitted merge (RISK)

Two unrelated bodies of work now share one index:

- the merge result from `origin/main` (backend routers, Supabase sync, logs)
- the routing, hash and em dash cleanup done in this session

If `git commit` is run right now it produces a single merge commit that also
ships the frontend cleanup, and the merge becomes unrecoverable with
`git merge --abort`. Recommended order:

1. `git commit` the merge on its own, with the message already in `.git/MERGE_MSG`
2. commit the routing and em dash work separately after that

## 5. `public/login-page.png` (checked, no action needed)

`origin/main` does not have this file, and the remote `LoginPage.jsx` does
not reference it. The local `LoginPage.jsx` added it and references it at
`src="/login-page.png"`.

This merged cleanly rather than conflicting, because the file was added on
the local side only. After the merge the file is still tracked
(`git ls-files public/login-page.png`) and the reference resolves. No fix
required. Flagging it because it reads like a deletion at a glance.

## 6. Broken junctions under `.claude/skills` (local only, not a git conflict)

Every git command on this repo prints warnings such as:

```
warning: could not open directory '.claude/skills/brandkit/': No such file or directory
```

Cause: `.claude/skills/*` are 13 directory junctions pointing at a different
project on this machine:

```
C:\Users\baksi\Desktop\PROJECT\Alfredo\.agents\skills\*
```

The current project is `KAVACHAI`, so the targets are stale. `.claude` is
not tracked by git, so this never affects a push. It only adds noise to every
git command. The live copies under `.agents/skills/` are real files and work
fine. Fix is to re-point or delete the junctions, or add `.claude/` to
`.gitignore`.

## 7. Auth callback was landing tokens in the URL hash (FIXED, needs a dashboard step)

Symptom: after clicking a magic link the address bar showed

```
http://127.0.0.1:5201/#access_token=...&refresh_token=...&provider_token=...
```

and the user sat on the public landing page rather than being routed into the
app.

Two independent causes:

1. `createClient` used the default implicit flow, which answers with the
   session itself in the URL fragment. The fragment was left in the address
   bar and in browser history.
2. `signInWithOtp` and `signInWithOAuth` both sent
   `redirectTo: window.location.origin`, so the callback landed on `/`, the
   public landing page, instead of anywhere in the auth flow.

Fix applied:

- `flowType: "pkce"` on the client. The callback now arrives as a single use
  `?code=`, never `#access_token=`.
- `detectSessionInUrl: false`, because the callback route owns the exchange
  explicitly and clears the query string itself.
- New route `/auth/callback` (`src/pages/AuthCallbackPage.jsx`) exchanges the
  code via `exchangeCodeForSession`, then `replace`s the URL with the studio.
  On failure it replaces to `/login?error=...` with copy mapped from the
  Supabase error code.
- Both providers now redirect to `/auth/callback`.
- `RequireAuth` records the blocked page in `sessionStorage`, so after
  signing in the user returns to where they were going, not always
  `/interpret`.

REQUIRED, one time, in the Supabase dashboard:

```
Authentication > URL Configuration > Redirect URLs
```

Add `/auth/callback` under each origin in use, for example:

```
http://127.0.0.1:5201/auth/callback
http://localhost:5173/auth/callback
https://<your deployed domain>/auth/callback
```

Supabase rejects a `redirectTo` that is not on that list, so magic links will
fail with `access_denied` until the entry exists. The path must be the full
URL including the origin, not a bare path.

Note on security: a live `access_token`, `refresh_token` and Google
`provider_token` were pasted into chat while diagnosing this. They were valid
at the time. The account should be signed out and the Google session revoked.

## 8. Duplicate `public/white_mesh (2).glb` and stray spaced filenames (NOT touched)

`public/` contains `white-mesh.glb` and `white_mesh (2).glb` side by side, and
the `Filmstrip` folder has filenames with a literal `...g…_2026...` from a
truncated name. Both are committed and referenced ambiguously. Flagged only,
nothing was changed.

## 9. Em dash audit scope

Removed from shipped app source: 173 occurrences across 39 files in `src/`,
plus `signspeak-landing/index.html`. 29 were user facing copy or runtime error
messages and were rewritten with real punctuation rather than substituted.
The other 144 were source comments and CSS notes, which became a plain
hyphen.

Deliberately left alone:

- `PRD/*.md` (16 files, 218 occurrences) are internal design documents
- `agent/skills/*/SKILL.md` (10 files, 152 occurrences) are third party skill
  definitions
- `signspeak-landing/dist/**` is build output, regenerated by a build
- `isl-backend/*.log` is now untracked
