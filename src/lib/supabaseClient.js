import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Null when env not configured (localhost dev before keys are pasted).
// All storage/auth layers fall back to the legacy FastAPI backend in that case.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/*
 * flowType "pkce" is the reason no token ever lands in the URL.
 *
 * The default implicit flow answers a magic link with
 * "/#access_token=...&refresh_token=...&provider_token=...", so a real session
 * token sits in the address bar and in browser history. PKCE answers with
 * "/auth/callback?code=..." instead: a single use, short lived code that is
 * swapped for the session in memory and never written anywhere visible.
 *
 * detectSessionInUrl is off because the callback route owns the exchange
 * explicitly (see useAuth.completeAuthCallback) and clears the query string
 * itself, which also stops the router from ever seeing a hash.
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      flowType: "pkce",
      detectSessionInUrl: false,
    })
  : null;

// Backend base URLs - env-driven, no more hardcoded localhost in components.
export const API_DB_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/db";
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";
export const WS_URL =
  import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/stream";
