"""Simulate Avatar.jsx arm rendering on the REAL gloss data + REAL model geometry.

Proves/disproves the two hypotheses:
  H1 (gap above head): current FK uses recorded shoulder->elbow->wrist DIRECTIONS
      with the model's FIXED bone lengths, so the wrist never lands where recorded.
  H2 (overlap at chest): the X-only palm closure in database.py pushes hands
      together even when the sign keeps them apart.

Model geometry from scripts/extract_arm_geometry.mjs (three.js, real GLB):
  shoulders x=+-0.29678 y=2.78534 z=-0.09150, upper=0.53592, fore=0.50282
Gloss data space: shoulders at x=+-0.143 (width 0.2845), y≈1.335.
So data must be RESCALED to model space before comparing.
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLOSS = os.path.join(ROOT, "isl-backend", "gloss_poses.json")

# ---- real model constants (from extract_arm_geometry.mjs output) ----
S_L = [0.2967811181387785, 2.7853404292262383, -0.09149783701347712]
S_R = [-0.29678040893213425, 2.7853416166750407, -0.09149760500427918]
UPPER = 0.5359209415419722
FORE = 0.5028247901796065
REACH = UPPER + FORE

# data-space shoulder anchors for rescaling (mirror of to_model_space)
DATA_S_L = [0.143416, 1.328699, 0.0]
DATA_S_R = [-0.141311, 1.340762, 0.0]

def dist(a, b):
    return math.dist(a, b)

def rescale_frame_to_model(body):
    """Map gloss data frame to model space: translate data shoulders -> model
    shoulders, scale by shoulder-width ratio. Z uses the same scale (uniform)."""
    scale = dist(S_L, S_R) / dist(DATA_S_L, DATA_S_R)
    # use per-side anchor: translate so data shoulder -> model shoulder
    out = {}
    for side, data_s, model_s in (("left", DATA_S_L, S_L), ("right", DATA_S_R, S_R)):
        for joint in ("shoulder", "elbow", "wrist"):
            p = body[f"{side}_{joint}"]
            out[f"{side}_{joint}"] = [
                model_s[0] + (p[0] - data_s[0]) * scale,
                model_s[1] + (p[1] - data_s[1]) * scale,
                model_s[2] + (p[2] - data_s[2]) * scale,
            ]
    return out

def current_fk(S, E, W):
    """Avatar.jsx current: elbow at S + UPPER*u, wrist at elbow + FORE*v
    where u,v are recorded DIRECTIONS (normalized). Positions ignored."""
    u = [(E[i] - S[i]) for i in range(3)]
    lu = math.sqrt(sum(x * x for x in u)) or 1e-9
    elbow = [S[i] + u[i] / lu * UPPER for i in range(3)]
    v = [(W[i] - E[i]) for i in range(3)]
    lv = math.sqrt(sum(x * x for x in v)) or 1e-9
    wrist = [elbow[i] + v[i] / lv * FORE for i in range(3)]
    return elbow, wrist

def ik(S, E, W, pole_hint=None):
    """2-bone IK: wrist lands exactly on W (clamped to reach). Elbow solved
    off the shoulder->wrist axis with pole vector from the recorded elbow."""
    sw = [W[i] - S[i] for i in range(3)]
    d = math.sqrt(sum(x * x for x in sw)) or 1e-9
    dc = max(abs(UPPER - FORE) + 0.01, min(REACH - 0.01, d))
    dirsw = [sw[i] / d for i in range(3)]
    a = (UPPER * UPPER - FORE * FORE + dc * dc) / (2 * dc)
    h = math.sqrt(max(0.0, UPPER * UPPER - a * a))
    # pole: perpendicular component of recorded elbow dir
    pole = [E[i] - S[i] for i in range(3)]
    pd = sum(pole[i] * dirsw[i] for i in range(3))
    pole = [pole[i] - pd * dirsw[i] for i in range(3)]
    pl = math.sqrt(sum(x * x for x in pole))
    if pl < 1e-6:
        pole = [0.0, -1.0, 0.0]
        pl = 1.0
    pole = [pole[i] / pl for i in range(3)]
    elbow = [S[i] + dirsw[i] * a + pole[i] * h for i in range(3)]
    wrist = [S[i] + dirsw[i] * dc for i in range(3)]
    return elbow, wrist

with open(GLOSS) as f:
    gloss = json.load(f)

print(f"model reach={REACH:.3f}  shoulder width={dist(S_L,S_R):.3f}")
for sign in sorted(gloss.keys()):
    frames = gloss[sign]
    mid = frames[len(frames) // 2]
    b_model = rescale_frame_to_model(mid["body"])
    errs_fk, errs_ik, gaps_rec, gaps_fk, gaps_ik = [], [], [], [], []
    for fr in frames:
        bm = rescale_frame_to_model(fr["body"])
        LW, RW = bm["left_wrist"], bm["right_wrist"]
        LE, RE = bm["left_elbow"], bm["right_elbow"]
        gaps_rec.append(dist(LW, RW))
        _, lw_fk = current_fk(S_L, LE, LW)
        _, rw_fk = current_fk(S_R, RE, RW)
        gaps_fk.append(dist(lw_fk, rw_fk))
        errs_fk.append(dist(lw_fk, LW) + dist(rw_fk, RW))
        _, lw_ik = ik(S_L, LE, LW)
        _, rw_ik = ik(S_R, RE, RW)
        gaps_ik.append(dist(lw_ik, rw_ik))
        errs_ik.append(dist(lw_ik, LW) + dist(rw_ik, RW))
    mean = lambda xs: sum(xs) / len(xs)
    # data-space info
    b = mid["body"]
    lw_data = b["left_wrist"]
    print(f"\n== {sign} ({len(frames)} frames) data wrist: ({lw_data[0]:.3f},{lw_data[1]:.3f},{lw_data[2]:.3f})")
    print(f"   recorded wrist gap (data)      : {dist(b['left_wrist'], b['right_wrist']):.3f}  palm-edge X: "
          f"{min(p[0] for p in mid['left_hand']) - max(p[0] for p in mid['right_hand']):.3f}")
    print(f"   model-space wrist gap recorded : {mean(gaps_rec):.3f}")
    print(f"   model-space gap CURRENT FK     : {mean(gaps_fk):.3f}   <- what you SEE")
    print(f"   model-space gap with IK        : {mean(gaps_ik):.3f}   <- what you SHOULD see")
    print(f"   wrist pos error current FK     : {mean(errs_fk):.3f} m")
    print(f"   wrist pos error with IK        : {mean(errs_ik):.3f} m")
