import json, math

FACE_CENTER = [0.0, 1.50, -0.08]
FACE_RADIUS = 0.08
SOFT = FACE_RADIUS * 1.5

def closest_on_segment(A, B, P):
    AB = [B[i] - A[i] for i in range(3)]
    AP = [P[i] - A[i] for i in range(3)]
    ab2 = sum(v * v for v in AB)
    if ab2 == 0:
        return A
    t = max(0.0, min(1.0, sum(AP[i] * AB[i] for i in range(3)) / ab2))
    return [A[i] + t * AB[i] for i in range(3)]

def dist(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))

g = json.load(open("isl-backend/gloss_poses.json"))

for sign in g:
    frames = g[sign]
    worst = 0.0
    pushed = 0
    total = 0
    for f in frames:
        b = f["body"]
        for side, elbow, wrist in (("L", b["left_elbow"], b["left_wrist"]),
                                   ("R", b["right_elbow"], b["right_wrist"])):
            c = closest_on_segment(elbow, wrist, FACE_CENTER)
            d = dist(c, FACE_CENTER)
            worst = max(worst, d)
            total += 1
            if d < SOFT:
                pushed += 1
    print(f"{sign:8s} frames={len(frames):3d}  closest elbow-wrist->face = {worst:.4f} m")
    print(f"{'':8s} soft_radius={SOFT:.3f}  frames inside soft zone = {pushed}/{total}")

# hand separation actually stored
for sign in ("A", "HELLO"):
    if sign in g:
        f = g[sign][0]
        l = f["body"]["left_wrist"]; r = f["body"]["right_wrist"]
        print(f"\n{sign} stored wrist separation = {dist(l, r):.4f} m")
        for name in ("left_hand", "right_hand"):
            if f.get(name):
                xs = [p[0] for p in f[name]]
                print(f"   {name} x range {min(xs):.3f} .. {max(xs):.3f}")
