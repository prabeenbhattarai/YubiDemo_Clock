import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getWorkerByUid, now } from "@/lib/repo";
import { endShift, getActiveShift, getSite } from "@/lib/shift-repo";
import { checkGeofence, reverseGeocodeAddress } from "@/lib/geofence";
import { createNotification } from "@/lib/notify";
import type { GeoReading } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);

  const worker = await getWorkerByUid(auth.user.uid);
  if (!worker) return NextResponse.json({ error: "Worker not found." }, { status: 404 });

  const shift = await getActiveShift(worker.uid!);
  if (!shift) return NextResponse.json({ error: "No active shift." }, { status: 404 });

  const site = await getSite(shift.siteId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  // Clock-out must always succeed. Location is optional: prefer the reading the
  // client sends, else fall back to the last live ping tracked during the shift.
  const src = body?.location ?? shift.lastPing ?? shift.startLocation ?? null;
  const reading: GeoReading | null = src
    ? {
        lat: Number(src.lat),
        lng: Number(src.lng),
        accuracy: src.accuracy != null ? Number(src.accuracy) : undefined,
        mocked: !!src.mocked,
        at: now(),
      }
    : null;

  // A photo is still required if the site mandates it.
  if (site.photoRequired && !body?.photoUrl) {
    return NextResponse.json(
      { error: "A photo is required to end this shift.", code: "PHOTO_REQUIRED" },
      { status: 422 }
    );
  }

  // Record whether they were inside for the admin's review — never block on it.
  const geo = reading ? await checkGeofence(site, reading) : { inside: false, reason: "No location" };
  const address = reading ? (await reverseGeocodeAddress(reading)) ?? undefined : undefined;

  const { durationMinutes: minutes, underworked, reason } = await endShift({
    shiftId: shift.id,
    worker,
    reading: reading ?? shift.startLocation,
    photoUrl: body?.photoUrl,
    comment: body?.comment,
    inside: geo.inside,
    address,
    site,
  });

  if (underworked) {
    await createNotification({
      type: "out_of_range",
      message: `${worker.name} ${reason} at ${site.name} (under scheduled hours)`,
      workerName: worker.name,
      siteName: site.name,
    });
  }

  await createNotification({
    type: "clock_out",
    message: `${worker.name} clocked out of ${site.name}`,
    workerName: worker.name,
    siteName: site.name,
  });

  return NextResponse.json({ ok: true, durationMinutes: minutes });
}
