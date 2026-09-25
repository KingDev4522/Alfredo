// Pure UI helper — smooth-scrolls to an in-page anchor. No app logic here.
export function scrollToId(id, offset = 64) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}
