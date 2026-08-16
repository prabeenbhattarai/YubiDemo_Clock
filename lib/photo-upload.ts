"use client";

import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { clientStorage, clientAuth } from "./firebase/client";
import { ensureFirebaseSignedIn } from "./client-auth";

/**
 * Upload a captured JPEG (data URL) to the worker's own Storage folder and
 * return a download URL to persist on the shift.
 */
export async function uploadShiftPhoto(dataUrl: string): Promise<string> {
  await ensureFirebaseSignedIn();
  const auth = clientAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");
  const path = `shift-photos/${uid}/${Date.now()}.jpg`;
  const storageRef = ref(clientStorage(), path);
  await uploadString(storageRef, dataUrl, "data_url", {
    contentType: "image/jpeg",
  });
  return getDownloadURL(storageRef);
}
