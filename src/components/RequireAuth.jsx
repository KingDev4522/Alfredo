import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { rememberReturnTo, useAuth } from "../hooks/useAuth";

// PRD 02 v2 §2+§3: whole site is login-gated. Logged-out users only see /login.
// Dev escape hatch: when Supabase env is missing (before keys are pasted),
// allow through so localhost still works.
export function RequireAuth({ children }) {
  const { user, isLoading, supabaseReady } = useAuth();
  const location = useLocation();

  // Hold on to the protected page so sign-in can hand the user straight back
  // to it instead of always dropping them on the studio default.
  useEffect(() => {
    if (!user && !isLoading) rememberReturnTo(location.pathname);
  }, [user, isLoading, location.pathname]);

  if (isLoading) {
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
        <span>Checking session</span>
      </div>
    );
  }
  if (!supabaseReady) return children;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
