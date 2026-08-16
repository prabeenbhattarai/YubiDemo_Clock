import "server-only";
import { adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import { autoBreakMinutes } from "./time";
import type {
  GeoReading,
  HistoryEntry,
  Shift,
  Site,
  Worker,
} from "./types";

export async function getSite(id: string): Promise<Site | null> {
  const doc = await adminDb.collection(COL.sites).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Omit<Site, "id">) };
}

export async function getActiveShift(workerUid: string): Promise<Shift | null> {
  const snap = await adminDb
    .collection(COL.shifts)
    .where("workerUid", "==", workerUid)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<Shift, "id">) };
}

export async function startShift(params: {
  worker: Worker;
  site: Site;
  reading: GeoReading;
  photoUrl?: string;
  inside: boolean;
  address?: string;
}): Promise<string> {
  const { worker, site, reading, photoUrl, inside, address } = params;
  const t = now();
  const history: HistoryEntry[] = [
    { at: t, by: worker.email, action: "Shift started" },
  ];
  const ref = await adminDb.collection(COL.shifts).add({
    workerId: worker.id,
    workerUid: worker.uid,
    workerName: worker.name,
    siteId: site.id,
    siteName: site.name,
    status: "active",
    startedAt: t,
    startLocation: reading,
    startPhotoUrl: photoUrl ?? null,
    startAddress: address ?? null,
    lastPing: { ...reading, inside },
    currentlyInside: inside,
    track: [{ ...reading, inside }],
    approvalStatus: "pending",
    history,
    createdAt: t,
    updatedAt: t,
  });
  return ref.id;
}

export async function pingShift(params: {
  shiftId: string;
  workerUid: string;
  reading: GeoReading;
  inside: boolean;
}) {
  const { shiftId, workerUid, reading, inside } = params;
  const ref = adminDb.collection(COL.shifts).doc(shiftId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Shift not found");
  const data = doc.data() as Shift;
  if (data.workerUid !== workerUid) throw new Error("Forbidden");
  if (data.status !== "active") throw new Error("Shift not active");

  // Append to the breadcrumb trail, capped to keep the doc small.
  const point = { ...reading, inside };
  const track = [...(data.track ?? []), point].slice(-600);

  await ref.update({
    lastPing: point,
    currentlyInside: inside,
    track,
    updatedAt: now(),
  });
}

export async function endShift(params: {
  shiftId: string;
  worker: Worker;
  reading: GeoReading;
  photoUrl?: string;
  comment?: string;
  inside: boolean;
  address?: string;
}) {
  const { shiftId, worker, reading, photoUrl, comment, inside, address } = params;
  const ref = adminDb.collection(COL.shifts).doc(shiftId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Shift not found");
  const data = doc.data() as Shift;
  if (data.workerUid !== worker.uid) throw new Error("Forbidden");
  if (data.status !== "active") throw new Error("Shift already ended");

  const t = now();
  const durationMinutes = Math.max(0, Math.round((t - data.startedAt) / 60000));
  const breakMinutes = autoBreakMinutes(durationMinutes);
  const history: HistoryEntry[] = [
    ...(data.history ?? []),
    { at: t, by: worker.email, action: "Shift ended", note: comment || undefined },
    ...(breakMinutes > 0
      ? [{ at: t, by: "system", action: `Auto ${breakMinutes}-min break applied (>4h shift)` }]
      : []),
  ];
  const endPoint = { ...reading, inside };
  const track = [...(data.track ?? []), endPoint].slice(-600);

  await ref.update({
    status: "completed",
    endedAt: t,
    endLocation: reading,
    endPhotoUrl: photoUrl ?? null,
    endComment: comment ?? null,
    endAddress: address ?? null,
    lastPing: endPoint,
    currentlyInside: inside,
    track,
    durationMinutes,
    breakMinutes,
    history,
    updatedAt: t,
  });
  return durationMinutes;
}
