# PRD 06 — Vercel Connection: alfredo-seven.vercel.app + Localhost Backend

> Date: 2026-09-24
> Live endpoints verified this turn: Vercel `200`, backend `/` `200`, `/api/db/recordings` `200` (2 file rows).
> Status: connected. One redeploy + Google provider remain owner-side.

## 1. What "connected" means in this architecture

- The Vercel frontend is a static build; the FastAPI backend stays on the owner's laptop
  (`127.0.0.1:8000`, CORS `*`, verified healthy). On the owner's machine the Vercel page
  reaches `http://localhost:8000` directly (loopback is exempt from mixed-content blocking),
  so Record/Interpret/Translate all work there end to end.
- Supabase Auth now points at the hosted frontend (set via Management API this turn):
  `site_url=https://alfredo-seven.vercel.app`,
  `uri_allow_list=https://alfredo-seven.vercel.app/**,http://localhost:5173/**,http://localhost:3000/**`.
  Verified by re-GET. Google OAuth return trips and magic-link URLs now land on Vercel.
- Data path per visitor: browser → Supabase (Main/User recordings, RLS) + browser →
  localhost backend (media/AI/file DB, same-machine only). Dual-write (PRD 05) keeps the
  GitHub-tracked file and Supabase Main identical for admin publishes.

## 2. Owner actions left (Vercel dashboard, ~5 min)

1. Vercel → project → Settings → Environment Variables, set:
   `VITE_SUPABASE_URL=https://qyvwtfpeaokmdqpuqegx.supabase.co`,
   `VITE_SUPABASE_ANON_KEY=<anon key>`,
   `VITE_API_URL=http://localhost:8000/api/db`,
   `VITE_API_BASE=http://localhost:8000`,
   `VITE_WS_URL=ws://localhost:8000/ws/stream`.
   Without these the deployed build silently runs in legacy-localhost mode (no cloud).
2. **Redeploy** after saving vars (env is baked at build time — editing vars alone changes nothing).
3. Supabase → Authentication → Providers → Google → enable with Google Cloud client ID/secret
   (still `external_google_enabled=false` at last check; cannot be done without those credentials).
4. Keep the laptop backend running while using the Vercel site; other visitors get
   Record/Interpret/Delete via Supabase, Translate/media needs a reachable backend (future Render step).

## 3. Files of record

- Auth config change: live project config (no repo file; values above).
- This report: `PRD/06-vercel-connection.md`.
- Code: no changes required this turn (CORS already `*`, env-driven URLs already shipped).
