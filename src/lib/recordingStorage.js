// PRD 02 v2 §4 + §5 - Supabase-first storage with FastAPI fallback.
// When VITE_SUPABASE_URL/KEY are set: main_recordings (shared, admin-write)
// + user_recordings (owner-only) via Supabase + RLS.
// When missing (pre-key dev): falls back to legacy FastAPI JSON file backend.

import { supabase, isSupabaseConfigured, API_DB_URL } from "./supabaseClient";

const LEGACY_URL = API_DB_URL;

function currentOwnerId() {
  return supabase?.auth
    ? null // resolved async by callers via getSession
    : null;
}

async function getUser() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// ---------- legacy FastAPI helpers (pre-Supabase dev path) ----------
async function legacySaveRecording(recording) {
  const res = await fetch(`${LEGACY_URL}/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recording),
  });
  if (!res.ok) throw new Error("Failed to save recording");
  return res.json();
}

async function legacyGetAll() {
  let res;
  try {
    res = await fetch(`${LEGACY_URL}/recordings`);
  } catch (error) {
    throw new Error(`Network error in getAllRecordings: ${error.message}`);
  }
  if (!res.ok) throw new Error("Failed to load recordings. Backend might be offline.");
  return await res.json();
}

// ---------- dual-storage bridge (PRD 05): GitHub-tracked file <-> Supabase ----------
// recordings.json stays tracked in git (NOT gitignored) in the exact app shape
// { signId, recordedBy, conditionLabel, handCount, frames } - Supabase rows map 1:1.

export async function saveToLegacyFile(recording) {
  return legacySaveRecording({ ...recording });
}

// Reverse bridge: pull Supabase Main + my recordings into the localhost file
// so the Translate avatar (which plays the file-derived gloss_poses.json) can
// sign words recorded in Supabase mode. Signs already present in the file
// (case-insensitive signId match) are skipped, so repeat runs never duplicate.
// Requires the localhost backend (writes via /api/db/import, which rebuilds
// the gloss automatically).
export async function syncSupabaseToLegacyFile() {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase is not configured yet.");
  const [main, mine] = await Promise.all([getMainRecordings(), getMyRecordings()]);
  const candidates = [...main, ...mine].filter(
    (r) => r && typeof r.signId === "string" && Array.isArray(r.frames) && r.frames.length > 0
  );
  let existing = [];
  try {
    const res = await fetch(`${LEGACY_URL}/recordings`);
    if (!res.ok) throw new Error("file unreachable");
    existing = await res.json();
  } catch {
    throw new Error("Localhost backend is offline. Start it on http://localhost:8000 first.");
  }
  const have = new Set(
    (Array.isArray(existing) ? existing : [])
      .map((r) => r && typeof r.signId === "string" ? r.signId.toUpperCase() : null)
      .filter(Boolean)
  );
  const fresh = candidates.filter((r) => !have.has(r.signId.toUpperCase()));
  // De-dupe within the batch itself (same sign in both Main and mine): keep longest take.
  const best = new Map();
  for (const r of fresh) {
    const key = r.signId.toUpperCase();
    if (!best.has(key) || (r.frames.length > best.get(key).frames.length)) best.set(key, r);
  }
  const toImport = [...best.values()].map((r) => ({
    signId: r.signId,
    recordedBy: r.recordedBy || "Unknown",
    conditionLabel: r.conditionLabel || "unspecified",
    handCount: r.handCount ?? 1,
    frames: r.frames,
    recordedAt: r.recordedAt || Date.now(),
  }));
  if (toImport.length === 0) return { imported: 0, skipped: candidates.length };
  const res = await fetch(`${LEGACY_URL}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toImport),
  });
  if (!res.ok) throw new Error("Failed to import Supabase recordings into the localhost file");
  const data = await res.json();
  return { imported: data.imported ?? toImport.length, skipped: candidates.length - toImport.length };
}

// Push every recording currently in the localhost file into Supabase Main.
// Admin JWT required (RLS). Run once Supabase API is online; repeat runs will
// duplicate, so prefer running it once per batch of local recordings.
export async function syncLegacyFileToMain() {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase is not configured yet.");
  const user = await getUser();
  if (!user) throw new Error("Sign in as admin first.");
  const legacy = await legacyGetAll();
  const rows = legacy
    .filter((r) => r && typeof r.signId === "string" && Array.isArray(r.frames))
    .map((r) => ({
      sign_id: r.signId,
      recorded_by: r.recordedBy || "admin",
      condition_label: r.conditionLabel || "unspecified",
      hand_count: r.handCount ?? 1,
      frames: r.frames,
      created_by: user.id,
    }));
  if (rows.length === 0) return { pushed: 0 };
  const CHUNK = 20;
  let pushed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("main_recordings").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Sync to Main failed: ${error.message}`);
    pushed += Math.min(CHUNK, rows.length - i);
  }
  return { pushed };
}

// ---------- public API (same signatures as before) ----------

export async function getMainRecordings() {
  if (!isSupabaseConfigured || !supabase) return legacyGetAll();
  const { data, error } = await supabase
    .from("main_recordings")
    .select("id, sign_id, recorded_by, condition_label, hand_count, frames, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load Main database: ${error.message}`);
  return (data || []).map(toAppShape);
}

export async function getMyRecordings() {
  if (!isSupabaseConfigured || !supabase) return [];
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_recordings")
    .select("id, sign_id, owner_id, recorded_by, condition_label, hand_count, frames, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load your recordings: ${error.message}`);
  return (data || []).map(toAppShape);
}

// Merged view for the interpreter: main + mine (custom-first handled in libraryMerge).
export async function getAllRecordings() {
  if (!isSupabaseConfigured || !supabase) return legacyGetAll();
  const [main, mine] = await Promise.all([getMainRecordings(), getMyRecordings()]);
  return [...mine.map((r) => ({ ...r, source: "user" })), ...main.map((r) => ({ ...r, source: "main" }))];
}

// target: 'main' (admin only, RLS-enforced) | 'mine'
export async function saveRecording(recording, target = "mine") {
  if (!isSupabaseConfigured || !supabase) return legacySaveRecording(recording);
  const user = await getUser();
  if (!user) throw new Error("Sign in to save recordings.");
  if (target === "main") {
    const { data, error } = await supabase
      .from("main_recordings")
      .insert({
        sign_id: recording.signId,
        recorded_by: recording.recordedBy || user.email || "admin",
        condition_label: recording.conditionLabel || "unspecified",
        hand_count: recording.handCount,
        frames: recording.frames,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw new Error(`Publish to Main failed: ${error.message}`);
    return toAppShape(data);
  }
  const { data, error } = await supabase
    .from("user_recordings")
    .insert({
      owner_id: user.id,
      sign_id: recording.signId,
      recorded_by: recording.recordedBy || user.email || "Unknown",
      condition_label: recording.conditionLabel || "unspecified",
      hand_count: recording.handCount,
      frames: recording.frames,
    })
    .select()
    .single();
  if (error) throw new Error(`Save failed: ${error.message}`);
  return toAppShape(data);
}

export async function deleteRecording(id) {
  if (!isSupabaseConfigured || !supabase) {
    const res = await fetch(`${LEGACY_URL}/recordings/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete recording");
    return { fileMirror: 0 };
  }
  // PRD 05 dual-delete: remove from BOTH Supabase tables (RLS permits only the
  // legal one), require at least one row actually removed, then best-effort
  // mirror into the localhost file by content match (stores use different UUIDs).
  const user = await getUser();
  if (!user) throw new Error("Sign in to delete recordings.");
  const [mine, main] = await Promise.all([
    supabase.from("user_recordings").delete().eq("id", id).eq("owner_id", user.id)
      .select("id,sign_id,recorded_by,condition_label,hand_count,frame_count"),
    supabase.from("main_recordings").delete().eq("id", id)
      .select("id,sign_id,recorded_by,condition_label,hand_count,frame_count"),
  ]);
  if (mine.error && main.error) throw new Error("Failed to delete recording");
  const mineRemoved = mine.data || [];
  const mainRemoved = main.data || [];
  if (mineRemoved.length + mainRemoved.length === 0) {
    throw new Error("Nothing deleted. Not yours, and not admin.");
  }
  // Mirror into the file ONLY for Main deletions: personal rows never live in the
  // file under Supabase mode, so a twin match there would be someone else's golden.
  const victim = mainRemoved[0];
  let fileMirror = 0;
  if (!victim) return { fileMirror };
  try {
    const legacy = await legacyGetAll();
    const twins = legacy.filter((r) =>
      r && r.signId === victim.sign_id &&
      (r.recordedBy || "Unknown") === (victim.recorded_by || "Unknown") &&
      (r.conditionLabel || "unspecified") === (victim.condition_label || "unspecified") &&
      (r.handCount ?? 1) === (victim.hand_count ?? 1) &&
      Array.isArray(r.frames) && r.frames.length === (victim.frame_count ?? -1)
    );
    // Same sign + batch + hand + length: the file twin(s) of this exact take.
    for (const t of twins) {
      await fetch(`${LEGACY_URL}/recordings/${t.id}`, { method: "DELETE" });
      fileMirror++;
    }
  } catch {
    // Backend offline - Supabase copy is gone; file copy syncs later.
  }
  return { fileMirror };
}

export async function clearAllRecordings() {
  if (!isSupabaseConfigured || !supabase) {
    const res = await fetch(`${LEGACY_URL}/recordings/all`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to clear recordings");
    return;
  }
  const user = await getUser();
  if (!user) throw new Error("Sign in required.");
  const { error } = await supabase.from("user_recordings").delete().eq("owner_id", user.id);
  if (error) throw new Error("Failed to clear your recordings");
}

export async function deleteRecordingsForSign(signId, target = "mine") {
  if (!isSupabaseConfigured || !supabase) {
    const res = await fetch(`${LEGACY_URL}/recordings/sign/${signId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete recordings for sign");
    return;
  }
  const user = await getUser();
  if (!user) throw new Error("Sign in required.");
  const table = target === "main" ? "main_recordings" : "user_recordings";
  let q = supabase.from(table).delete().eq("sign_id", signId);
  if (table === "user_recordings") q = q.eq("owner_id", user.id);
  const { error } = await q;
  if (error) throw new Error("Failed to delete recordings for sign");
  // Dual-delete mirror ONLY for Main clears: the file holds shared goldens, and a
  // personal clear must never touch it. Same signId semantics on both sides.
  if (target !== "main") return;
  try {
    await fetch(`${LEGACY_URL}/recordings/sign/${signId}`, { method: "DELETE" });
  } catch {
    // Backend offline - cloud copy is gone; file copy syncs later.
  }
}

export async function getCountsPerSign() {
  const all = await getAllRecordings();
  const counts = {};
  for (const recording of all) {
    const key = recording.signId;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Split counts for Record picker: { shared: {}, mine: {} }
export async function getCountsSplit() {
  if (!isSupabaseConfigured || !supabase) {
    const counts = await getCountsPerSign();
    return { shared: counts, mine: {} };
  }
  const [main, mine] = await Promise.all([getMainRecordings(), getMyRecordings()]);
  const shared = {};
  const own = {};
  for (const r of main) shared[r.signId] = (shared[r.signId] || 0) + 1;
  for (const r of mine) own[r.signId] = (own[r.signId] || 0) + 1;
  return { shared, mine: own };
}

export async function importRecordingsFromFile(file, target = "mine") {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const recordings = Array.isArray(payload?.recordings) ? payload.recordings : null;
  if (!recordings) {
    throw new Error('That file doesn\'t look like a recordings export. Expected a "recordings" array.');
  }

  const validRecordings = recordings.filter(r => r && typeof r.signId === "string" && Array.isArray(r.frames));
  const skipped = recordings.length - validRecordings.length;
  const toImport = validRecordings.map(({ id: _oldId, ...rest }) => rest);

  if (!isSupabaseConfigured || !supabase) {
    const res = await fetch(`${LEGACY_URL}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toImport),
    });
    if (!res.ok) throw new Error("Failed to import recordings to database");
    const data = await res.json();
    return { imported: data.imported ?? toImport.length, skipped, total: recordings.length };
  }

  const user = await getUser();
  if (!user) throw new Error("Sign in to import recordings.");
  const table = target === "main" ? "main_recordings" : "user_recordings";
  const rows = toImport.map((r) => ({
    ...(table === "user_recordings" ? { owner_id: user.id } : { created_by: user.id }),
    sign_id: r.signId,
    recorded_by: r.recordedBy || user.email || "Unknown",
    condition_label: r.conditionLabel || "unspecified",
    hand_count: r.handCount ?? 1,
    frames: r.frames,
  }));
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`Import failed: ${error.message}`);
  return { imported: rows.length, skipped, total: recordings.length };
}

export async function exportAllRecordingsAsFile() {
  const all = await getAllRecordings();
  const payload = {
    exportedAt: new Date().toISOString(),
    recordingCount: all.length,
    recordings: all,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.download = `isl-recordings-export-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// Supabase snake_case -> app camelCase
function toAppShape(row) {
  if (!row) return row;
  return {
    id: row.id,
    signId: row.sign_id ?? row.signId,
    recordedBy: row.recorded_by ?? row.recordedBy,
    conditionLabel: row.condition_label ?? row.conditionLabel,
    handCount: row.hand_count ?? row.handCount,
    frames: row.frames,
    recordedAt: row.created_at ? Date.parse(row.created_at) : row.recordedAt,
    created_at: row.created_at,
    source: row.source,
  };
}

export { currentOwnerId };
