import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { takeReturnTo, useAuth } from "../hooks/useAuth";

/*
 * AUTH CALLBACK - the landing pad for magic links and Google OAuth.
 *
 * Supabase sends the user here with a single use "?code=..." in the query
 * string. This page swaps that code for a session, then replaces the URL with
 * the studio, so the code exists for a few hundred milliseconds and is never
 * left in the address bar, in history, or in a referrer header.
 *
 * It never renders a form. Success and failure both leave via replace, so
 * pressing Back does not bounce the user into a dead callback.
 */
export function AuthCallbackPage() {
  const { completeAuthCallback } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function run() {
      let result;
      try {
        result = await completeAuthCallback();
      } catch {
        result = { ok: false, error: "Sign-in could not be completed. Request a new link and try again." };
      }
      if (!active) return;

      if (result.ok) {
        navigate(takeReturnTo(), { replace: true });
        return;
      }
      setFailed(true);
      navigate(`/login?error=${encodeURIComponent(result.error)}`, { replace: true });
    }

    run();
    return () => {
      active = false;
    };
  }, [completeAuthCallback, navigate]);

  return (
    <div className="ss-route-loader" role="status" aria-live="polite">
      <img
        src="/logo-nav.png"
        alt=""
        width="44"
        height="44"
        draggable={false}
        className="ss-route-loader__logo"
      />
      <span className="ss-route-loader__word">
        {failed ? "Returning to sign in" : "Signing you in"}
      </span>
      {!failed && (
        <span className="ss-route-loader__bar" aria-hidden="true">
          <span />
        </span>
      )}
    </div>
  );
}
