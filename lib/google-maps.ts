"use client";

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let loaderPromise: Promise<typeof google> | null = null;

export function mapsKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

export function mapsAvailable(): boolean {
  const k = mapsKey();
  return !!k && !k.startsWith("PASTE_");
}

/** Load the Google Maps JS API once (places + marker + geometry). */
export function loadGoogleMaps(): Promise<typeof google> {
  if (!mapsAvailable()) {
    return Promise.reject(new Error("Google Maps key not configured"));
  }
  if (!loaderPromise) {
    setOptions({ key: mapsKey(), v: "weekly" });
    loaderPromise = (async () => {
      await Promise.all([
        importLibrary("maps"),
        importLibrary("places"),
        importLibrary("marker"),
        importLibrary("geometry"),
      ]);
      return google;
    })();
  }
  return loaderPromise;
}

export interface ResolvedPlace {
  address: string;
  lat: number;
  lng: number;
  state?: string;
  country?: string;
  countryCode?: string;
}

export function extractComponents(
  components: google.maps.GeocoderAddressComponent[] | undefined
): { state?: string; country?: string; countryCode?: string } {
  const out: { state?: string; country?: string; countryCode?: string } = {};
  for (const c of components ?? []) {
    if (c.types.includes("administrative_area_level_1")) out.state = c.long_name;
    if (c.types.includes("country")) {
      out.country = c.long_name;
      out.countryCode = c.short_name;
    }
  }
  return out;
}
