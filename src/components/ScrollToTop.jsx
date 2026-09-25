import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Multi-page routing doesn't reset scroll position on its own — without
// this, navigating Record -> Home would land you mid-page instead of
// at the top.
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
