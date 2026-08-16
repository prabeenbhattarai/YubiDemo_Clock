import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getWorkerByEmail, recordWorkerLogin } from "@/lib/repo";
import { isAdminEmail, roleForEmail, setSessionCookie } from "@/lib/session";

/**
 * Google Sign-In: the client signs in with Google (Firebase), then posts the
 * resulting ID token here. We enforce that the account is a registered worker
 * or a configured admin, set the role claim, capture the Google photo, and
 * issue our session cookie. No OTP required.
 */
export async function POST(req: NextRequest) {
  let idToken = "";
  try {
    const body = await req.json();
    idToken = String(body.idToken || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Invalid Google sign-in." }, { status: 401 });
  }

  const email = (decoded.email || "").toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "No email on this Google account." }, { status: 400 });
  }

  const admin = isAdminEmail(email);
  const worker = admin ? null : await getWorkerByEmail(email);

  // Only pre-registered workers or configured admins may sign in.
  if (!admin && (!worker || worker.active === false)) {
    return NextResponse.json(
      {
        error:
          "This Google account isn't registered. Ask your administrator to add your email.",
      },
      { status: 403 }
    );
  }

  const role = admin ? "admin" : "worker";
  const photoURL = (decoded.picture as string) || undefined;
  const name = worker?.name || (decoded.name as string) || (admin ? "Admin" : undefined);

  // Set the role claim so Firestore rules can identify admins.
  await adminAuth.setCustomUserClaims(decoded.uid, { admin, role });

  // Link the auth uid + Google photo onto the worker record.
  if (worker) {
    await recordWorkerLogin(worker.id, { uid: decoded.uid, photoURL: photoURL ?? null });
  }

  const res = NextResponse.json({
    ok: true,
    user: { uid: decoded.uid, email, role: roleForEmail(email), name, photoURL },
  });
  setSessionCookie(res, { uid: decoded.uid, email, role, name, photoURL });
  return res;
}
