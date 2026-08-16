import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createSite, listSites, type SiteInput } from "@/lib/admin-repo";

export async function GET() {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;
  const sites = await listSites();
  return NextResponse.json({ sites });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("admin");
  if ("error" in auth) return auth.error;

  let body: SiteInput;
  try {
    body = (await req.json()) as SiteInput;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const err = validateSite(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const id = await createSite(body);
  return NextResponse.json({ ok: true, id });
}

export function validateSite(body: SiteInput): string | null {
  if (!body?.name?.trim()) return "Site name is required.";
  if (!body?.location || typeof body.location.lat !== "number")
    return "A valid location is required.";
  if (!["radius", "state", "country"].includes(body.geofenceType))
    return "Choose a geofence type.";
  if (body.geofenceType === "radius" && !(body.radiusMeters! > 0))
    return "Radius must be greater than 0.";
  if (body.geofenceType === "state" && !body.state)
    return "Could not determine the state for this location. Adjust the pin.";
  if (body.geofenceType === "country" && !body.country && !body.countryCode)
    return "Could not determine the country for this location.";
  return null;
}
