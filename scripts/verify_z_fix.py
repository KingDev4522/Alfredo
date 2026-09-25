import json, math

recs = json.load(open("isl-backend/database/recordings.json"))
a = [r for r in recs if r["signId"] == "a"][0]
frames = a["frames"]

S = 0.2845          # shoulder-width -> metres (matches avatar shoulder span)
Z_CLAMP = 1.2        # normalised z beyond this is MediaPipe noise

def d(p, q):
    return math.dist(p, q)

def tm(p, zscale, clamp):
    z = p["z"]
    if clamp:
        z = max(-Z_CLAMP, min(Z_CLAMP, z))
    return [p["x"] * S, 1.3351 + (-p["y"]) * S, -0.0439 + (-z) * zscale]

def stats(zscale, clamp, label):
    uppers, fores, gaps = [], [], []
    for f in frames:
        b = f["body"]
        ls, le, lw = tm(b["left_shoulder"], zscale, clamp), tm(b["left_elbow"], zscale, clamp), tm(b["left_wrist"], zscale, clamp)
        rs, re_, rw = tm(b["right_shoulder"], zscale, clamp), tm(b["right_elbow"], zscale, clamp), tm(b["right_wrist"], zscale, clamp)
        uppers += [d(ls, le), d(rs, re_)]
        fores += [d(le, lw), d(re_, rw)]
        gaps.append(d(lw, rw))
    print("%-34s upper %.3f  fore %.3f  wrist-gap %.3f" % (
        label, sum(uppers)/len(uppers), sum(fores)/len(fores), sum(gaps)/len(gaps)))

print("target: upper ~0.30 m, fore ~0.26 m, wrist-gap small when palms meet\n")
stats(0.2, False, "CURRENT (zscale 0.2, no clamp)")
stats(0.2845, True, "zscale 0.2845 + clamp 1.2")
stats(0.15, True, "zscale 0.15 + clamp 1.2")
stats(0.10, True, "zscale 0.10 + clamp 1.2")
stats(0.05, True, "zscale 0.05 + clamp 1.2")
stats(0.0, True, "z ignored (x/y only)")

print("\nraw z magnitudes across the recording (normalised shoulder-widths):")
zs = [abs(f["body"][k]["z"]) for f in frames for k in ("left_wrist", "right_wrist", "left_elbow", "right_elbow")]
print("  min %.2f  max %.2f  mean %.2f" % (min(zs), max(zs), sum(zs)/len(zs)))
print("  -> values this large are depth noise, not real 3-D reach")

print("\nraw x magnitudes (also suspicious):")
xs = [abs(f["body"][k]["x"]) for f in frames for k in ("left_elbow", "right_elbow")]
print("  elbow |x| min %.2f max %.2f  (>1.0 means outside the image)" % (min(xs), max(xs)))
