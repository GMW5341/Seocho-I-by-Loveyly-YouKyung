import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, collection, getDocs, writeBatch,
  type Firestore, type Unsubscribe,
} from 'firebase/firestore';

// All localStorage keys used by the app
const ALL_STORAGE_KEYS = [
  'seocho_students', 'seocho_schedules', 'seocho_attendance', 'seocho_payments',
  'seocho_holidays', 'seocho_settings', 'seocho_trial_students', 'seocho_trial_lessons',
  'seocho_curriculum', 'seocho_message_templates', 'seocho_special_classes',
  'seocho_special_class_students', 'seocho_logo',
];

const SYNC_CONFIG_KEY = 'seocho_firebase_config';
const SYNC_ROOM_KEY = 'seocho_sync_room';
const SYNC_ENABLED_KEY = 'seocho_sync_enabled';
const DATA_SUB = 'data'; // subcollection name
const MAX_FIELD_BYTES = 800_000; // safe limit (Firestore max ~1,048,487)

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let unsubscribe: Unsubscribe | null = null;
let lastPushTimestamp = '';
let pushInProgress = false;
let initialSnapshotReceived = false;

// ─── Helpers ───────────────────────────────────────────────

const encoder = new TextEncoder();
function byteLen(s: string): number { return encoder.encode(s).byteLength; }

/** Split a string into chunks that each fit within maxBytes (UTF-8) */
function chunkString(s: string, maxBytes: number): string[] {
  if (byteLen(s) <= maxBytes) return [s];
  const chunks: string[] = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(s.length, start + maxBytes);
    let chunk = s.slice(start, end);
    while (byteLen(chunk) > maxBytes && end > start + 1) {
      end = Math.floor(start + (end - start) * 0.8);
      chunk = s.slice(start, end);
    }
    chunks.push(chunk);
    start = end;
  }
  return chunks;
}

// ─── Config getters/setters ────────────────────────────────

export function getSyncConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveSyncConfig(config: FirebaseConfig): void {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}
export function getSyncRoom(): string {
  return localStorage.getItem(SYNC_ROOM_KEY) || '';
}
export function saveSyncRoom(room: string): void {
  localStorage.setItem(SYNC_ROOM_KEY, room);
}
export function isSyncEnabled(): boolean {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}
export function setSyncEnabled(enabled: boolean): void {
  localStorage.setItem(SYNC_ENABLED_KEY, String(enabled));
}
export function hasReceivedInitialSnapshot(): boolean {
  return initialSnapshotReceived;
}

// ─── Firebase init ─────────────────────────────────────────

function initFirebase(config: FirebaseConfig): boolean {
  try {
    if (app && db) return true;
    const existing = getApps().find(a => a.name === '[DEFAULT]');
    app = existing || initializeApp(config);
    db = getFirestore(app);
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    app = null; db = null;
    return false;
  }
}

// ─── Core read/write (subcollection format) ────────────────

/**
 * Write data to Firestore using per-key subcollection documents.
 * Large values are automatically chunked.
 *
 * Structure:
 *   academies/{room}              → { _updatedAt, _version: 2 }
 *   academies/{room}/data/{key}   → { v: "..." }                    (small value)
 *   academies/{room}/data/{key}   → { _chunked: true, _count: N }   (large value metadata)
 *   academies/{room}/data/{key}__0 → { v: "chunk0" }
 *   academies/{room}/data/{key}__1 → { v: "chunk1" }
 */
async function writeCloudData(
  firestore: Firestore,
  room: string,
  kvData: Record<string, string>,
  updatedAt?: string,
): Promise<string> {
  const ts = updatedAt || new Date().toISOString();
  const roomRef = doc(firestore, 'academies', room);

  // Write each key in its own batch to avoid Firestore 10MB batch size limit.
  // Large keys (e.g. curriculum with base64 images) could exceed the limit
  // if combined with other data in a single batch.
  for (const key of ALL_STORAGE_KEYS) {
    const val = kvData[key];
    if (val === undefined || val === '') continue;

    const keyBatch = writeBatch(firestore);
    const keyRef = doc(firestore, 'academies', room, DATA_SUB, key);

    if (byteLen(val) <= MAX_FIELD_BYTES) {
      keyBatch.set(keyRef, { v: val });
    } else {
      const chunks = chunkString(val, MAX_FIELD_BYTES);
      keyBatch.set(keyRef, { _chunked: true, _count: chunks.length });
      for (let i = 0; i < chunks.length; i++) {
        const chunkRef = doc(firestore, 'academies', room, DATA_SUB, `${key}__${i}`);
        keyBatch.set(chunkRef, { v: chunks[i] });
      }
    }

    await keyBatch.commit();
  }

  // Write metadata document last (after all data keys succeed)
  await setDoc(roomRef, { _updatedAt: ts, _version: 2 });
  return ts;
}

/**
 * Read all data from Firestore.
 * Supports both old format (single doc) and new format (subcollection).
 */
async function readCloudData(
  firestore: Firestore,
  room: string,
): Promise<{ data: Record<string, string>; updatedAt: string } | null> {
  const roomRef = doc(firestore, 'academies', room);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return null;

  const meta = roomSnap.data();

  // ── New format (v2): subcollection ──
  if (meta._version === 2) {
    const colRef = collection(firestore, 'academies', room, DATA_SUB);
    const colSnap = await getDocs(colRef);

    // Organize docs by key name
    const docsMap = new Map<string, Record<string, unknown>>();
    colSnap.forEach(d => docsMap.set(d.id, d.data()));

    const result: Record<string, string> = {};
    for (const key of ALL_STORAGE_KEYS) {
      const d = docsMap.get(key);
      if (!d) continue;

      if (d._chunked) {
        // Reassemble chunks
        const count = d._count as number;
        let assembled = '';
        for (let i = 0; i < count; i++) {
          const chunkDoc = docsMap.get(`${key}__${i}`);
          if (chunkDoc) assembled += chunkDoc.v as string;
        }
        result[key] = assembled;
      } else {
        result[key] = d.v as string;
      }
    }

    return { data: result, updatedAt: (meta._updatedAt as string) || '' };
  }

  // ── Old format (v1): single document ──
  const result: Record<string, string> = {};
  for (const key of ALL_STORAGE_KEYS) {
    if (meta[key] !== undefined) result[key] = meta[key] as string;
  }
  return { data: result, updatedAt: (meta._updatedAt as string) || '' };
}

// ─── Public API ────────────────────────────────────────────

/** Gather all localStorage data */
function gatherLocalData(): Record<string, string> {
  const data: Record<string, string> = {};
  ALL_STORAGE_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val) data[key] = val;
  });
  return data;
}

/** Push current localStorage data to Firestore */
export async function pushToCloud(): Promise<boolean> {
  if (!db) {
    const config = getSyncConfig();
    if (!config || !initFirebase(config)) return false;
  }
  if (!db) return false;
  const room = getSyncRoom();
  if (!room) return false;
  pushInProgress = true;
  try {
    const data = gatherLocalData();
    // Pre-set the expected timestamp so the listener can skip our own write
    const expectedTs = new Date().toISOString();
    lastPushTimestamp = expectedTs;
    await writeCloudData(db, room, data, expectedTs);
    return true;
  } catch (e) {
    console.error('Push to cloud failed:', e);
    return false;
  } finally {
    // Keep the flag a bit longer to cover any delayed listener callbacks
    setTimeout(() => { pushInProgress = false; }, 3000);
  }
}

/** Fetch cloud data ONCE and apply to localStorage (before React renders) */
export async function fetchCloudData(): Promise<boolean> {
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return false;
  if (!initFirebase(config)) return false;
  if (!db) return false;

  try {
    const result = await readCloudData(db, room);

    if (!result) {
      await pushToCloud();
      return false;
    }

    const hasData = ALL_STORAGE_KEYS.some(key => result.data[key] !== undefined);
    if (!hasData) {
      await pushToCloud();
      return false;
    }

    // Apply to localStorage (with error handling for quota exceeded)
    ALL_STORAGE_KEYS.forEach(key => {
      if (result.data[key] !== undefined) {
        try {
          localStorage.setItem(key, result.data[key]);
        } catch (e) {
          console.error(`Failed to write ${key} to localStorage:`, e);
        }
      }
    });

    lastPushTimestamp = result.updatedAt;
    return true;
  } catch (e) {
    console.error('Fetch cloud data failed:', e);
    return false;
  }
}

/** Start real-time listening for changes from OTHER devices */
export function startRealtimeSync(onDataReceived?: () => void): boolean {
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return false;
  if (!initFirebase(config)) return false;
  if (!db) return false;

  stopSync();
  initialSnapshotReceived = false;

  const capturedDb = db;
  const roomRef = doc(capturedDb, 'academies', room);

  // Listen to the metadata document only; when _updatedAt changes, fetch full data
  unsubscribe = onSnapshot(roomRef, async (snapshot) => {
    initialSnapshotReceived = true;
    if (!snapshot.exists()) return;

    const meta = snapshot.data();
    if (!meta) return;

    // Skip our own writes (check both flag and timestamp)
    if (pushInProgress) return;
    if (meta._updatedAt && meta._updatedAt === lastPushTimestamp) return;

    try {
      const result = await readCloudData(capturedDb, room);
      if (!result) return;

      let changed = false;
      ALL_STORAGE_KEYS.forEach(key => {
        const cloudVal = result.data[key];
        const localVal = localStorage.getItem(key);
        if (cloudVal !== undefined && cloudVal !== localVal) {
          try {
            localStorage.setItem(key, cloudVal);
            changed = true;
          } catch (e) {
            console.error(`Realtime sync: failed to write ${key} to localStorage:`, e);
          }
        }
      });

      if (changed) {
        lastPushTimestamp = result.updatedAt;
        if (onDataReceived) onDataReceived();
      }
    } catch (e) {
      console.error('Realtime sync read failed:', e);
    }
  }, (error) => {
    console.error('Realtime sync error:', error);
  });

  return true;
}

/** Stop real-time listener */
export function stopSync(): void {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

/** Test Firebase connection */
export async function testConnection(
  config: FirebaseConfig, room: string,
): Promise<{ success: boolean; message: string }> {
  let testApp: FirebaseApp | null = null;
  try {
    const existing = getApps().find(a => a.name === 'test-connection');
    if (existing) await deleteApp(existing);

    testApp = initializeApp(config, 'test-connection');
    const testDb = getFirestore(testApp);
    const docRef = doc(testDb, 'academies', room);
    await setDoc(docRef, { _connectionTest: new Date().toISOString() }, { merge: true });
    await deleteApp(testApp);
    return { success: true, message: '연결 성공!' };
  } catch (e) {
    if (testApp) { try { await deleteApp(testApp); } catch { /* ignore */ } }
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `연결 실패: ${msg}` };
  }
}

/** Upload JSON backup directly to Firestore (bypasses sync logic) */
export async function uploadJsonToCloud(
  jsonData: Record<string, unknown>,
  config?: FirebaseConfig,
  room?: string,
): Promise<{ success: boolean; message: string }> {
  const useConfig = config || getSyncConfig();
  const useRoom = room || getSyncRoom();
  if (!useConfig || !useRoom) {
    return { success: false, message: 'Firebase 설정 또는 방 이름이 없습니다.' };
  }

  let uploadApp: FirebaseApp | null = null;
  try {
    const existing = getApps().find(a => a.name === 'json-upload');
    if (existing) await deleteApp(existing);

    uploadApp = initializeApp(useConfig, 'json-upload');
    const uploadDb = getFirestore(uploadApp);

    // Build key-value map from JSON (support old & new key formats)
    const kvData: Record<string, string> = {};
    const keyMap: Record<string, string> = {
      students: 'seocho_students', schedules: 'seocho_schedules',
      attendance: 'seocho_attendance', payments: 'seocho_payments',
      holidays: 'seocho_holidays', settings: 'seocho_settings',
    };

    ALL_STORAGE_KEYS.forEach(key => {
      if (jsonData[key] != null) {
        kvData[key] = typeof jsonData[key] === 'string'
          ? jsonData[key] as string : JSON.stringify(jsonData[key]);
      }
    });
    Object.entries(keyMap).forEach(([shortKey, fullKey]) => {
      if (jsonData[shortKey] != null && !kvData[fullKey]) {
        kvData[fullKey] = typeof jsonData[shortKey] === 'string'
          ? jsonData[shortKey] as string : JSON.stringify(jsonData[shortKey]);
      }
    });

    const hasData = ALL_STORAGE_KEYS.some(key => kvData[key] !== undefined);
    if (!hasData) {
      await deleteApp(uploadApp);
      return { success: false, message: 'JSON 파일에 유효한 데이터가 없습니다.' };
    }

    await writeCloudData(uploadDb, useRoom, kvData);
    await deleteApp(uploadApp);
    return { success: true, message: '클라우드에 업로드 완료!' };
  } catch (e) {
    if (uploadApp) { try { await deleteApp(uploadApp); } catch { /* ignore */ } }
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `업로드 실패: ${msg}` };
  }
}

/** Full setup: save config, enable sync, start listening */
export async function setupSync(
  config: FirebaseConfig,
  room: string,
  onDataReceived?: () => void,
): Promise<boolean> {
  saveSyncConfig(config);
  saveSyncRoom(room);
  setSyncEnabled(true);
  app = null; db = null;
  if (!initFirebase(config)) return false;

  // If local has data, push first so listener doesn't overwrite it
  const localData = gatherLocalData();
  const hasLocalData = ALL_STORAGE_KEYS.some(key => {
    const val = localData[key];
    return val !== undefined && val !== '[]' && val !== '';
  });
  if (hasLocalData) {
    await pushToCloud();
  }

  return startRealtimeSync(onDataReceived);
}

/** Initialize sync on app startup if previously configured */
export function initSyncOnStartup(onDataReceived?: () => void): boolean {
  if (!isSyncEnabled()) return false;
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return false;
  if (!initFirebase(config)) return false;
  return startRealtimeSync(onDataReceived);
}

/** Generate a shareable URL that auto-configures sync on other devices */
export function generateSyncUrl(): string {
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return '';
  const data = JSON.stringify({ c: config, r: room });
  const encoded = encodeURIComponent(data);
  return `${window.location.origin}${window.location.pathname}#sync=${encoded}`;
}

/** Check if current URL contains sync config (from shared link) */
export function checkUrlForSyncConfig(): { config: FirebaseConfig; room: string } | null {
  try {
    const hash = window.location.hash;
    if (!hash.startsWith('#sync=')) return null;
    const encoded = hash.slice(6);
    const data = JSON.parse(decodeURIComponent(encoded));
    if (data.c && data.r && data.c.apiKey && data.c.projectId) {
      return { config: data.c, room: data.r };
    }
    return null;
  } catch { return null; }
}
