import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createWorker, listWorkers, type WorkerInput } from "@/lib/admin-repo";

export async function GET() {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const workers = await listWorkers();
  return NextResponse.json({ workers });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  let body: WorkerInput;
  try {
    body = (await req.json()) as WorkerInput;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body?.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.email || ""))
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  try {
    const id = await createWorker(body);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
