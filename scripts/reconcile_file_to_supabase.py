"""Push local-file recordings that are missing from Supabase main.

The file held a 'food' recording that Supabase no longer had; the file is the
only copy, so it must not be lost.
"""
import json, os, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qyvwtfpeaokmdqpuqegx.supabase.co")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

recs = json.load(open("isl-backend/database/recordings.json"))
if isinstance(recs, dict):
    recs = recs.get("recordings", [])

req = urllib.request.Request(
    SUPABASE_URL + "/rest/v1/main_recordings?select=sign_id",
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY},
)
have = {r["sign_id"] for r in json.loads(urllib.request.urlopen(req, timeout=30).read())}
print("already in Supabase:", sorted(have))

rows = []
for r in recs:
    sid = r.get("signId")
    if not sid or sid in have:
        continue
    rows.append({
        "sign_id": sid,
        "recorded_by": r.get("recordedBy", "Unknown"),
        "condition_label": r.get("conditionLabel", "unspecified"),
        "hand_count": r.get("handCount", 1),
        "frames": r.get("frames"),
    })
    print("  queuing:", sid, "frames", len(r.get("frames") or []))

if rows:
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        SUPABASE_URL + "/rest/v1/main_recordings",
        data=body,
        method="POST",
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY,
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    urllib.request.urlopen(req, timeout=60).read()
    print("inserted", len(rows))
else:
    print("nothing to reconcile")
