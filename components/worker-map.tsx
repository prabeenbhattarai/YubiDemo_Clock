"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, mapsAvailable } from "@/lib/google-maps";
import type { Position } from "@/lib/geo-client";

/**
 * Static map centred on the worker with a pulsing avatar pin overlaid dead
 * centre (Time Clock style). Non-interactive so the centre always = the user.
 * Falls back to a styled placeholder when no Maps key is present.
 */
export default function WorkerMap({
  position,
  initial,
  height = 260,
}: {
  position: Position | null;
  initial?: string;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const available = mapsAvailable();

  useEffect(() => {
    if (!available || !position) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !divRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(divRef.current, {
            center: position,
            zoom: 16,
            disableDefaultUI: true,
            gestureHandling: "none",
            keyboardShortcuts: false,
            clickableIcons: false,
          });
        } else {
          mapRef.current.setCenter(position);
        }
        setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [available, position]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      {available ? (
        <div ref={divRef} className="absolute inset-0 bg-ocean-100" />
      ) : (
        <div className="absolute inset-0 grad-ocean opacity-90" />
      )}

      {/* subtle fade so it blends into the sheet below */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[var(--color-canvas)]" />

      {/* centre avatar pin */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-ocean-400/40 animate-ping" />
          <div className="relative w-12 h-12 rounded-full bg-white shadow-lg grid place-items-center ring-4 ring-white">
            <div className="w-10 h-10 rounded-full grad-ocean grid place-items-center text-white font-bold">
              {(initial || "•").slice(0, 1).toUpperCase()}
            </div>
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-3 h-3 rotate-45 bg-white" />
        </div>
      </div>

      {!ready && available && position && (
        <div className="absolute inset-0 grid place-items-center text-ocean-700 text-sm">
          Loading map…
        </div>
      )}
      {!position && (
        <div className="absolute inset-0 grid place-items-center text-white/90 text-sm">
          Locating you…
        </div>
      )}
    </div>
  );
}
