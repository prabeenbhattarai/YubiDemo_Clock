import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getWorkerByUid, now } from "@/lib/repo";
import { getSite, pingShift } from "@/lib/shift-repo";
import { checkGeofence } from "@/lib/geofence";
import type { GeoReading } from "@/lib/types";

/** Periodic live location update while on shift → powers admin monitoring. */
export async function POST(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.shiftId || !body?.siteId || !body?.location) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const worker = await getWorkerByUid(auth.user.uid);
  if (!worker) return NextResponse.json({ error: "Worker not found." }, { status: 404 });

  const site = await getSite(body.siteId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  const reading: GeoReading = {
    lat: Number(body.location.lat),
    lng: Number(body.location.lng),
    accuracy: body.location.accuracy != null ? Number(body.location.accuracy) : undefined,
    mocked: !!body.location.mocked,
    at: now(),
  };

  const geo = await checkGeofence(site, reading);
  try {
    await pingShift({
      shiftId: body.shiftId,
      workerUid: worker.uid!,
      reading,
      inside: geo.inside,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, inside: geo.inside, reason: geo.reason });
}
