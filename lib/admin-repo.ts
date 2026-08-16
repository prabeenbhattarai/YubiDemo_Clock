import "server-only";
import { adminAuth, adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import type { GeofenceType, Site, Worker } from "./types";

// ---- Sites -----------------------------------------------------------------

export interface SiteInput {
  name: string;
  address: string;
  location: { lat: number; lng: number };
  geofenceType: GeofenceType;
  radiusMeters?: number;
  state?: string;
  country?: string;
  countryCode?: string;
  photoRequired: boolean;
  active?: boolean;
}

function cleanSite(input: SiteInput) {
  const base: Record<string, unknown> = {
    name: input.name.trim(),
    address: input.address.trim(),
    location: { lat: Number(input.location.lat), lng: Number(input.location.lng) },
    geofenceType: input.geofenceType,
    photoRequired: !!input.photoRequired,
    active: input.active !== false,
    updatedAt: now(),
  };
  if (input.geofenceType === "radius") {
    base.radiusMeters = Math.max(20, Math.round(input.radiusMeters ?? 150));
  }
  if (input.geofenceType === "state") {
    base.state = input.state ?? null;
    base.country = input.country ?? null;
    base.countryCode = input.countryCode ?? null;
  }
  if (input.geofenceType === "country") {
    base.country = input.country ?? null;
    base.countryCode = input.countryCode ?? null;
  }
  return base;
}

export async function createSite(input: SiteInput): Promise<string> {
  const ref = await adminDb
    .collection(COL.sites)
    .add({ ...cleanSite(input), createdAt: now() });
  return ref.id;
}

export async function updateSite(id: string, input: SiteInput) {
  await adminDb.collection(COL.sites).doc(id).set(cleanSite(input), { merge: true });
}

export async function deleteSite(id: string) {
  await adminDb.collection(COL.sites).doc(id).delete();
}

export async function listSites(): Promise<Site[]> {
  const snap = await adminDb.collection(COL.sites).orderBy("name").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Site, "id">) }));
}

// ---- Workers ---------------------------------------------------------------

export interface WorkerInput {
  name: string;
  email: string;
  assignedSiteIds: string[];
  active?: boolean;
}

export async function createWorker(input: WorkerInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const dup = await adminDb
    .collection(COL.workers)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!dup.empty) throw new Error("A worker with this email already exists.");

  const ref = await adminDb.collection(COL.workers).add({
    name: input.name.trim(),
    email,
    assignedSiteIds: input.assignedSiteIds ?? [],
    active: input.active !== false,
    createdAt: now(),
    updatedAt: now(),
  });
  return ref.id;
}

export async function updateWorker(id: string, input: WorkerInput) {
  await adminDb.collection(COL.workers).doc(id).set(
    {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      assignedSiteIds: input.assignedSiteIds ?? [],
      active: input.active !== false,
      updatedAt: now(),
    },
    { merge: true }
  );
}

export async function deleteWorker(id: string) {
  const doc = await adminDb.collection(COL.workers).doc(id).get();
  const data = doc.data() as Worker | undefined;
  await adminDb.collection(COL.workers).doc(id).delete();
  // Best-effort: disable the auth user so they can no longer sign in.
  if (data?.uid) {
    try {
      await adminAuth.updateUser(data.uid, { disabled: true });
    } catch {
      /* ignore */
    }
  }
}

export async function listWorkers(): Promise<Worker[]> {
  const snap = await adminDb.collection(COL.workers).orderBy("name").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Worker, "id">) }));
}
