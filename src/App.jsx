import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { ScrollToTop } from "./components/ScrollToTop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./hooks/useAuth";
import Nav from "./landing/components/Nav.jsx";
import { AUTH_CALLBACK_PATH, LANDING_SECTIONS, ROUTE_ALIASES, isStudioPath, normalizePath } from "./lib/routes";
import "./landing/landing.css";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const AuthCallbackPage = lazy(() =>
  import("./pages/AuthCallbackPage").then((module) => ({ default: module.AuthCallbackPage })),
);
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })),
);
const InterpretPage = lazy(() =>
  import("./pages/InterpretPage").then((module) => ({ default: module.InterpretPage })),
);
const TranslatePage = lazy(() =>
  import("./pages/TranslatePage").then((module) => ({ default: module.TranslatePage })),
);
const RecordPage = lazy(() =>
  import("./pages/RecordPage").then((module) => ({ default: module.RecordPage })),
);
const DeletePage = lazy(() =>
  import("./pages/DeletePage").then((module) => ({ default: module.DeletePage })),
);

function RouteFallback() {
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
      <span className="ss-route-loader__word">Loading SignSpeak</span>
      <span className="ss-route-loader__bar" aria-hidden="true">
        <span />
      </span>
    </div>
  );
}

/*
 * Keeps the URL canonical before any route matches: "/interpret/" and
 * "//interpret" both settle on "/interpret" without leaving a broken history
 * entry. Rendered as a redirect, so it never leaves a frame of wrong content.
 */
function PathNormalizer() {
  const { pathname } = useLocation();
  const canonical = normalizePath(pathname);
  if (canonical === pathname) return null;
  return <Navigate to={canonical} replace />;
}

/*
 * Skip link without a hash. Focus is moved to the main landmark instead of
 * following "#main-content", so no fragment ever enters the URL.
 */
function SkipToContent() {
  return (
    <button
      type="button"
      className="ss-skip-link"
      onClick={() => {
        const main = document.getElementById("main-content");
        if (!main) return;
        main.focus({ preventScroll: true });
        main.scrollIntoView({ block: "start" });
      }}
    >
      Skip to content
    </button>
  );
}

function App() {
  const location = useLocation();
  // Landing (/) renders Nav inside LandingPage. Studio routes render it here
  // so the header stays available on every authenticated page.
  const showStudioNav = isStudioPath(location.pathname);

  return (
    <AuthProvider>
      <PathNormalizer />
      <div className="ss-app-shell">
        <SkipToContent />
        <ScrollToTop />
        {showStudioNav && <Nav />}
        <main
          id="main-content"
          tabIndex={-1}
          className={`ss-app-main${showStudioNav ? " ss-app-main--studio" : ""}`}
        >
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public landing page. Every section below is a real,
                    shareable path that renders this same page and scrolls
                    to its anchor once mounted. */}
                <Route path="/" element={<LandingPage />} />
                {LANDING_SECTIONS.map((section) => (
                  <Route key={section.path} path={section.path} element={<LandingPage />} />
                ))}

                {/* Auth */}
                <Route path="/login" element={<LoginPage />} />
                <Route path={AUTH_CALLBACK_PATH} element={<AuthCallbackPage />} />
                <Route path="/logout" element={<Navigate to="/" replace />} />

                {/* Legacy paths, redirected to their canonical route. */}
                {ROUTE_ALIASES.map((alias) => (
                  <Route key={alias.from} path={alias.from} element={<Navigate to={alias.to} replace />} />
                ))}

                {/* Auth-protected studio */}
                <Route
                  path="/interpret"
                  element={
                    <RequireAuth>
                      <InterpretPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/translate"
                  element={
                    <RequireAuth>
                      <TranslatePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/record"
                  element={
                    <RequireAuth>
                      <RecordPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/delete"
                  element={
                    <RequireAuth>
                      <DeletePage />
                    </RequireAuth>
                  }
                />

                {/* Unknown path falls back to the landing page. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
