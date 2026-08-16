import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { deleteWorker, updateWorker, type WorkerInput } from "@/lib/admin-repo";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: WorkerInput;
  try {
    body = (await req.json()) as WorkerInput;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body?.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.email || ""))
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  await updateWorker(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  await deleteWorker(id);
  return NextResponse.json({ ok: true });
}
