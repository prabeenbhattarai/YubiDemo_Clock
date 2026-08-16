import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signToken, verifyToken } from "./crypto";
import type { Role, SessionUser } from "./types";

export const SESSION_COOKIE = "ts_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

interface SessionPayload extends SessionUser {
  exp: number;
}

export function buildSessionCookieValue(user: SessionUser): string {
  return signToken({ ...user, exp: Date.now() + SESSION_TTL_MS });
}

/** Attach the session cookie to a response (httpOnly, secure in prod). */
export function setSessionCookie(res: NextResponse, user: SessionUser) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: buildSessionCookieValue(user),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

/** Read + verify the current session from the request cookies (server). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const payload = verifyToken<SessionPayload>(raw);
  if (!payload) return null;
  return {
    uid: payload.uid,
    email: payload.email,
    role: payload.role,
    name: payload.name,
    photoURL: payload.photoURL,
  };
}

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export function roleForEmail(email: string): Role {
  return isAdminEmail(email) ? "admin" : "worker";
}

/** Guard helper for API routes. Returns the user or a 401/403 NextResponse. */
export async function requireUser(
  role?: Role
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSession();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  if (role && user.role !== role) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user };
}
