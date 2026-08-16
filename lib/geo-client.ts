"use client";

export interface Position {
  lat: number;
  lng: number;
  accuracy?: number;
  mocked?: boolean;
}

export function geolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/** One high-accuracy fix. Rejects with a friendly message. */
export function getPosition(timeoutMs = 15000): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) {
      reject(new Error("Location isn't supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          // Some Android browsers expose this; treat missing as false.
          mocked: (pos.coords as unknown as { mocked?: boolean }).mocked ?? false,
        });
      },
      (err) => {
        const map: Record<number, string> = {
          1: "Location permission denied. Enable location access to clock in.",
          2: "Location unavailable. Move to open sky and try again.",
          3: "Location timed out. Try again.",
        };
        reject(new Error(map[err.code] || "Could not get your location."));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Continuous watch (for live pings). Returns a stop function. */
export function watchPosition(
  onUpdate: (p: Position) => void,
  onError?: (e: string) => void
): () => void {
  if (!geolocationSupported()) {
    onError?.("Location not supported.");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        mocked: (pos.coords as unknown as { mocked?: boolean }).mocked ?? false,
      }),
    (err) => onError?.(err.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
