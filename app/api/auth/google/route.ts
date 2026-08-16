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
  // Outer guard: ANY unexpected failure returns JSON (never an empty 500),
  // so the client shows a real message instead of "Unexpected end of JSON input".
  try {
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
      // checkRevoked=false: verification of the signature is enough here and
      // avoids an extra Admin-backend call that needs elevated permissions.
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (e) {
      console.error("[auth/google] verifyIdToken failed:", (e as Error).message);
      return NextResponse.json(
        { error: "Could not verify Google sign-in. Check server Firebase credentials." },
        { status: 401 }
      );
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
  } catch (e) {
    console.error("[auth/google] unexpected error:", e);
    return NextResponse.json(
      { error: "Sign-in failed on the server. See server logs for details." },
      { status: 500 }
    );
  }
}
