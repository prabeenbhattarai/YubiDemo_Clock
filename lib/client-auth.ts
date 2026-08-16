"use client";

import {
  signInWithCustomToken,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { clientAuth } from "./firebase/client";

/**
 * Google Sign-In: open the Google popup, then exchange the ID token for our
 * httpOnly session cookie. Returns the logged-in user (incl. photoURL).
 */
export async function loginWithGoogle(): Promise<LoggedInUser> {
  const auth = clientAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const cred = await signInWithPopup(auth, provider);
  const idToken = await cred.user.getIdToken();

  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json();
  if (!res.ok) {
    // Not authorised — sign back out so no stale Firebase session lingers.
    await signOut(auth).catch(() => {});
    throw new Error(data.error || "Sign-in failed.");
  }
  // Refresh so the new role claim is present for Firestore rules.
  await cred.user.getIdToken(true);
  return data.user as LoggedInUser;
}

export interface LoggedInUser {
  uid: string;
  email: string;
  role: "admin" | "worker";
  name?: string;
  photoURL?: string;
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
