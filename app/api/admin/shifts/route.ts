import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createAdminShift } from "@/lib/shift-repo";

export const dynamic = "force-dynamic";

/** Admin adds a completed clock-in shift by hand (worker forgot to clock in). */
export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  const b = (await req.json().catch(() => null)) as
    | {
        workerId?: string;
        workerUid?: string;
        workerName?: string;
        siteId?: string;
        siteName?: string;
        startedAt?: number;
        endedAt?: number;
        breakMinutes?: number | null;
      }
    | null;

  if (!b?.workerUid || !b?.workerId || !b?.workerName?.trim())
    return NextResponse.json({ error: "Choose a registered worker." }, { status: 400 });
  if (!b?.siteId || !b?.siteName?.trim())
    return NextResponse.json({ error: "Choose a site." }, { status: 400 });
  if (!(Number(b.startedAt) > 0) || !(Number(b.endedAt) > 0))
    return NextResponse.json({ error: "Start and end times are required." }, { status: 400 });
  if (Number(b.endedAt) <= Number(b.startedAt))
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });

  let breakMinutes: number | null = null;
  if (b.breakMinutes != null) {
    const brk = Number(b.breakMinutes);
    if (!Number.isFinite(brk) || brk < 0 || brk > 600)
      return NextResponse.json({ error: "Break must be 0–600 minutes." }, { status: 400 });
    breakMinutes = brk;
  }

  const id = await createAdminShift({
    workerId: b.workerId,
    workerUid: b.workerUid,
    workerName: b.workerName.trim(),
    siteId: b.siteId,
    siteName: b.siteName.trim(),
    startedAt: Number(b.startedAt),
    endedAt: Number(b.endedAt),
    breakMinutes,
    by: auth.user.email,
  });
  return NextResponse.json({ ok: true, id });
}
