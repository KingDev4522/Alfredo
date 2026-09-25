"""Rebuild gloss_poses.json from Supabase main_recordings (the source of truth).

The file-based gloss DB had drifted: it held an older 'a' recording while
Supabase held the one the user actually just made. The avatar reads the file,
so it was animating the wrong take.
"""
import json, math, urllib.request, os, sys

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qyvwtfpeaokmdqpuqegx.supabase.co")
TOKEN = os.environ.get("SUPABASE_TOKEN", "")
SERVICE = os.environ.get("SUPABASE_SERVICE_KEY", "")

BODY_Z_SCALE = 0.15
BODY_Z_CLAMP = 1.2
# Face collision disabled — it was the overhead force field.
FACE_CENTER = None
FACE_RADIUS = 0.0
TARGET_PALM_GAP = 0.01
HAND_FORWARD_PUSH = 0.10


def fetch_main():
    key = SERVICE or TOKEN
    req = urllib.request.Request(
        SUPABASE_URL + "/rest/v1/main_recordings?select=sign_id,hand_count,frames,created_at",
        headers={"apikey": key, "Authorization": "Bearer " + key},
    )
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def closest_on_segment(A, B, P):
    AB = [B[i] - A[i] for i in range(3)]
    AP = [P[i] - A[i] for i in range(3)]
    ab2 = sum(v * v for v in AB)
    if ab2 == 0:
        return A
    t = max(0.0, min(1.0, sum(AP[i] * AB[i] for i in range(3)) / ab2))
    return [A[i] + t * AB[i] for i in range(3)]


def apply_capsule_collision(elbow, wrist, center=FACE_CENTER, radius=FACE_RADIUS):
    return wrist


def to_model_space(point, is_hand=False, wrist_z=None):
    if not point:
        return [0.0, 0.0, 0.0]
    if isinstance(point, dict):
        x, y, z = point.get("x", 0.0), point.get("y", 0.0), point.get("z", 0.0)
    else:
        x, y, z = float(point[0]), float(point[1]), float(point[2])
    mx = x * 0.2845
    my = 1.3351 + (-y) * 0.2845
    if is_hand and wrist_z is not None:
        mz = wrist_z + (-z) * 0.2845
    else:
        cz = max(-BODY_Z_CLAMP, min(BODY_Z_CLAMP, z))
        mz = -0.0439 + (-cz) * BODY_Z_SCALE
    return [round(mx, 6), round(my, 6), round(mz, 6)]


def convert(rec):
    out = []
    for i, frame in enumerate(rec.get("frames", [])):
        if not isinstance(frame, dict) or "body" not in frame:
            continue
        body = frame.get("body") or {}
        le = to_model_space(body.get("left_elbow")) if body.get("left_elbow") else [0.35, 1.05, 0.0]
        re_ = to_model_space(body.get("right_elbow")) if body.get("right_elbow") else [-0.35, 1.05, 0.0]
        lw = to_model_space(body.get("left_wrist")) if body.get("left_wrist") else [0.6282, 1.3349, 0.0336]
        rw = to_model_space(body.get("right_wrist")) if body.get("right_wrist") else [-0.6282, 1.3349, 0.0336]
        l_hand = [to_model_space(p, True, lw[2]) for p in frame.get("left_hand") or []]
        r_hand = [to_model_space(p, True, rw[2]) for p in frame.get("right_hand") or []]
        if l_hand and r_hand:
            li = min(p[0] for p in l_hand)
            ri = max(p[0] for p in r_hand)
            gap = li - ri
            if gap > TARGET_PALM_GAP:
                shift = (gap - TARGET_PALM_GAP) / 2.0
                lw[0] = round(lw[0] - shift, 6)
                rw[0] = round(rw[0] + shift, 6)
                l_hand = [[round(p[0] - shift, 6), p[1], p[2]] for p in l_hand]
                r_hand = [[round(p[0] + shift, 6), p[1], p[2]] for p in r_hand]
            lw[2] = round(lw[2] + HAND_FORWARD_PUSH, 6)
            rw[2] = round(rw[2] + HAND_FORWARD_PUSH, 6)
            l_hand = [[p[0], p[1], round(p[2] + HAND_FORWARD_PUSH, 6)] for p in l_hand]
            r_hand = [[p[0], p[1], round(p[2] + HAND_FORWARD_PUSH, 6)] for p in r_hand]
        out.append({
            "frame_idx": i,
            "duration_ms": 33,
            "body": {
                "left_shoulder": to_model_space(body.get("left_shoulder")),
                "left_elbow": le,
                "left_wrist": lw,
                "right_shoulder": to_model_space(body.get("right_shoulder")),
                "right_elbow": re_,
                "right_wrist": rw,
            },
            "left_hand": l_hand,
            "right_hand": r_hand,
            "face_blendshapes": {"jawOpen": 0.0},
        })
    return out


def main():
    rows = fetch_main()
    groups = {}
    for r in rows:
        sid = str(r.get("signId") or r.get("sign_id") or "").strip()
        if not sid:
            continue
        groups.setdefault(sid.upper(), []).append(r)

    gloss = {}
    for sid, recs in groups.items():
        best = max(recs, key=lambda r: len(r.get("frames") or []))
        frames = convert(best)
        if frames:
            gloss[sid] = frames
            b = frames[0]["body"]
            up = math.dist(b["left_shoulder"], b["left_elbow"])
            fo = math.dist(b["left_elbow"], b["left_wrist"])
            gap = math.dist(b["left_wrist"], b["right_wrist"])
            print("%-8s frames=%3d  upper=%.3f  fore=%.3f  wrist-gap=%.3f"
                  % (sid, len(frames), up, fo, gap))

    with open("isl-backend/gloss_poses.json", "w", encoding="utf-8") as f:
        json.dump(gloss, f, indent=2)
    print("\nwrote isl-backend/gloss_poses.json ->", list(gloss.keys()))


if __name__ == "__main__":
    main()
