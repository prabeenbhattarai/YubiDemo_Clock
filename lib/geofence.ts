import type { LatLng, Site } from "./types";

/** Haversine distance in metres between two coordinates. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000; // earth radius m
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface GeofenceResult {
  inside: boolean;
  reason: string;
  distanceMeters?: number;
  resolvedState?: string;
  resolvedCountry?: string;
  resolvedCountryCode?: string;
}

/** Reverse-geocode via Google (server-side) to resolve state/country. */
export async function reverseGeocode(point: LatLng): Promise<{
  state?: string;
  country?: string;
  countryCode?: string;
} | null> {
  const key =
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || key.startsWith("PASTE_")) return null;

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${point.lat},${point.lng}&result_type=administrative_area_level_1|country&key=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) {
    if (data.status && data.status !== "ZERO_RESULTS") {
      // eslint-disable-next-line no-console
      console.warn(
        `[geocode] Google returned ${data.status}: ${data.error_message || "no message"}`
      );
    }
    return null;
  }

  let state: string | undefined;
  let country: string | undefined;
  let countryCode: string | undefined;

  for (const result of data.results) {
    for (const comp of result.address_components ?? []) {
      if (comp.types?.includes("administrative_area_level_1")) {
        state = state ?? comp.long_name;
      }
      if (comp.types?.includes("country")) {
        country = country ?? comp.long_name;
        countryCode = countryCode ?? comp.short_name;
      }
    }
  }
  return { state, country, countryCode };
}

/** Reverse-geocode to a human street address (best-effort, server-side). */
export async function reverseGeocodeAddress(
  point: LatLng
): Promise<string | null> {
  const key =
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || key.startsWith("PASTE_")) return null;
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${point.lat},${point.lng}&key=${key}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      if (data.status && data.status !== "ZERO_RESULTS") {
        // eslint-disable-next-line no-console
        console.warn(
          `[geocode] Google returned ${data.status}: ${data.error_message || "no message"}`
        );
      }
      return null;
    }
    return data.results[0].formatted_address as string;
  } catch {
    return null;
  }
}

/**
 * Server-side authority on whether a reading is "on site".
 * For radius sites this is pure math. For state/country it reverse-geocodes.
 */
export async function checkGeofence(
  site: Site,
  point: LatLng
): Promise<GeofenceResult> {
  if (site.geofenceType === "radius") {
    const d = distanceMeters(site.location, point);
    const radius = site.radiusMeters ?? 150;
    return {
      inside: d <= radius,
      distanceMeters: Math.round(d),
      reason:
        d <= radius
          ? `Within ${Math.round(d)}m of site (limit ${radius}m)`
          : `Too far: ${Math.round(d)}m away (limit ${radius}m)`,
    };
  }

  // state / country: resolve where the point actually is.
  const geo = await reverseGeocode(point);
  if (!geo) {
    return {
      inside: false,
      reason:
        "Could not verify your location region (geocoding unavailable). Add a Google Maps key or use a radius site.",
    };
  }

  if (site.geofenceType === "country") {
    const ok =
      (site.countryCode && geo.countryCode
        ? geo.countryCode === site.countryCode
        : false) ||
      (site.country && geo.country
        ? geo.country.toLowerCase() === site.country.toLowerCase()
        : false);
    return {
      inside: ok,
      resolvedCountry: geo.country,
      resolvedCountryCode: geo.countryCode,
      reason: ok
        ? `Inside ${site.country ?? site.countryCode}`
        : `You are in ${geo.country ?? "unknown"}, site requires ${
            site.country ?? site.countryCode
          }`,
    };
  }

  // state
  const stateOk =
    !!site.state &&
    !!geo.state &&
    geo.state.toLowerCase() === site.state.toLowerCase();
  const countryOk =
    !site.countryCode || !geo.countryCode || geo.countryCode === site.countryCode;
  const ok = stateOk && countryOk;
  return {
    inside: ok,
    resolvedState: geo.state,
    resolvedCountry: geo.country,
    resolvedCountryCode: geo.countryCode,
    reason: ok
      ? `Inside ${site.state}`
      : `You are in ${geo.state ?? "unknown"}, site requires ${site.state}`,
  };
}

/** Heuristics to reject obviously-spoofed / low-quality readings. */
export function readingQuality(reading: {
  accuracy?: number;
  mocked?: boolean;
}): { ok: boolean; reason?: string } {
  if (reading.mocked) {
    return { ok: false, reason: "Mock location detected. Disable fake GPS." };
  }
  if (reading.accuracy != null && reading.accuracy > 200) {
    return {
      ok: false,
      reason: `GPS accuracy too low (±${Math.round(
        reading.accuracy
      )}m). Move to open sky and retry.`,
    };
  }
  return { ok: true };
}
