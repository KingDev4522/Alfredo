import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { AUTH_CALLBACK_PATH, authCallbackUrl } from "../lib/routes";

  const AuthContext = createContext({
  user: null,
  profile: null,
  isAdmin: false,
  isLoading: true,
  supabaseReady: isSupabaseConfigured,
  signInWithGoogle: async () => {},
  signInWithEmailLink: async () => {},
  completeAuthCallback: async () => ({ ok: false, error: "Auth is not configured." }),
  signOut: async () => {},
});

const RETURN_TO_KEY = "sss:auth-return-to";

/* Only same-origin absolute paths, so a crafted value cannot bounce anyone off site. */
function isSafeReturnTo(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/* Remembers the page the user was trying to reach before the auth wall. */
export function rememberReturnTo(pathname) {
  if (!isSafeReturnTo(pathname)) return;
  if (pathname === "/login" || pathname === AUTH_CALLBACK_PATH) return;
  if (pathname.startsWith("/auth/")) return;
  try {
    sessionStorage.setItem(RETURN_TO_KEY, pathname);
  } catch {
    /* private mode, no storage, harmless */
  }
}

export function takeReturnTo(fallback = "/interpret") {
  try {
    const stored = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return isSafeReturnTo(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

/* Turns Supabase error codes into copy a person can act on. */
function describeAuthError(code, description) {
  const map = {
    otp_expired: "That sign-in link has expired. Request a new one below.",
    access_denied: "That sign-in link was declined or already used. Request a new one below.",
    otp_disabled: "Email sign-in is switched off for this project.",
    verification_required: "Email confirmations are required before signing in.",
    invalid_code: "That sign-in link is no longer valid. Request a new one below.",
    user_already_exists: "An account already exists for that email. Sign in instead.",
  };
  if (map[code]) return map[code];
  if (description) return description.replace(/\+/g, " ");
  return "Sign-in could not be completed. Request a new link and try again.";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }
    let mounted = true;
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await ensureProfile(data.session.user);
      }
      setIsLoading(false);
    }
    init();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        await ensureProfile(session.user);
      } else {
        setProfile(null);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function ensureProfile(authUser) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, is_admin")
        .eq("id", authUser.id)
        .maybeSingle();
      if (data) {
        setProfile(data);
        return;
      }
      const { data: inserted } = await supabase
        .from("profiles")
        .insert({ id: authUser.id, email: authUser.email, is_admin: false })
        .select()
        .maybeSingle();
      if (inserted) setProfile(inserted);
    } catch {
      setProfile(null);
    }
  }

  async function signInWithGoogle() {
    if (!supabase) throw new Error("Supabase is not configured.");
    rememberReturnTo(window.location.pathname);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl() },
    });
    if (error) throw error;
  }

  // Passwordless fallback: works with zero provider setup (email provider is on).
  async function signInWithEmailLink(email) {
    if (!supabase) throw new Error("Supabase is not configured.");
    rememberReturnTo(window.location.pathname);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl() },
    });
    if (error) throw error;
  }

  /*
   * Runs on the callback route. Swaps the one time "?code=" for a real
   * session, then wipes the query string so nothing usable is left in the
   * address bar or in browser history. Never throws, the caller gets a result.
   */
  const completeAuthCallback = useCallback(async () => {
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorCode = params.get("error_code") || params.get("error");
    const errorDescription = params.get("error_description");

    // Strip first, so a failure cannot leave the code sitting in the URL.
    window.history.replaceState(null, "", window.location.pathname);

    if (errorCode) return { ok: false, error: describeAuthError(errorCode, errorDescription) };
    if (!code) {
      return { ok: false, error: "That sign-in link is missing its code. Request a new one below." };
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, error: describeAuthError(error?.code, error?.message) };
    return { ok: true };
  }, []);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin: profile?.is_admin === true,
        isLoading,
        supabaseReady: isSupabaseConfigured,
        signInWithGoogle,
        signInWithEmailLink,
        completeAuthCallback,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
