import "server-only";
import { adminAuth, adminDb } from "./firebase/admin";
import { hmac } from "./crypto";
import { isAdminEmail } from "./session";
import type { Worker } from "./types";

export const COL = {
  sites: "sites",
  workers: "workers",
  shifts: "shifts",
  timesheets: "timesheets",
  otps: "otps",
  notifications: "notifications",
} as const;

export function now() {
  return Date.now();
}

// ---- Workers --------------------------------------------------------------

export async function getWorkerByEmail(email: string): Promise<Worker | null> {
  const snap = await adminDb
    .collection(COL.workers)
    .where("email", "==", email.toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Worker, "id">) };
}

export async function getWorkerByUid(uid: string): Promise<Worker | null> {
  const snap = await adminDb
    .collection(COL.workers)
    .where("uid", "==", uid)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Worker, "id">) };
}

export async function linkWorkerUid(workerId: string, uid: string) {
  await adminDb
    .collection(COL.workers)
    .doc(workerId)
    .set({ uid, updatedAt: now() }, { merge: true });
}

/** Record login details from the identity provider (uid, Google photo/name). */
export async function recordWorkerLogin(
  workerId: string,
  data: { uid: string; photoURL?: string | null }
) {
  const patch: Record<string, unknown> = { uid: data.uid, updatedAt: now() };
  if (data.photoURL) patch.photoURL = data.photoURL;
  await adminDb.collection(COL.workers).doc(workerId).set(patch, { merge: true });
}

/**
 * Ensure a Firebase Auth user exists for this email and carries the right
 * `admin` custom claim. Returns the uid.
 */
export async function ensureAuthUser(email: string): Promise<string> {
  const lower = email.toLowerCase();
  let uid: string;
  try {
    const existing = await adminAuth.getUserByEmail(lower);
    uid = existing.uid;
  } catch {
    const created = await adminAuth.createUser({
      email: lower,
      emailVerified: true,
    });
    uid = created.uid;
  }
  const admin = isAdminEmail(lower);
  await adminAuth.setCustomUserClaims(uid, { admin, role: admin ? "admin" : "worker" });
  return uid;
}

// ---- OTP -------------------------------------------------------------------

const OTP_TTL = Number(process.env.OTP_TTL_SECONDS || 300) * 1000;
const OTP_MAX = Number(process.env.OTP_MAX_ATTEMPTS || 5);

function otpId(email: string): string {
  // Store keyed by a hash of the email so raw addresses aren't collection ids.
  return hmac(email.toLowerCase()).slice(0, 40);
}

export async function saveOtp(email: string, code: string) {
  const ref = adminDb.collection(COL.otps).doc(otpId(email));
  await ref.set({
    emailHash: hmac(email.toLowerCase()),
    codeHash: hmac(code),
    expiresAt: now() + OTP_TTL,
    attempts: 0,
    createdAt: now(),
  });
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyOtp(email: string, code: string): Promise<OtpCheck> {
  const ref = adminDb.collection(COL.otps).doc(otpId(email));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "No code found. Request a new one." };
  const data = snap.data()!;
  if (now() > data.expiresAt) {
    await ref.delete();
    return { ok: false, reason: "Code expired. Request a new one." };
  }
  if ((data.attempts ?? 0) >= OTP_MAX) {
    await ref.delete();
    return { ok: false, reason: "Too many attempts. Request a new one." };
  }
  if (data.codeHash !== hmac(code)) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return { ok: false, reason: "Incorrect code." };
  }
  await ref.delete();
  return { ok: true };
}

/** Basic per-email throttle: refuse a new send within the cooldown window. */
export async function canSendOtp(email: string): Promise<boolean> {
  const ref = adminDb.collection(COL.otps).doc(otpId(email));
  const snap = await ref.get();
  if (!snap.exists) return true;
  const data = snap.data()!;
  const age = now() - (data.createdAt ?? 0);
  return age > 30_000; // 30s cooldown
}
