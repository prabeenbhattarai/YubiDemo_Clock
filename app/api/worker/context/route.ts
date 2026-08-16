import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getWorkerByUid } from "@/lib/repo";
import { getActiveShift, getSite } from "@/lib/shift-repo";

/** Everything the worker home screen needs in one call. */
export async function GET() {
  const auth = await requireUser("worker");
  if ("error" in auth) return auth.error;

  const worker = await getWorkerByUid(auth.user.uid);
  if (!worker) return NextResponse.json({ error: "Worker not found." }, { status: 404 });

  const siteDocs = await Promise.all(
    (worker.assignedSiteIds ?? []).map((id) => getSite(id))
  );
  const sites = siteDocs.filter((s) => s && s.active !== false);

  const active = await getActiveShift(worker.uid!);

  return NextResponse.json({
    worker: {
      id: worker.id,
      name: worker.name,
      email: worker.email,
    },
    sites,
    activeShift: active,
  });
}
