import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import {
  getTimesheetDraft,
  saveTimesheetDraft,
  deleteTimesheetDraft,
  type DraftRow,
} from "@/lib/timesheet-repo";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^(\d{1,2}):(\d{2})$/;

function sanitizeRows(raw: unknown): DraftRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 14).map((item) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const brk = typeof r.brk === "string" ? r.brk : typeof r.brk === "number" ? String(r.brk) : "";
    return {
      dayKey: typeof r.dayKey === "string" ? r.dayKey.slice(0, 10) : "",
      loc: typeof r.loc === "string" ? r.loc.slice(0, 300) : "",
      lat: typeof r.lat === "number" && Number.isFinite(r.lat) ? r.lat : null,
      lng: typeof r.lng === "number" && Number.isFinite(r.lng) ? r.lng : null,
      start: typeof r.start === "string" && HHMM.test(r.start) ? r.start : "",
      end: typeof r.end === "string" && HHMM.test(r.end) ? r.end : "",
      brk: brk.slice(0, 4),
    };
  }).filter((r) => ISO.test(r.dayKey));
}

export async function GET(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;
  const period = new URL(req.url).searchParams.get("period") || "";
  if (!ISO.test(period)) return NextResponse.json({ draft: null });
  const draft = await getTimesheetDraft(auth.user.uid, period);
  return NextResponse.json({ draft });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { periodStart?: string; rows?: unknown } | null;
  const period = String(body?.periodStart || "");
  if (!ISO.test(period)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  await saveTimesheetDraft(auth.user.uid, period, sanitizeRows(body?.rows));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;
  const period = new URL(req.url).searchParams.get("period") || "";
  if (ISO.test(period)) await deleteTimesheetDraft(auth.user.uid, period);
  return NextResponse.json({ ok: true });
}
