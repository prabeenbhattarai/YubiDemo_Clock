import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getWorkerByUid } from "@/lib/repo";
import {
  createTimesheet,
  listWorkerTimesheets,
  type TimesheetInput,
} from "@/lib/timesheet-repo";
import { createNotification } from "@/lib/notify";

export async function GET() {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;
  const rows = await listWorkerTimesheets(auth.user.uid);
  return NextResponse.json({ timesheets: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;

  const worker = await getWorkerByUid(auth.user.uid);
  if (!worker) return NextResponse.json({ error: "Worker not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as TimesheetInput | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (!body.siteLabel?.trim())
    return NextResponse.json({ error: "Enter a location." }, { status: 400 });
  if (!(body.startAt > 0) || !(body.endAt > 0))
    return NextResponse.json({ error: "Start and end times are required." }, { status: 400 });
  if (body.endAt <= body.startAt)
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  const brk = Number(body.breakMinutes);
  if (!Number.isFinite(brk) || brk < 0 || brk > 600)
    return NextResponse.json({ error: "Break must be 0–600 minutes." }, { status: 400 });

  const id = await createTimesheet(worker, body);
  await createNotification({
    type: "timesheet",
    message: `${worker.name} submitted a timesheet for ${body.siteLabel}`,
    workerName: worker.name,
    siteName: body.siteLabel,
  });
  return NextResponse.json({ ok: true, id });
}
