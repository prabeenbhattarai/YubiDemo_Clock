import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { finalizePayDocument, listDocuments } from "@/lib/documents-repo";
import type { PayDocRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const documents = await listDocuments();
  return NextResponse.json({ documents });
}

/** Finalize (create/overwrite) a timesheet-pay document for a site + period. */
export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  const b = (await req.json().catch(() => null)) as
    | {
        siteId?: string;
        siteName?: string;
        periodStart?: string;
        periodLabel?: string;
        rows?: PayDocRow[];
      }
    | null;

  if (!b?.siteId || !b?.siteName?.trim())
    return NextResponse.json({ error: "Choose a site before finalizing." }, { status: 400 });
  if (!b?.periodStart)
    return NextResponse.json({ error: "A working period is required." }, { status: 400 });
  if (!Array.isArray(b.rows) || b.rows.length === 0)
    return NextResponse.json({ error: "Nothing to finalize." }, { status: 400 });

  const id = await finalizePayDocument({
    siteId: b.siteId,
    siteName: b.siteName.trim(),
    periodStart: b.periodStart,
    periodLabel: b.periodLabel ?? b.periodStart,
    rows: b.rows,
    by: auth.user.email,
  });
  return NextResponse.json({ ok: true, id });
}
