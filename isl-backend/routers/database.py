from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import json
import os
import uuid
import anyio
import asyncio
import math

# Face collision DISABLED — the sphere at [0, 1.50, -0.08] was the "force field
# above the head" you saw. It sat exactly where you raise your hands and pushed
# the wrist in +Z when the elbow->wrist segment passed within 0.05 m. Disabled
# entirely so hands above the head are never deflected. Keep this disabled.
FACE_CENTER = None
FACE_RADIUS = 0.0
FACE_SOFT_PUSH = 0.0

def closest_point_on_segment(A, B, P):
    return A

def apply_capsule_collision(elbow, wrist, sphere_center, radius):
    # Disabled — return wrist untouched. No lateral or depth push, so two hands
    # can meet anywhere and stay exactly where you recorded them.
    return wrist

# --- Landmark sanity limits ---
# MediaPipe pose landmarks are image-normalised x/y plus a hip-relative depth z
# that is NOT in the same unit as x/y. Measured on real recordings of raised
# arms, |z| reached 1.4-3.6 shoulder-widths and elbow |x| exceeded 1.0 (i.e.
# outside the image). Feeding that straight into the avatar produced a 0.44 m
# forearm on a model whose real forearm is ~0.26 m, which threw the hands far
# forward and apart so they could never meet.
#
# Depth is therefore damped and clamped. x/y are trusted (they are what the
# torso-relative normalisation is built on); z is treated as a weak depth hint.
BODY_Z_SCALE = 0.15
BODY_Z_CLAMP = 1.2

def to_model_space(point, is_hand=False, wrist_z=None):
    if not point: return [0.0, 0.0, 0.0]
    
    x = point.get("x", 0.0) if isinstance(point, dict) else float(point[0]) if isinstance(point, (list, tuple)) else 0.0
    y = point.get("y", 0.0) if isinstance(point, dict) else float(point[1]) if isinstance(point, (list, tuple)) else 0.0
    z = point.get("z", 0.0) if isinstance(point, dict) else float(point[2]) if isinstance(point, (list, tuple)) else 0.0
    
    model_x = 0.0 + x * 0.2845
    model_y = 1.3351 + (-y) * 0.2845
    
    if is_hand and wrist_z is not None:
        # Hand depth is wrist-relative and small (0 at the wrist, ~-0.1 at the
        # fingertips), so it is trustworthy and is not damped.
        model_z = wrist_z + (-z) * 0.2845
    else:
        clamped_z = max(-BODY_Z_CLAMP, min(BODY_Z_CLAMP, z))
        model_z = -0.0439 + (-clamped_z) * BODY_Z_SCALE
        
    return [round(model_x, 6), round(model_y, 6), round(model_z, 6)]


# Hands-vs-torso clearance. Measured from public/avatar/human.glb: the outfit
# (outermost visible mesh) reaches z=0.16 overall and z=0.148 across the chest
# (|x|<0.15, y 1.0-1.35), while chest-height takes sit as deep as z=0.005 —
# i.e. up to ~15 cm INSIDE the dress, which is exactly the buried-hands look.
#
# Two layers (git history: uniform was 0.12, then 0.10 through the era the
# palms read clearly ahead of the body; cutting it to 0.03 is what buried
# them again):
#  1. Classic uniform push 0.28 on wrist + full hand clouds — hands clearly
#     extended in FRONT of the body (elbows naturally come forward via IK).
#     Rigid translation: relative geometry preserved.
#  2. Adaptive floor per hand (only fires if still inside after layer 1).
# No lateral push: X stays faithful.
HAND_FORWARD_PUSH = 0.28
TORSO_FRONT_Z = 0.16
HEAD_FRONT_Z = 0.12
HAND_CLEARANCE = 0.015
TORSO_HALF_WIDTH = 0.22
BODY_REGION_TOP_Y = 1.70
MIN_TORSO_Z = TORSO_FRONT_Z + HAND_CLEARANCE  # 0.175
MIN_HEAD_Z = HEAD_FRONT_Z + HAND_CLEARANCE  # 0.135

def _surface_z(y):
    """Outermost body surface in front of a point at height y (measured GLB
    maxima: outfit dress below the neck, face/hair/glasses above)."""
    return TORSO_FRONT_Z if y < 1.45 else HEAD_FRONT_Z

def _clearance_delta(wrist, hand):
    """Forward (+Z) shift needed so no over-body point of one hand sits
    inside the torso/head. Zero for clear hands, and [0,0,0] missing-data
    sentinels are ignored (origin is the floor centre — never a real wrist).
    Above BODY_REGION_TOP_Y (hair top 1.644) hands are in free air: untouched."""
    worst = 0.0
    pts = ([wrist] if wrist else []) + (hand or [])
    for p in pts:
        if not isinstance(p, (list, tuple)) or len(p) < 3:
            continue
        x, y, z = p[0], p[1], p[2]
        if x == 0 and y == 0 and z == 0:
            continue
        if abs(x) < TORSO_HALF_WIDTH and y < BODY_REGION_TOP_Y:
            need = (_surface_z(y) + HAND_CLEARANCE) - z
            if need > worst:
                worst = need
    return round(worst, 6) if worst > 0 else 0.0

# Minimal identity space between the two palms (X axis). Fires ONLY when both
# hand clouds exist AND their gap is below minimum — wide/open signs never
# trigger it. Symmetric split: each hand moves half the deficit, so the pair's
# midpoint (the sign's location) never drifts.
PALM_MIN_GAP = 0.04  # proven no-overlap threshold (PRD 14 era)

def _coord_list(pts, idx):
    out = []
    for p in pts or []:
        if isinstance(p, (list, tuple)) and len(p) >= 3 and tuple(p[:3]) != (0, 0, 0):
            out.append(p[idx])
    return out

def _interval_gap(lo1, hi1, lo2, hi2):
    """Signed gap between two 1D intervals (negative = intersecting)."""
    if hi2 <= lo1:
        return lo1 - hi2
    if hi1 <= lo2:
        return lo2 - hi1
    return -(min(hi1, hi2) - max(lo1, lo2))

def separate_palms(l_wrist, r_wrist, l_hand, r_hand):
    """Split overlapping/touching palms apart in X, rigidly (wrist rides with
    its own cloud). Fires ONLY when both clouds exist, their heights overlap
    (stacked hands at different heights are left alone), AND their X gap is
    below minimum — wide/open signs never trigger it."""
    if not l_hand or not r_hand:
        return l_wrist, r_wrist, l_hand, r_hand
    pts_l = ([l_wrist] if l_wrist else []) + (l_hand or [])
    pts_r = ([r_wrist] if r_wrist else []) + (r_hand or [])
    xs_l, ys_l = _coord_list(pts_l, 0), _coord_list(pts_l, 1)
    xs_r, ys_r = _coord_list(pts_r, 0), _coord_list(pts_r, 1)
    if not xs_l or not xs_r:
        return l_wrist, r_wrist, l_hand, r_hand
    if _interval_gap(min(ys_l), max(ys_l), min(ys_r), max(ys_r)) > 0.05:
        return l_wrist, r_wrist, l_hand, r_hand  # different heights: no clash
    loL, hiL = min(xs_l), max(xs_l)
    loR, hiR = min(xs_r), max(xs_r)
    gap = _interval_gap(loL, hiL, loR, hiR)
    if gap >= PALM_MIN_GAP:
        return l_wrist, r_wrist, l_hand, r_hand
    shift = round((PALM_MIN_GAP - gap) / 2, 6)
    cxL = sum(xs_l) / len(xs_l)
    cxR = sum(xs_r) / len(xs_r)
    # move the clouds apart along X, away from each other
    sL = shift if cxL >= cxR else -shift
    sR = -shift if cxL >= cxR else shift
    if l_wrist:
        l_wrist[0] = round(l_wrist[0] + sL, 6)
    l_hand = [[round(p[0] + sL, 6), p[1], p[2]] for p in l_hand]
    if r_wrist:
        r_wrist[0] = round(r_wrist[0] + sR, 6)
    r_hand = [[round(p[0] + sR, 6), p[1], p[2]] for p in r_hand]
    return l_wrist, r_wrist, l_hand, r_hand

def apply_hand_clearance_floor(l_wrist, r_wrist, l_hand, r_hand):
    """Serve-time guarantee (IDEMPOTENT — safe to run on already-converted
    frames at playback time): lifts each hand forward just enough that no
    point sits inside the torso/head. Applies ONLY the adaptive floor, never
    the uniform push, so running it twice cannot double-push the hands."""
    dl = _clearance_delta(l_wrist, l_hand or [])
    if dl:
        if l_wrist:
            l_wrist[2] = round(l_wrist[2] + dl, 6)
        l_hand = [[p[0], p[1], round(p[2] + dl, 6)] for p in (l_hand or [])]
    dr = _clearance_delta(r_wrist, r_hand or [])
    if dr:
        if r_wrist:
            r_wrist[2] = round(r_wrist[2] + dr, 6)
        r_hand = [[p[0], p[1], round(p[2] + dr, 6)] for p in (r_hand or [])]
    return l_wrist, r_wrist, l_hand, r_hand

# Model reach, from the GLB bind pose: scripts/verify_avatar_ik.mjs prints
# arm=1.039 at its 2.0626 world scale -> 0.504 m here. The renderer's
# solveArmIK clamps |shoulder->wrist| to upperLen + foreLen - 0.02; pushing a
# wrist target past that makes the rendered wrist snap back while the finger
# cloud keeps the pushed pose — hands visibly DETACH from the arms. This is
# the hard ceiling for any forward push.
MODEL_MAX_REACH = 0.5037

def _cap_to_reach(wrist, hand, shoulder):
    """Pull one arm's target back onto the model's reach sphere — exactly what
    the renderer's IK clamp does — and translate the finger cloud by the same
    delta so the hand stays attached to the wrist bone. No-op within reach."""
    if not wrist or not shoulder:
        return wrist, hand or []
    dx = wrist[0] - shoulder[0]
    dy = wrist[1] - shoulder[1]
    dz = wrist[2] - shoulder[2]
    d = math.sqrt(dx * dx + dy * dy + dz * dz)
    if d <= MODEL_MAX_REACH or d < 1e-6:
        return wrist, hand or []
    s = MODEL_MAX_REACH / d
    nx = round(shoulder[0] + dx * s, 6)
    ny = round(shoulder[1] + dy * s, 6)
    nz = round(shoulder[2] + dz * s, 6)
    mx, my, mz = round(nx - wrist[0], 6), round(ny - wrist[1], 6), round(nz - wrist[2], 6)
    wrist[0], wrist[1], wrist[2] = nx, ny, nz
    hand = [[round(p[0] + mx, 6), round(p[1] + my, 6), round(p[2] + mz, 6)] for p in (hand or [])]
    return wrist, hand

def push_hands_clear(l_wrist, r_wrist, l_hand, r_hand, l_shoulder=None, r_shoulder=None):
    """Three-layer forward placement (mutates wrist lists in place, returns
    new hand clouds). Layer 1: uniform push — hands clearly extended ahead of
    the body. Layer 2: per-hand adaptive floor for anything still inside.
    Layer 3: reach cap — never beyond what the renderer's two-bone IK can
    solve, so the wrist bone and the finger cloud always stay attached."""
    if l_wrist:
        l_wrist[2] = round(l_wrist[2] + HAND_FORWARD_PUSH, 6)
    l_hand = [[p[0], p[1], round(p[2] + HAND_FORWARD_PUSH, 6)] for p in (l_hand or [])]
    if r_wrist:
        r_wrist[2] = round(r_wrist[2] + HAND_FORWARD_PUSH, 6)
    r_hand = [[p[0], p[1], round(p[2] + HAND_FORWARD_PUSH, 6)] for p in (r_hand or [])]
    l_wrist, r_wrist, l_hand, r_hand = apply_hand_clearance_floor(l_wrist, r_wrist, l_hand, r_hand)
    l_wrist, l_hand = _cap_to_reach(l_wrist, l_hand, l_shoulder)
    r_wrist, r_hand = _cap_to_reach(r_wrist, r_hand, r_shoulder)
    return l_wrist, r_wrist, l_hand, r_hand

_supabase_config_warned = False


def load_source_recordings():
    """Source of truth for the avatar.

    Supabase is authoritative when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
    configured; otherwise the local JSON file is used. Previously the file was
    always used, which let the two stores drift apart (the file kept an older
    take while Supabase had the user's newest one) and the avatar then animated
    a recording the user had never made.
    """
    global _supabase_config_warned
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        # Loud on purpose. This used to return silently, and that silence is
        # why new recordings appeared to never reach the pipeline: every
        # request quietly served the local file while users recorded into
        # Supabase. One line at startup is the whole diagnosis.
        if not _supabase_config_warned:
            _supabase_config_warned = True
            missing = []
            if not url:
                missing.append("SUPABASE_URL")
            if not key:
                missing.append("SUPABASE_SERVICE_ROLE_KEY")
            # DB_DIR is assigned further down this module, so it is not
            # referenced here: this is an error path and must not be able to
            # raise a NameError of its own.
            print(
                f"[database] Supabase NOT configured (missing: {', '.join(missing)}). "
                f"Falling back to database/recordings.json for the whole avatar pipeline. "
                f"Recordings saved to Supabase will NOT be animated. "
                f"Set the missing value(s) in isl-backend/.env to fix."
            )
        return load_db(), "file"

    try:
        import urllib.request
        req = urllib.request.Request(
            url.rstrip("/") + "/rest/v1/main_recordings?select=sign_id,hand_count,recording_type,frames,created_at",
            headers={"apikey": key, "Authorization": "Bearer " + key},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        out = []
        for r in rows:
            out.append({
                "signId": r.get("sign_id"),
                "handCount": r.get("hand_count"),
                "recordingType": normalize_recording_type(r.get("recording_type")),
                "frames": r.get("frames") or [],
                # Carried so the golden pick below is latest-wins. File takes
                # carry recordedAt instead; _take_time_ms reads either shape.
                "createdAt": r.get("created_at"),
            })
        return out, "supabase"
    except Exception as e:
        print(f"[database] Supabase read failed ({e}); falling back to local file.")
        return load_db(), "file"


def _take_time_ms(recording):
    """Newest-first ordering key for the golden pick. Supabase rows carry an
    ISO created_at; file takes carry a numeric recordedAt (ms epoch). Either
    shape (or a missing stamp on very old rows) resolves to epoch millis, so
    the newest recording always wins regardless of which store served it."""
    for key in ("createdAt", "created_at", "recordedAt", "recorded_at"):
        value = recording.get(key) if isinstance(recording, dict) else None
        if value is None:
            continue
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            text = value.strip()
            if not text:
                continue
            if text.isdigit():
                return float(text)
            try:
                from datetime import datetime
                return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000
            except ValueError:
                continue
    return 0.0


def sync_golden_takes_to_gloss_db():
    db, source = load_source_recordings()
    sign_groups = {}
    for r in db:
        if not isinstance(r, dict): continue
        sign_id = r.get("signId")
        if not sign_id: continue
        sign_id = str(sign_id).upper()
        if sign_id not in sign_groups:
            sign_groups[sign_id] = []
        sign_groups[sign_id].append(r)
        
    gloss_db = {}
    resting_left_wrist = [0.6282, 1.3349, 0.0336]
    resting_right_wrist = [-0.6282, 1.3349, 0.0336]
    resting_left_elbow = [0.35, 1.05, 0.0]
    resting_right_elbow = [-0.35, 1.05, 0.0]
    
    # Latest recording wins per sign (locked rule): the newest take is the
    # only one Translate ever plays, so older takes can never override or
    # contradict what is currently being recorded. Ties fall back to longest.
    # Older takes are NOT deleted — the Interpreter still uses every take as
    # a recognition template (that is why it is fast and accurate) — but they
    # never enter this gloss lookup.
    for sign_id, recs in sign_groups.items():
        best_rec = max(recs, key=lambda x: (_take_time_ms(x), len(x.get("frames", []))))
        converted_frames = []
        
        for i, frame in enumerate(best_rec.get("frames", [])):
            if isinstance(frame, dict) and "body" in frame:
                body = frame.get("body") or {}
                l_elbow = to_model_space(body.get("left_elbow")) if body.get("left_elbow") else resting_left_elbow
                r_elbow = to_model_space(body.get("right_elbow")) if body.get("right_elbow") else resting_right_elbow
                l_wrist = to_model_space(body.get("left_wrist")) if body.get("left_wrist") else resting_left_wrist
                r_wrist = to_model_space(body.get("right_wrist")) if body.get("right_wrist") else resting_right_wrist
                
                # build hand clouds (renderer IK now places wrists exactly;
                # no X-axis palm closure — it squashed genuinely wide signs)
                l_hand = [to_model_space(p, True, l_wrist[2]) for p in frame.get("left_hand") or []]
                r_hand = [to_model_space(p, True, r_wrist[2]) for p in frame.get("right_hand") or []]

                # minimal palm identity space first (X; no-op unless the two
                # clouds touch/overlap), then per-hand forward clearance (Z;
                # works for one-handed takes too — the old gate needed BOTH
                # hands present, so one-handed signs got zero push and buried)
                l_wrist, r_wrist, l_hand, r_hand = separate_palms(
                    l_wrist, r_wrist, l_hand, r_hand)
                l_wrist, r_wrist, l_hand, r_hand = push_hands_clear(
                    l_wrist, r_wrist, l_hand, r_hand,
                    l_shoulder=to_model_space(body.get("left_shoulder")) if body.get("left_shoulder") else None,
                    r_shoulder=to_model_space(body.get("right_shoulder")) if body.get("right_shoulder") else None)

                # face collision disabled — see header

                converted_frames.append({
                    "frame_idx": i,
                    "duration_ms": 33,
                    "body": {
                        "left_shoulder": to_model_space(body.get("left_shoulder")),
                        "left_elbow": l_elbow,
                        "left_wrist": l_wrist,
                        "right_shoulder": to_model_space(body.get("right_shoulder")),
                        "right_elbow": r_elbow,
                        "right_wrist": r_wrist
                    },
                    "left_hand": l_hand,
                    "right_hand": r_hand,
                    "face_blendshapes": {"jawOpen": 0.0}
                })
                
        if converted_frames:
            gloss_db[sign_id] = converted_frames
            
    with open(os.path.join(BASE_DIR, "gloss_poses.json"), "w") as f:
        json.dump(gloss_db, f, indent=2)
    print(f"[database] gloss rebuilt from {source}: {sorted(gloss_db.keys())}")

router = APIRouter(prefix="/api/db", tags=["database"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(BASE_DIR, "database")
DB_FILE = os.path.join(DB_DIR, "recordings.json")

# Global lock to serialize database access
db_lock = asyncio.Lock()

def load_db():
    os.makedirs(DB_DIR, exist_ok=True)
    if not os.path.exists(DB_FILE):
        return []
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            # Handle empty files by checking if it's completely empty before load
            f.seek(0, os.SEEK_END)
            if f.tell() == 0:
                return []
            f.seek(0)
            data = json.load(f)
            if isinstance(data, dict):
                return data.get("recordings", [])
            return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []

def save_db(data):
    os.makedirs(DB_DIR, exist_ok=True)
    temp_file = DB_FILE + ".tmp"
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_file, DB_FILE)
    except Exception as e:
        if os.path.exists(temp_file):
            os.remove(temp_file)
        raise e

# PRD 18 — Static/Motion classification. The file DB is schemaless, so the
# flag rides inside each recording dict as `recordingType` (app shape).
# Reads default missing/foreign values to "motion"; writes normalize it.
def normalize_recording_type(value):
    return "static" if isinstance(value, str) and value.lower() == "static" else "motion"

def _stamp_recording_type(recording):
    if isinstance(recording, dict):
        recording["recordingType"] = normalize_recording_type(
            recording.get("recordingType", recording.get("recording_type"))
        )
    return recording

# Synchronous helpers that perform the atomic read-modify-write operations
def _add_recording_sync(recording):
    db = load_db()
    if "id" not in recording:
        recording["id"] = str(uuid.uuid4())
    _stamp_recording_type(recording)
    db.append(recording)
    save_db(db)
    sync_golden_takes_to_gloss_db() # Phase 2B Auto-Sync
    return recording

def _clear_all_sync():
    save_db([])
    # Rebuild the derived avatar dictionary from the (now empty) source instead
    # of raw-writing {} — same end state for the file path, but consistent with
    # every other mutation above, and Supabase-aware when configured.
    try:
        sync_golden_takes_to_gloss_db()
    except Exception as e:
        print(f"[database] gloss resync after clear-all failed ({e})")

def _delete_by_sign_sync(sign_id):
    db = load_db()
    new_db = [r for r in db if r.get("signId") != sign_id]
    save_db(new_db)
    sync_golden_takes_to_gloss_db()

def _delete_recording_sync(id_str):
    db = load_db()
    new_db = [r for r in db if str(r.get("id")) != id_str]
    if len(db) == len(new_db):
        return False
    save_db(new_db)
    sync_golden_takes_to_gloss_db()
    return True

def _import_recordings_sync(data):
    valid_records = []
    for r in data:
        if isinstance(r, dict) and "signId" in r and "frames" in r:
            r["id"] = str(uuid.uuid4())
            _stamp_recording_type(r)
            valid_records.append(r)
    
    if not valid_records:
        return 0
        
    db = load_db()
    db.extend(valid_records)
    save_db(db)
    sync_golden_takes_to_gloss_db()
    return len(valid_records)

@router.get("/recordings")
async def get_recordings():
    return await anyio.to_thread.run_sync(load_db)

@router.post("/recordings")
async def add_recording(recording: dict):
    async with db_lock:
        return await anyio.to_thread.run_sync(_add_recording_sync, recording)

@router.delete("/recordings/all")
async def clear_all():
    async with db_lock:
        await anyio.to_thread.run_sync(_clear_all_sync)
    return {"message": "Cleared all recordings"}

@router.delete("/recordings/sign/{sign_id}")
async def delete_by_sign(sign_id: str):
    async with db_lock:
        await anyio.to_thread.run_sync(_delete_by_sign_sync, sign_id)
    return {"message": f"Deleted all recordings for {sign_id}"}

@router.delete("/recordings/{id}")
async def delete_recording(id: str):
    async with db_lock:
        success = await anyio.to_thread.run_sync(_delete_recording_sync, id)
    if not success:
        raise HTTPException(status_code=404, detail="Recording not found")
    return {"message": "Deleted successfully"}

@router.post("/import")
async def import_recordings(data: List[dict]):
    async with db_lock:
        imported_count = await anyio.to_thread.run_sync(_import_recordings_sync, data)
    return {"message": f"Imported {imported_count} recordings", "imported": imported_count}
