import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { markAllNotificationsRead } from "@/lib/notify";

/** Mark all notifications as read (called when the admin opens the bell). */
export async function POST() {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  await markAllNotificationsRead();
  return NextResponse.json({ ok: true });
}
