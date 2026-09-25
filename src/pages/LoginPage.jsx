import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { takeReturnTo, useAuth } from "../hooks/useAuth";

/*
 * LOGIN - reference-style split card, monochrome edition.
 * Left: form (email magic link as primary "Sign in" + Google).
 * Right: full-bleed artwork panel. Black surfaces, white type, no color.
 * Auth system is passwordless, so the password row from the reference is
 * replaced by an honest microcopy row, and everything on screen is real.
 */
export function LoginPage() {
  const { user, isLoading, supabaseReady, signInWithGoogle, signInWithEmailLink } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  // Reason the callback route bounced here, if it did. Cleared on the next
  // attempt so a stale message never sits under a fresh form.
  const [error, setError] = useState(() => searchParams.get("error") || "");

  // React Router tracks its own depth in history.state.idx. A positive index
  // means the user arrived here from somewhere in this app, so Back is real.
  useEffect(() => {
    setCanGoBack((window.history.state?.idx ?? 0) > 0);
  }, []);

  // Drop ?error= from the URL once it has been read, so a refresh does not
  // replay the message and Back does not return to it.
  useEffect(() => {
    if (!searchParams.has("error")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isLoading && user) navigate(takeReturnTo(), { replace: true });
  }, [user, isLoading, navigate]);

  function handleBack() {
    if (canGoBack) {
      navigate(-1);
      return;
    }
    navigate("/");
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (authError) {
      const message = authError?.message || "Google sign-in failed.";
      setError(
        /provider.*not enabled/i.test(message)
          ? "Google login is not enabled on this project yet. Use the email link below or ask the admin to enable the provider."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailLink(event) {
    event?.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Type your email first.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailLink(email);
      setLinkSent(true);
    } catch (authError) {
      setError(authError?.message || "Could not send the login link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#050506] text-neutral-100">
      {/* Monochrome ambience - soft white blooms on black */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-15%] h-[480px] w-[480px] rounded-full bg-white/[0.07] blur-[140px]" />
        <div className="absolute -right-40 bottom-[-20%] h-[520px] w-[520px] rounded-full bg-white/[0.05] blur-[150px]" />
        <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.025] blur-[120px]" />
      </div>

      <div className="relative grid w-full min-h-dvh md:grid-cols-2">
        {/* Form side */}
        <section aria-labelledby="login-title" className="flex flex-col justify-center px-6 py-12 sm:px-12 md:px-16 lg:px-24">
          <div className="w-full max-w-md">
          <button
            type="button"
            onClick={handleBack}
            className="group inline-flex items-center gap-2 rounded-lg py-1 pr-3 text-[12.5px] font-medium text-neutral-400 transition-colors duration-200 hover:text-white"
          >
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5"
            >
              ←
            </span>
            {canGoBack ? "Back" : "Back to home"}
          </button>

          <div className="mt-6 flex items-center gap-2.5">
            <img
              src="/logo-nav.png"
              alt=""
              width="30"
              height="30"
              draggable={false}
              className="block h-[30px] w-[30px] border-0 bg-transparent outline-none"
            />
            <span className="text-[14px] font-semibold tracking-tight text-neutral-100">SignSpeak</span>
          </div>

          <h1 id="login-title" className="mt-7 text-4xl font-semibold tracking-tight text-white md:text-[2.75rem] md:leading-[1.05]">
            Welcome back
          </h1>
          <p className="mt-2.5 text-[14px] text-neutral-400">
            Continue with one of the following options
          </p>

          {linkSent ? (
            <div className="mt-8 rounded-2xl border border-white/20 bg-white/[0.04] p-6" role="status">
              <p className="text-[15px] font-semibold text-white">Check your inbox</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-400">
                A secure sign-in link is on its way to{" "}
                <span className="text-neutral-100">{email.trim()}</span>. Open it on this
                device to enter the studio.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLinkSent(false);
                  setError("");
                }}
                className="mt-4 text-[13px] font-semibold text-white underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailLink} className="mt-8">
              <label htmlFor="login-email" className="text-[12.5px] font-semibold text-neutral-200">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email Address"
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-3.5 text-[14px] text-white placeholder:text-neutral-600 outline-none transition-colors duration-200 focus:border-white/40 focus:bg-white/[0.06]"
              />

              <div className="mt-3.5 flex items-center justify-between text-[12.5px]">
                <span className="text-neutral-500">Passwordless sign-in</span>
                <span className="font-semibold text-neutral-200">No password needed</span>
              </div>

              <button
                type="submit"
                disabled={!supabaseReady || busy}
                className="mt-5 w-full rounded-xl bg-white py-3.5 text-[14.5px] font-semibold text-black transition-all duration-200 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Sending…" : "Sign in"}
              </button>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={!supabaseReady || busy}
                className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.14] bg-transparent py-3.5 text-[14px] font-medium text-neutral-200 transition-colors duration-200 hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" className="block h-[18px] w-[18px]">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {busy ? "Authenticating…" : "Continue with Google"}
              </button>
            </form>
          )}

          {error && (
            <p className="mt-5 rounded-xl border border-white/20 bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-neutral-200" role="alert">
              {error}
            </p>
          )}
          {!supabaseReady && (
            <p className="mt-5 rounded-xl border border-white/20 bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-neutral-200">
              Supabase environment variables are missing. Set VITE_SUPABASE_URL and
              VITE_SUPABASE_ANON_KEY in .env.local, then reload.
            </p>
          )}

          <p className="mt-8 text-center text-[12.5px] text-neutral-500">
            Protected by your studio account.{" "}
            <span className="font-semibold text-neutral-300">Recordings stay yours.</span>
          </p>
          </div>
        </section>

        {/* Visual side */}
        <aside aria-hidden="true" className="relative min-h-[340px] border-t border-white/10 md:min-h-0 md:border-l md:border-t-0">
          <img
            src="/login-page.png"
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full border-0 object-cover outline-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
          {/* Seam melt - blur + fade the hard edge where the artwork meets the page */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#050506] via-[#050506]/55 to-transparent md:w-44" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-24 backdrop-blur-md [mask-image:linear-gradient(to_right,black_20%,transparent_95%)] [-webkit-mask-image:linear-gradient(to_right,black_20%,transparent_95%)]" />
        </aside>
      </div>
    </div>
  );
}
