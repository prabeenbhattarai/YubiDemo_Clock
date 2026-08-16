import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { linkShiftTimesheet } from "@/lib/admin-repo";

/** Link/unlink a clock-in shift to a manual timesheet (admin reconciliation). */
export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.shiftId) {
    return NextResponse.json({ error: "Missing shiftId" }, { status: 400 });
  }
  try {
    await linkShiftTimesheet(body.shiftId, body.timesheetId ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
