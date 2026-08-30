import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { adminEndShift } from "@/lib/shift-repo";
import { createNotification } from "@/lib/notify";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const { durationMinutes } = await adminEndShift(id, auth.user.email);
    await createNotification({
      type: "clock_out",
      message: `Admin ended a forgotten shift (${Math.round(durationMinutes / 60 * 10) / 10}h)`,
    });
    return NextResponse.json({ ok: true, durationMinutes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
