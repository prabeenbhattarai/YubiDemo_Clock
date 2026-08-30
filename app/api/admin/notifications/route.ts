import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listRecentNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Recent notifications for the admin bell (server-read, works regardless of
 *  client Firestore rules / custom-claim propagation). */
export async function GET() {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const notifications = await listRecentNotifications(30);
  return NextResponse.json({ notifications });
}
