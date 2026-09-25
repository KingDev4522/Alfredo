import os
import json
from fastapi import APIRouter, Body
from .database import to_model_space, push_hands_clear, separate_palms

router = APIRouter()

def transform_point(node, is_hand=False, wrist_z=None):
    """Single {x,y,z} dict (or [x,y,z]) -> model-space array, shared math."""
    return to_model_space(node, is_hand=is_hand, wrist_z=wrist_z)

def transform_frame(frame):
    """
    Convert one normalized recording frame into model-space arrays using the
    SAME math as routers.database (damped body Z, wrist-relative hand Z).
    The old generic recursion fed raw body Z straight through, which threw
    high takes ~0.6 m in front of the avatar.
    """
    if not isinstance(frame, dict):
        return frame
    if "body" not in frame and "left_hand" not in frame and "right_hand" not in frame:
        return frame
    body = frame.get("body") or {}
    l_wrist = to_model_space(body.get("left_wrist")) if body.get("left_wrist") else None
    r_wrist = to_model_space(body.get("right_wrist")) if body.get("right_wrist") else None
    l_hand = [transform_point(p, True, l_wrist[2] if l_wrist else None) for p in frame.get("left_hand") or []]
    r_hand = [transform_point(p, True, r_wrist[2] if r_wrist else None) for p in frame.get("right_hand") or []]
    # Same palm separation + per-hand torso clearance as routers.database
    # (NOT gated on both hands for Z — one-handed takes need it too).
    l_wrist, r_wrist, l_hand, r_hand = separate_palms(
        l_wrist, r_wrist, l_hand, r_hand)
    l_wrist, r_wrist, l_hand, r_hand = push_hands_clear(
        l_wrist, r_wrist, l_hand, r_hand,
        l_shoulder=to_model_space(body.get("left_shoulder")) if body.get("left_shoulder") else None,
        r_shoulder=to_model_space(body.get("right_shoulder")) if body.get("right_shoulder") else None)
    out = dict(frame)
    out["body"] = {
        k: (to_model_space(v) if isinstance(v, (dict, list, tuple)) else v)
        for k, v in body.items()
    }
    if l_wrist:
        out["body"]["left_wrist"] = l_wrist
    if r_wrist:
        out["body"]["right_wrist"] = r_wrist
    if "left_hand" in frame:
        out["left_hand"] = l_hand
    if "right_hand" in frame:
        out["right_hand"] = r_hand
    return out

def transform_coords(node):
    """
    Convert normalized recording frames into Three.js world-space arrays.
    Frames (dicts with body/left_hand/right_hand) use the shared conversion;
    anything else passes through untouched.
    """
    if isinstance(node, list):
        return [transform_frame(f) if isinstance(f, dict) and ("body" in f or "left_hand" in f) else transform_coords(f) for f in node]
    elif isinstance(node, dict):
        if "body" in node or "left_hand" in node or "right_hand" in node:
            return transform_frame(node)
        return {k: transform_coords(v) for k, v in node.items()}
    else:
        return node

def load_json(path: str) -> dict:
    if os.path.exists(path):
        with open(path, "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}
    return {}

@router.post("/api/import-poses")
async def import_poses(data: dict = Body(...)):
    fingerspell_path = "fingerspell_poses.json"
    gloss_path = "gloss_poses.json"

    fingerspell_db = load_json(fingerspell_path)
    gloss_db = load_json(gloss_path)

    recordings = data.get("recordings", []) if "recordings" in data else [{"signId": k, "frames": v} for k, v in data.items()]
    
    for r in recordings:
        sign_id = r.get("signId")
        frames = r.get("frames", [])
        if not sign_id:
            continue
            
        transformed_frames = transform_coords(frames)
        clean_sign = str(sign_id).strip().upper()
        
        if len(clean_sign) == 1:
            fingerspell_db[clean_sign] = transformed_frames
        else:
            gloss_db[clean_sign] = transformed_frames

    with open(fingerspell_path, "w") as f:
        json.dump(fingerspell_db, f, indent=2)
    with open(gloss_path, "w") as f:
        json.dump(gloss_db, f, indent=2)

    return {"status": "success", "message": "Poses imported and transformed successfully"}
