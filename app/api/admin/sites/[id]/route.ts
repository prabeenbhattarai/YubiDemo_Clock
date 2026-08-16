import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { deleteSite, updateSite, type SiteInput } from "@/lib/admin-repo";
import { validateSite } from "../route";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: SiteInput;
  try {
    body = (await req.json()) as SiteInput;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const err = validateSite(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  await updateSite(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  await deleteSite(id);
  return NextResponse.json({ ok: true });
}
