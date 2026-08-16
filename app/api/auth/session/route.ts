import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getWorkerByUid } from "@/lib/repo";
import {
  clearSessionCookie,
  roleForEmail,
  setSessionCookie,
} from "@/lib/session";

/** Exchange a Firebase ID token for our signed httpOnly session cookie. */
export async function POST(req: NextRequest) {
  let idToken = "";
  try {
    const body = await req.json();
    idToken = String(body.idToken || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!idToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = (decoded.email || "").toLowerCase();
  const role = (decoded.role as "admin" | "worker") || roleForEmail(email);
  const worker = role === "worker" ? await getWorkerByUid(decoded.uid) : null;

  const res = NextResponse.json({
    ok: true,
    user: { uid: decoded.uid, email, role, name: worker?.name ?? "Admin" },
  });
  setSessionCookie(res, {
    uid: decoded.uid,
    email,
    role,
    name: worker?.name ?? (role === "admin" ? "Admin" : undefined),
  });
  return res;
}

/** Logout. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
