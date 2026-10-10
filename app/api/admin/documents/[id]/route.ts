import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { deleteDocument } from "@/lib/documents-repo";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  await deleteDocument(id);
  return NextResponse.json({ ok: true });
}
