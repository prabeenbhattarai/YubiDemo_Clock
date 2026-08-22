import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { deleteShiftDoc } from "@/lib/admin-repo";
import { updateShiftApproval, type ApprovalAction } from "@/lib/approval-repo";

const VALID: ApprovalAction[] = ["approve", "decline", "on_hold", "edit", "reset"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body?.action || !VALID.includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  try {
    const to = await updateShiftApproval({
      shiftId: id,
      action: body.action,
      by: auth.user.email,
      note: body.note,
      edit: body.edit,
    });
    return NextResponse.json({ ok: true, status: to });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    await deleteShiftDoc(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
