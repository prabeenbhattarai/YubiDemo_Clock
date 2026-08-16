import "server-only";
import { adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import type { NotificationType } from "./types";

/** Write an admin notification. Best-effort — never let it break the main flow. */
export async function createNotification(n: {
  type: NotificationType;
  message: string;
  workerName?: string;
  siteName?: string;
}) {
  try {
    await adminDb.collection(COL.notifications).add({
      type: n.type,
      message: n.message,
      workerName: n.workerName ?? null,
      siteName: n.siteName ?? null,
      at: now(),
      read: false,
    });
  } catch {
    /* notifications are non-critical */
  }
}

/** Mark all unread notifications as read (admin bell). */
export async function markAllNotificationsRead() {
  const snap = await adminDb
    .collection(COL.notifications)
    .where("read", "==", false)
    .limit(400)
    .get();
  if (snap.empty) return;
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}
