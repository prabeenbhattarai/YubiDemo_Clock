import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getSession } from "@/lib/session";

/**
 * Re-mint a Firebase custom token for the already-authenticated session user.
 * Used to restore the Firebase client sign-in after a reload so Firestore /
 * Storage security rules can identify the user for real-time listeners.
 */
export async function POST() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const customToken = await adminAuth.createCustomToken(user.uid, {
    admin: user.role === "admin",
    role: user.role,
  });
  return NextResponse.json({ customToken });
}
