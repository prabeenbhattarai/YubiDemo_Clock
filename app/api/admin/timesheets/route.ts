import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createAdminTimesheet } from "@/lib/timesheet-repo";

export const dynamic = "force-dynamic";

/** Admin adds a casual timesheet (no registered worker required). */
export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  const b = (await req.json().catch(() => null)) as
    | {
        workerName?: string;
        siteLabel?: string;
        placeAddress?: string;
        location?: { lat: number; lng: number } | null;
        startAt?: number;
        endAt?: number;
        breakMinutes?: number;
        breakPaid?: boolean;
        periodStart?: string;
      }
    | null;

  if (!b?.siteLabel?.trim()) return NextResponse.json({ error: "Enter a location." }, { status: 400 });
  if (!(Number(b.startAt) > 0) || !(Number(b.endAt) > 0))
    return NextResponse.json({ error: "Start and end times are required." }, { status: 400 });
  if (Number(b.endAt) <= Number(b.startAt))
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  const brk = Number(b.breakMinutes);
  if (!Number.isFinite(brk) || brk < 0 || brk > 600)
    return NextResponse.json({ error: "Break must be 0–600 minutes." }, { status: 400 });

  const id = await createAdminTimesheet({
    workerName: b.workerName,
    siteLabel: b.siteLabel,
    placeAddress: b.placeAddress,
    location: b.location ?? null,
    startAt: Number(b.startAt),
    endAt: Number(b.endAt),
    breakMinutes: brk,
    breakPaid: !!b.breakPaid,
    periodStart: b.periodStart,
    by: auth.user.email,
  });
  return NextResponse.json({ ok: true, id });
}
