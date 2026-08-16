import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getWorkerByUid, now } from "@/lib/repo";
import { getActiveShift, getSite, startShift } from "@/lib/shift-repo";
import { checkGeofence, readingQuality, reverseGeocodeAddress } from "@/lib/geofence";
import { createNotification } from "@/lib/notify";
import type { GeoReading } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.siteId || !body?.location) {
    return NextResponse.json({ error: "Missing site or location." }, { status: 400 });
  }

  const worker = await getWorkerByUid(auth.user.uid);
  if (!worker) return NextResponse.json({ error: "Worker not found." }, { status: 404 });

  // Prevent double clock-in.
  const existing = await getActiveShift(worker.uid!);
  if (existing) {
    return NextResponse.json(
      { error: "You already have an active shift.", shiftId: existing.id },
      { status: 409 }
    );
  }

  const site = await getSite(body.siteId);
  if (!site || site.active === false) {
    return NextResponse.json({ error: "Site not available." }, { status: 404 });
  }
  if (!worker.assignedSiteIds?.includes(site.id)) {
    return NextResponse.json({ error: "You are not assigned to this site." }, { status: 403 });
  }

  // Server-stamped, quality-checked reading (client GPS is never trusted alone).
  const reading: GeoReading = {
    lat: Number(body.location.lat),
    lng: Number(body.location.lng),
    accuracy: body.location.accuracy != null ? Number(body.location.accuracy) : undefined,
    mocked: !!body.location.mocked,
    at: now(),
  };

  const q = readingQuality(reading);
  if (!q.ok) return NextResponse.json({ error: q.reason }, { status: 422 });

  const geo = await checkGeofence(site, reading);
  if (!geo.inside) {
    return NextResponse.json(
      { error: geo.reason, code: "OUT_OF_RANGE", detail: geo },
      { status: 422 }
    );
  }

  if (site.photoRequired && !body.photoUrl) {
    return NextResponse.json(
      { error: "A photo is required to start this shift.", code: "PHOTO_REQUIRED" },
      { status: 422 }
    );
  }

  const address = (await reverseGeocodeAddress(reading)) ?? site.address;

  const shiftId = await startShift({
    worker,
    site,
    reading,
    photoUrl: body.photoUrl,
    inside: true,
    address,
  });

  await createNotification({
    type: "clock_in",
    message: `${worker.name} clocked in at ${site.name}`,
    workerName: worker.name,
    siteName: site.name,
  });

  return NextResponse.json({ ok: true, shiftId, geofence: geo });
}
