/*
 * Single source of truth for every route in the app.
 *
 * Rules the whole app follows:
 * 1. Clean, absolute paths only ("/interpret"). No "#/route" hash routing.
 * 2. No hash fragments in the URL. Landing sections get their own real
 *    routes ("/engine") and are resolved to a DOM id on arrival.
 * 3. Exactly one trailing slash, and only on "/" itself. Anything else
 *    is normalized and redirected before the router matches it.
 * 4. Every link in the UI is built from these lists, so a route can never
 *    point at a page that does not exist.
 */

/* Collapses duplicate slashes and strips a trailing slash, keeping "/". */
export function normalizePath(pathname) {
  if (typeof pathname !== "string" || pathname === "") return "/";
  const collapsed = `/${pathname}`.replace(/\/{2,}/g, "/");
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
  return trimmed === "" ? "/" : trimmed;
}

/* Auth-protected studio pages, in nav order. */
export const STUDIO_ROUTES = [
  { path: "/interpret", label: "Interpret" },
  { path: "/translate", label: "Translate" },
  { path: "/record", label: "Record" },
  { path: "/delete", label: "Review" },
];

const STUDIO_PATHS = STUDIO_ROUTES.map((route) => route.path);

export function isStudioPath(pathname) {
  return STUDIO_PATHS.includes(normalizePath(pathname));
}

/*
 * Landing page sections promoted to real routes. Each entry is a URL you can
 * share, bookmark and refresh; `id` is the in-page anchor the landing page
 * scrolls to once the section is mounted.
 */
export const LANDING_SECTIONS = [
  { path: "/how", label: "How it works", id: "how" },
  { path: "/pipeline", label: "Pipeline", id: "pipeline" },
  { path: "/engine", label: "Engine", id: "engine" },
  { path: "/showcase", label: "Field frames", id: "showcase" },
  { path: "/get-started", label: "Get started", id: "translation" },
];

const SECTION_BY_PATH = new Map(LANDING_SECTIONS.map((section) => [section.path, section]));

/* Returns the DOM id a landing route should scroll to, or null for "/". */
export function sectionIdForPath(pathname) {
  return SECTION_BY_PATH.get(normalizePath(pathname))?.id ?? null;
}

/*
 * Old paths that must keep working. Each one redirects to its canonical
 * replacement so a shared link never dead-ends.
 */
export const ROUTE_ALIASES = [
  { from: "/home", to: "/" },
  { from: "/index", to: "/" },
  { from: "/landing", to: "/" },
  { from: "/review", to: "/delete" },
  { from: "/signup", to: "/login" },
  { from: "/signin", to: "/login" },
  { from: "/auth/login", to: "/login" },
];

/*
 * Where Supabase sends the user back after a magic link or Google OAuth. Both
 * providers answer with "?code=...", which this route exchanges for a session
 * and then replaces with the studio, so the code never survives in the URL.
 * Must be listed in the Supabase dashboard under Authentication > URL
 * Configuration > Redirect URLs, alongside each deployed origin.
 */
export const AUTH_CALLBACK_PATH = "/auth/callback";

export function authCallbackUrl() {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}
