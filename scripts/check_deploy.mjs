const ORIGIN = "https://alfredo-seven.vercel.app";
const html = await (await fetch(ORIGIN + "/")).text();
const entry = new URL([...html.matchAll(/src="([^"]+\.js)"/g)][0][1], ORIGIN).href;
const code = await (await fetch(entry)).text();
const paths = [...new Set([...code.matchAll(/["'`](\/?assets\/[A-Za-z0-9_\-.]+\.js)["'`]/g)].map((m) => m[1]))];

let target = null;
for (const p of paths) {
  const r = await fetch(new URL(p, ORIGIN).href).catch(() => null);
  if (!r || !r.ok) continue;
  const t = await r.text();
  if (/bandFraction/.test(t)) { target = { name: p.split("/").pop(), txt: t }; break; }
}
if (!target) { console.log("dtw bundle not found"); process.exit(1); }
console.log("bundle:", target.name, target.txt.length, "bytes\n");

// The frame-distance function references the penalty constant and a comparison counter.
const idx = target.txt.indexOf("999");
console.log("literal 999 present in dtw bundle :", idx !== -1);

// Show the minified region around the hand-distance accumulation.
const m = target.txt.match(/.{0,220}(?:left_hand|left\b).{0,320}/);
if (m) console.log("\nsnippet:\n", m[0].replace(/\s+/g, " "));

// Heuristic: new code divides a total by a counter variable.
const divPattern = /([A-Za-z_$][\w$]*)\s*\/\s*([A-Za-z_$][\w$]*)\s*>\s*0\s*\?/;
console.log("\ndivide-by-counter pattern (new code):", divPattern.test(target.txt));
