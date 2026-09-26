import BorderGlow from "./BorderGlow";

/*
 * PanelGlow wraps BorderGlow with the palette and geometry the interpret
 * page already uses, so the effect reads as part of the page rather than
 * as a drop-in from elsewhere.
 *
 * Upstream ships purple/pink/cyan, which is not in this page's palette.
 * The colours here are the brand accent (#ffc53d), its warm neighbour
 * (#ff8f3d), and the live-state green (#34d399) — the same three the
 * panels were already using.
 *
 * The card background must stay opaque. BorderGlow.css masks the mesh
 * gradient border with a padding-box fill of var(--card-bg); make that
 * translucent and the border gradient floods the whole card interior
 * instead of just the rim. #070706 is opaque but still reads as black
 * against the page, and .gi-glow layers a gradient on top of it for the
 * surface shading.
 *
 * glowRadius is 30 rather than the default 40 because the panels sit
 * inside the rounded section with 7-8px of gutter. At 40 the outer bloom
 * of the transcript panel reached the column edge and the neighbouring
 * card lit up at the same time, which stops reading as a local response.
 */
export function PanelGlow({
  radius = 16,
  className = "",
  children,
  ...rest
}) {
  return (
    <BorderGlow
      backgroundColor="#070706"
      borderRadius={radius}
      glowColor="43 92 62"
      colors={["#ffc53d", "#ff8f3d", "#34d399"]}
      glowRadius={30}
      glowIntensity={0.9}
      edgeSensitivity={38}
      coneSpread={28}
      fillOpacity={0.42}
      className={`gi-glow ${className}`}
      {...rest}
    >
      {children}
    </BorderGlow>
  );
}
