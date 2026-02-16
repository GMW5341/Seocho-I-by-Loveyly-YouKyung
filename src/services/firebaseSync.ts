import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, type Firestore, type Unsubscribe,
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
let initialSnapshotReceived = false;

/** Check if the first Firestore snapshot has been received (safe to push) */
export function hasReceivedInitialSnapshot(): boolean {
  return initialSnapshotReceived;
}

export function getSyncConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

function initFirebase(config: FirebaseConfig): boolean {
  try {
    if (app && db) return true;
    // Reuse existing Firebase app if already initialized
    const existingApps = getApps();
    const defaultApp = existingApps.find(a => a.name === '[DEFAULT]');
    if (defaultApp) {
      app = defaultApp;
    } else {
      app = initializeApp(config);
    }
    db = getFirestore(app);
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    app = null;
    db = null;
    return false;
  }
}

/** Gather all localStorage data into a single object */
function gatherLocalData(): Record<string, string> {
  const data: Record<string, string> = {};
  ALL_STORAGE_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val) data[key] = val;
  });
  data._updatedAt = new Date().toISOString();
  return data;
}

/** Push current localStorage data to Firestore */
export async function pushToCloud(): Promise<boolean> {
  // Auto-initialize Firebase if needed
  if (!db) {
    const config = getSyncConfig();
    if (!config || !initFirebase(config)) return false;
  }
  if (!db) return false;
  const room = getSyncRoom();
  if (!room) return false;
  try {
    const data = gatherLocalData();
    lastPushTimestamp = data._updatedAt;
    await setDoc(doc(db, 'academies', room), data);
    return true;
  } catch (e) {
    console.error('Push to cloud failed:', e);
    return false;
  }
}

/**
 * Fetch cloud data ONCE and apply to localStorage.
 * Called BEFORE React renders so state initializes with cloud data.
 * Returns true if cloud data was applied.
 */
export async function fetchCloudData(): Promise<boolean> {
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return false;
  if (!initFirebase(config)) return false;
  if (!db) return false;

  try {
    const docRef = doc(db, 'academies', room);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      // No cloud data - push local data up
      await pushToCloud();
      return false;
    }

    const cloudData = snapshot.data();
    if (!cloudData) return false;

    const hasCloudData = ALL_STORAGE_KEYS.some(key => cloudData[key] !== undefined);
    if (!hasCloudData) {
      // Cloud doc exists but no real data - push local data up
      await pushToCloud();
      return false;
    }

    // Apply cloud data to localStorage
    ALL_STORAGE_KEYS.forEach(key => {
      const cloudVal = cloudData[key] as string | undefined;
      if (cloudVal !== undefined) {
        localStorage.setItem(key, cloudVal);
      }
    });

    // Set lastPushTimestamp so the realtime listener doesn't re-trigger
    if (cloudData._updatedAt) {
      lastPushTimestamp = cloudData._updatedAt as string;
    }

    return true;
  } catch (e) {
    console.error('Fetch cloud data failed:', e);
    return false;
  }
}

/** Start real-time listening for changes from OTHER devices (after initial load) */
export function startRealtimeSync(onDataReceived?: () => void): boolean {
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return false;

  if (!initFirebase(config)) return false;
  if (!db) return false;

  // Stop existing listener
  stopSync();
  initialSnapshotReceived = false;

  const docRef = doc(db, 'academies', room);
  unsubscribe = onSnapshot(docRef, (snapshot) => {
    initialSnapshotReceived = true;

    if (!snapshot.exists()) return;
    const cloudData = snapshot.data();
    if (!cloudData) return;

    // Skip our own writes
    if (cloudData._updatedAt && cloudData._updatedAt === lastPushTimestamp) return;

    // Apply cloud data to localStorage
    let changed = false;
    ALL_STORAGE_KEYS.forEach(key => {
      const cloudVal = cloudData[key] as string | undefined;
      const localVal = localStorage.getItem(key);
      if (cloudVal !== undefined && cloudVal !== localVal) {
        localStorage.setItem(key, cloudVal);
        changed = true;
      }
    });

    if (changed && onDataReceived) {
      onDataReceived();
    }
  }, (error) => {
    console.error('Realtime sync error:', error);
  });

  return true;
}

/** Stop real-time listener */
export function stopSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/** Test Firebase connection */
export async function testConnection(config: FirebaseConfig, room: string): Promise<{ success: boolean; message: string }> {
  let testApp: FirebaseApp | null = null;
  try {
    // Clean up any existing test app first
    const existing = getApps().find(a => a.name === 'test-connection');
    if (existing) await deleteApp(existing);

    testApp = initializeApp(config, 'test-connection');
    const testDb = getFirestore(testApp);
    const docRef = doc(testDb, 'academies', room);
    await setDoc(docRef, { _connectionTest: new Date().toISOString() }, { merge: true });
    await deleteApp(testApp);
    return { success: true, message: '연결 성공!' };
  } catch (e) {
    if (testApp) {
      try { await deleteApp(testApp); } catch { /* ignore cleanup error */ }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `연결 실패: ${msg}` };
  }
}

/** Upload JSON backup data directly to Firestore (bypasses all sync logic) */
export async function uploadJsonToCloud(
  jsonData: Record<string, unknown>,
  config?: FirebaseConfig,
  room?: string
): Promise<{ success: boolean; message: string }> {
  const useConfig = config || getSyncConfig();
  const useRoom = room || getSyncRoom();
  if (!useConfig || !useRoom) {
    return { success: false, message: 'Firebase 설정 또는 방 이름이 없습니다.' };
  }

  let uploadApp: FirebaseApp | null = null;
  try {
    // Use a separate app instance to avoid interfering with sync
    const existing = getApps().find(a => a.name === 'json-upload');
    if (existing) await deleteApp(existing);

    uploadApp = initializeApp(useConfig, 'json-upload');
    const uploadDb = getFirestore(uploadApp);

    // Build the cloud document from JSON data
    const cloudDoc: Record<string, string> = {
      _updatedAt: new Date().toISOString(),
    };

    // Support both old format (short keys) and new format (full keys)
    const keyMap: Record<string, string> = {
      students: 'seocho_students', schedules: 'seocho_schedules',
      attendance: 'seocho_attendance', payments: 'seocho_payments',
      holidays: 'seocho_holidays', settings: 'seocho_settings',
    };

    // New format (full storage keys)
    ALL_STORAGE_KEYS.forEach(key => {
      if (jsonData[key] != null) {
        cloudDoc[key] = typeof jsonData[key] === 'string'
          ? jsonData[key] as string
          : JSON.stringify(jsonData[key]);
      }
    });

    // Old format (short keys) as fallback
    Object.entries(keyMap).forEach(([shortKey, fullKey]) => {
      if (jsonData[shortKey] != null && !cloudDoc[fullKey]) {
        cloudDoc[fullKey] = typeof jsonData[shortKey] === 'string'
          ? jsonData[shortKey] as string
          : JSON.stringify(jsonData[shortKey]);
      }
    });

    const hasData = ALL_STORAGE_KEYS.some(key => cloudDoc[key] !== undefined);
    if (!hasData) {
      await deleteApp(uploadApp);
      return { success: false, message: 'JSON 파일에 유효한 데이터가 없습니다.' };
    }

    const docRef = doc(uploadDb, 'academies', useRoom);
    await setDoc(docRef, cloudDoc);
    await deleteApp(uploadApp);

    return { success: true, message: '클라우드에 업로드 완료!' };
  } catch (e) {
    if (uploadApp) {
      try { await deleteApp(uploadApp); } catch { /* ignore */ }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `업로드 실패: ${msg}` };
  }
}

/** Full setup: save config, enable sync, start listening */
export async function setupSync(
  config: FirebaseConfig,
  room: string,
  onDataReceived?: () => void
): Promise<boolean> {
  saveSyncConfig(config);
  saveSyncRoom(room);
  setSyncEnabled(true);

  // Reset module-level references (initFirebase will reuse existing app)
  app = null;
  db = null;
  if (!initFirebase(config)) return false;

  // If local has meaningful data, push it to cloud FIRST.
  // This prevents the realtime listener from overwriting local data with old cloud data.
  // For a new/empty device, skip the push so the listener can pull cloud data instead.
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
  } catch {
    return null;
  }
}
