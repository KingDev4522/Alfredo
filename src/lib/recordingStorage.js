/**
 * Storage layer for recorded signs, using IndexedDB rather than
 * localStorage.
 *
 * Why IndexedDB and not localStorage: localStorage caps out at roughly
 * 5-10MB per site in most browsers. With 25 signs recorded 10+ times
 * each, at ~2 seconds of landmark data per recording, that limit is
 * realistic to hit. IndexedDB has a vastly higher practical limit (often
 * hundreds of MB or more), is still completely free and fully local to
 * the browser (no server, no account, no cost), and means your recording
 * progress survives accidental page reloads or closing the tab.
 */
const DB_NAME = "isl-interpreter-recordings";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("signId", "signId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves one recording. A recording is:
 * {
 *   signId: string,          - which word from VOCABULARY this is
 *   recordedBy: string,      - free-text name of whoever performed it
 *   conditionLabel: string,  - free-text tag for the recording batch, e.g.
 *                              "daylight", "lamp-lit", "angled-left",
 *                              "far-distance". Optional, but useful when
 *                              deliberately varying conditions, both to
 *                              stay organized while recording and later
 *                              to see (in Phase 3's accuracy testing)
 *                              whether any particular condition performs
 *                              noticeably worse than others.
 *   handCount: number,       - 1 or 2, how many hands were present
 *   frames: NormalizedHand[][][], - array of frames, each frame is the
 *                                   normalized hands present at that
 *                                   instant (see normalizeSequence in normalize.js)
 *   recordedAt: number,      - timestamp, for our own reference
 * }
 */
export async function saveRecording(recording) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(recording);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllRecordings() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecording(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllRecordings() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes every recording for one specific sign, leaving all other signs
 * untouched. Useful when a sign's existing recordings turn out to be the
 * problem (e.g. accuracy testing shows it's being confused with another
 * sign) and you want a clean slate for just that one word, rather than
 * mixing new recordings in with old confusing ones or wiping everything.
 */
export async function deleteRecordingsForSign(signId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("signId");
    const request = index.openCursor(IDBKeyRange.only(signId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Returns a { [signId]: count } map, so the UI can show progress per sign
 * without needing to load every recording's full frame data.
 */
export async function getCountsPerSign() {
  const all = await getAllRecordings();
  const counts = {};
  for (const recording of all) {
    counts[recording.signId] = (counts[recording.signId] || 0) + 1;
  }
  return counts;
}

/**
 * Imports recordings from a file previously produced by
 * exportAllRecordingsAsFile, merging them into whatever is already stored
 * rather than replacing it. This is how recordings get combined from
 * multiple recorders' separate devices into one central dataset.
 *
 * Each recording is given a fresh auto-assigned id rather than reusing the
 * id from the file — those ids were only ever meaningful within the
 * database they came from, so keeping them risks silently colliding with
 * (and overwriting) an unrelated existing recording here.
 */
export async function importRecordingsFromFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const recordings = Array.isArray(payload?.recordings) ? payload.recordings : null;
  if (!recordings) {
    throw new Error('That file doesn\'t look like a recordings export — expected a "recordings" array.');
  }

  const db = await openDatabase();
  let imported = 0;
  let skipped = 0;

  for (const recording of recordings) {
    if (!recording || typeof recording.signId !== "string" || !Array.isArray(recording.frames)) {
      skipped++;
      continue;
    }
    const { id: _oldId, ...rest } = recording;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(rest);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    imported++;
  }

  return { imported, skipped, total: recordings.length };
}

/**
 * Triggers a browser download of every recording as a single JSON file.
 * This is the file we'll feed into Phase 3 to build the recognition
 * engine, so it's worth keeping a backup copy of this export somewhere
 * safe once recording is done.
 */
export async function exportAllRecordingsAsFile() {
  const all = await getAllRecordings();
  const payload = {
    exportedAt: new Date().toISOString(),
    recordingCount: all.length,
    recordings: all,
  };

  const blob = new Blob([JSON.stringify(payload)], {
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
