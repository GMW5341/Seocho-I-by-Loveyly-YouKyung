import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, onSnapshot, type Firestore, type Unsubscribe,
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
let isSyncingFromCloud = false;

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
    if (app) return true;
    app = initializeApp(config);
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
  if (!db) return false;
  const room = getSyncRoom();
  if (!room) return false;
  try {
    isSyncingFromCloud = true;
    await setDoc(doc(db, 'academies', room), gatherLocalData());
    isSyncingFromCloud = false;
    return true;
  } catch (e) {
    console.error('Push to cloud failed:', e);
    isSyncingFromCloud = false;
    return false;
  }
}

/** Start real-time listening for changes from Firestore */
export function startRealtimeSync(onDataReceived?: () => void): boolean {
  const config = getSyncConfig();
  const room = getSyncRoom();
  if (!config || !room) return false;

  if (!initFirebase(config)) return false;
  if (!db) return false;

  // Stop existing listener
  stopSync();

  const docRef = doc(db, 'academies', room);
  unsubscribe = onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists()) {
      // No cloud data yet - push local data
      pushToCloud();
      return;
    }
    const cloudData = snapshot.data();
    if (!cloudData) return;

    // Avoid re-triggering when we just pushed
    if (isSyncingFromCloud) return;

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
  try {
    const testApp = initializeApp(config, 'test-connection');
    const testDb = getFirestore(testApp);
    const docRef = doc(testDb, 'academies', room);
    await setDoc(docRef, { _connectionTest: new Date().toISOString() }, { merge: true });
    // Clean up test app
    app = null;
    return { success: true, message: '연결 성공!' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `연결 실패: ${msg}` };
  }
}

/** Full setup: save config, enable sync, start listening */
export function setupSync(
  config: FirebaseConfig,
  room: string,
  onDataReceived?: () => void
): boolean {
  saveSyncConfig(config);
  saveSyncRoom(room);
  setSyncEnabled(true);

  // Re-initialize Firebase with potentially new config
  app = null;
  db = null;
  if (!initFirebase(config)) return false;

  // Push current data first, then start listening
  pushToCloud();
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
