"use client";

import {
  signInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { clientAuth } from "./firebase/client";

export interface LoggedInUser {
  uid: string;
  email: string;
  role: "admin" | "worker";
  name?: string;
  photoURL?: string;
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * Use localStorage (not IndexedDB) for auth persistence. IndexedDB throws
 * "the database connection is closing" in Safari / private mode / in-app
 * browsers — using localStorage avoids that whole class of failure.
 */
async function useSafePersistence() {
  try {
    await setPersistence(clientAuth(), browserLocalPersistence);
  } catch {
    /* fall back to default */
  }
}

/** Exchange a signed-in Firebase user for our httpOnly session cookie. */
async function completeLogin(user: User): Promise<LoggedInUser> {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  // Parse defensively — a crashed server can return an empty body.
  const data = await res.json().catch(() => ({}) as { error?: string; user?: LoggedInUser });
  if (!res.ok) {
    await signOut(clientAuth()).catch(() => {});
    throw new Error(data.error || `Sign-in failed (server error ${res.status}).`);
  }
  await user.getIdToken(true); // refresh so the role claim is present
  return data.user as LoggedInUser;
}

/**
 * Google Sign-In. Tries a popup (best desktop UX); if the popup is blocked,
 * closed, or storage is restricted (mobile Safari / in-app browsers), it falls
 * back to a full-page redirect. Returns null when a redirect was started —
 * the login page finishes it via completeGoogleRedirect() after the round-trip.
 */
export async function loginWithGoogle(): Promise<LoggedInUser | null> {
  const auth = clientAuth();
  await useSafePersistence();
  try {
    const cred = await signInWithPopup(auth, googleProvider());
    return await completeLogin(cred.user);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const blob = `${e.code || ""} ${e.message || ""}`.toLowerCase();
    const shouldRedirect =
      /popup|cancelled|closing|web-storage|storage|internal|network-request-failed|operation-not-supported/.test(
        blob
      );
    if (shouldRedirect) {
      await signInWithRedirect(auth, googleProvider()); // navigates away
      return null;
    }
    throw err;
  }
}

/** Call on the login page mount to finish a redirect-based sign-in. */
export async function completeGoogleRedirect(): Promise<LoggedInUser | null> {
  const auth = clientAuth();
  await useSafePersistence();
  let cred;
  try {
    cred = await getRedirectResult(auth);
  } catch {
    return null;
  }
  if (!cred?.user) return null;
  return await completeLogin(cred.user);
}

export async function logout() {
  try {
    await signOut(clientAuth());
  } catch {
    /* ignore */
  }
  await fetch("/api/auth/session", { method: "DELETE" });
}

/**
 * Ensure the Firebase client is signed in (needed for Firestore/Storage rules).
 * If the httpOnly session exists but the Firebase client lost its state (e.g.
 * page reload), we re-mint a custom token via the server.
 */
export async function ensureFirebaseSignedIn(): Promise<void> {
  const auth = clientAuth();
  if (auth.currentUser) return;
  const res = await fetch("/api/auth/refresh-token", { method: "POST" });
  if (!res.ok) return;
  const data = await res.json();
  if (data.customToken) {
    await signInWithCustomToken(auth, data.customToken);
  }
}
