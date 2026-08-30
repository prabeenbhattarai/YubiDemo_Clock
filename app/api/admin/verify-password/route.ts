import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

/**
 * Verify the sensitive-action password server-side (so it is never shipped in
 * the client bundle). Override via the SENSITIVE_ACTION_PASSWORD env var;
 * falls back to the agreed default so it works without extra setup.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  const expected = process.env.SENSITIVE_ACTION_PASSWORD || "Auburn.syd2028!";
  let password = "";
  try {
    password = String((await req.json()).password || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
