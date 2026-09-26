import GlassSurface from "./GlassSurface";

/*
 * InterpretGlass wraps GlassSurface with the refraction tuned for the
 * interpret page instead of leaving the upstream defaults on every call
 * site.
 *
 * The defaults are tuned for a glass chip floating over a colourful
 * scene. Here the page is flat black, so the only high-contrast
 * boundary the displacement map has to work with is the surface edge
 * itself. That shifts the whole budget toward the rim:
 *
 *   borderWidth  0.16   a wide edge band, roughly a fifth of the
 *                       surface, so there is enough rim to bend
 *   brightness   34     a dimmer ramp, which widens the visible
 *                       refraction instead of crushing it
 *   opacity      0.85   lets the ramp gradient stay soft
 *   blur          7     upstream 11 over-smooths a black page
 *   displace      1.1   a touch of soften; 0 leaves the rim brittle
 *   distortion    -120  a third of upstream, so the edge warps without
 *                       visibly wobbling
 *   saturation   1.6    lifts the fill and the rim off pure black
 *
 * Per-instance cost is real: each surface owns an SVG filter with three
 * displacement maps and a ResizeObserver, and Chromium re-runs the chain
 * when the surface repaints. Keep this on the large panels, not on every
 * button and chip.
 */
export function InterpretGlass({
  radius = 16,
  className = "",
  children,
  ...rest
}) {
  return (
    <GlassSurface
      width="100%"
      height="auto"
      borderRadius={radius}
      borderWidth={0.16}
      brightness={34}
      opacity={0.85}
      blur={7}
      displace={1.1}
      distortionScale={-120}
      redOffset={0}
      greenOffset={8}
      blueOffset={16}
      mixBlendMode="screen"
      saturation={1.6}
      backgroundOpacity={0}
      className={`gi-glass ${className}`}
      {...rest}
    >
      {children}
    </GlassSurface>
  );
}
