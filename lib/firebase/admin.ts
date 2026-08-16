import "server-only";
import {
  initializeApp,
  getApps,
  getApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "demo-timesheet";

// Point the Admin SDK at the local emulators when in dev mode.
if (USE_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
}

function createApp(): App {
  if (getApps().length) return getApp();

  // Production: real service account credentials are REQUIRED.
  if (!USE_EMULATOR) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw || raw.trim() === "" || raw.includes("BEGIN PRIVATE KEY-----\\n...")) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT is missing or is still the placeholder. " +
          "Set it in your host's environment variables to the full service-account JSON (one line)."
      );
    }
    let svc: { project_id?: string };
    try {
      svc = JSON.parse(raw);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the ENTIRE key file as a single line " +
          '(use: node -e "console.log(JSON.stringify(require(\'./key.json\')))").'
      );
    }
    return initializeApp({
      credential: cert(svc as Parameters<typeof cert>[0]),
      projectId: svc.project_id || PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }

  // Emulator: no real credentials required.
  return initializeApp({
    projectId: PROJECT_ID,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      `${PROJECT_ID}.appspot.com`,
  });
}

// ---------------------------------------------------------------------------
// LAZY initialization. Firebase Admin is created on first *use*, not at import.
// This keeps the Next.js build (which imports route modules to collect page
// data) from ever needing runtime credentials. Missing/invalid credentials
// therefore surface at request time as a clean JSON error, not a build crash.
// ---------------------------------------------------------------------------
let _app: App | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: Storage | null = null;

function app(): App {
  return (_app ??= createApp());
}
function authInstance(): Auth {
  return (_auth ??= getAuth(app()));
}
function dbInstance(): Firestore {
  if (!_db) {
    _db = getFirestore(app());
    // Strip `undefined` values instead of throwing (e.g. optional history notes).
    try {
      _db.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* already configured */
    }
  }
  return _db;
}
function storageInstance(): Storage {
  return (_storage ??= getStorage(app()));
}

/** Proxy that defers initialization until a property is actually accessed. */
function lazy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = getTarget() as Record<PropertyKey, unknown>;
      const value = target[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

export const adminAuth: Auth = lazy(authInstance);
export const adminDb: Firestore = lazy(dbInstance);
export const adminStorage: Storage = lazy(storageInstance);
