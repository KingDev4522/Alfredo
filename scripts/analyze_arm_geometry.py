import json, math

recs = json.load(open("isl-backend/database/recordings.json"))
a = [r for r in recs if r["signId"] == "a"][0]
f = a["frames"][0]
b = f["body"]

def d(p, q):
    return math.dist(p, q)

# ---- current backend transform ----
def to_model(point, is_hand=False, wrist_z=None):
    if not point:
        return [0.0, 0.0, 0.0]
    x = point.get("x", 0.0) if isinstance(point, dict) else float(point[0])
    y = point.get("y", 0.0) if isinstance(point, dict) else float(point[1])
    z = point.get("z", 0.0) if isinstance(point, dict) else float(point[2])
    mx = x * 0.2845
    my = 1.3351 + (-y) * 0.2845
    mz = wrist_z + (-z) * 0.2845 if (is_hand and wrist_z is not None) else -0.0439 + (-z) * 0.2
    return [mx, my, mz]

ls = to_model(b["left_shoulder"]); le = to_model(b["left_elbow"]); lw = to_model(b["left_wrist"])
rs = to_model(b["right_shoulder"]); re = to_model(b["right_elbow"]); rw = to_model(b["right_wrist"])

print("=== CURRENT transform (x,y scale 0.2845 | z scale 0.2) ===")
print("left  shoulder", [round(v, 3) for v in ls])
print("left  elbow   ", [round(v, 3) for v in le])
print("left  wrist   ", [round(v, 3) for v in lw])
print("upper arm len  = %.3f m   (human ~0.30)" % d(ls, le))
print("forearm len    = %.3f m   (human ~0.26)" % d(le, lw))
print("shoulder->wrist= %.3f m   (human max ~0.56)" % d(ls, lw))
print("wrist gap      = %.3f m" % d(lw, rw))
print()

# ---- raw normalized magnitudes ----
print("=== raw normalized body values (shoulder-width units) ===")
for k in ["left_shoulder", "left_elbow", "left_wrist", "right_wrist"]:
    print(" ", k, b[k])
print()

# ---- sweep z scale to find anatomically sane arm lengths ----
print("=== sweep body-z scale ===")
print(" zscale  upper   fore   sh->wr  wrgap")
for zs in [0.0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.2]:
    def tm(p):
        return [p["x"] * 0.2845, 1.3351 + (-p["y"]) * 0.2845, -0.0439 + (-p["z"]) * zs]
    a1, a2, a3 = tm(b["left_shoulder"]), tm(b["left_elbow"]), tm(b["left_wrist"])
    a4 = tm(b["right_wrist"])
    print("  %.2f   %.3f  %.3f  %.3f  %.3f" % (zs, d(a1, a2), d(a2, a3), d(a1, a3), d(a3, a4)))
