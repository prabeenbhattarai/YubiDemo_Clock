"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, mapsAvailable } from "@/lib/google-maps";
import type { Shift, Site } from "@/lib/types";
import { formatAuTime } from "@/lib/time";

/**
 * Admin map of a worker's movement during a shift: breadcrumb polyline with
 * direction arrows, start/end markers, and the site geofence (for radius sites).
 */
export default function ShiftMap({
  shift,
  site,
  height = 340,
}: {
  shift: Shift;
  site?: Site | null;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const track = (shift.track ?? []).filter((p) => p && isFinite(p.lat) && isFinite(p.lng));

  useEffect(() => {
    if (!mapsAvailable() || !divRef.current) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !divRef.current) return;
        const path = track.map((p) => ({ lat: p.lat, lng: p.lng }));
        const center = path[0] ?? site?.location ?? { lat: -25.27, lng: 133.77 };

        const map = new g.maps.Map(divRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });

        const bounds = new g.maps.LatLngBounds();

        // Geofence circle for radius sites.
        if (site && site.geofenceType === "radius" && site.radiusMeters) {
          const circle = new g.maps.Circle({
            map,
            center: site.location,
            radius: site.radiusMeters,
            fillColor: "#16a34a",
            fillOpacity: 0.08,
            strokeColor: "#16a34a",
            strokeOpacity: 0.5,
            strokeWeight: 2,
          });
          const cb = circle.getBounds();
          if (cb) bounds.union(cb);
        }

        // Movement polyline with direction arrows.
        if (path.length >= 2) {
          const arrow = {
            path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 2.6,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
            fillColor: "#2563eb",
            fillOpacity: 1,
          };
          new g.maps.Polyline({
            map,
            path,
            geodesic: true,
            strokeColor: "#2563eb",
            strokeOpacity: 0.9,
            strokeWeight: 4,
            icons: [{ icon: arrow, offset: "6%", repeat: "90px" }],
          });
        }

        // Point dots (small) to show sampling.
        track.forEach((p) => {
          new g.maps.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 3,
              fillColor: p.inside ? "#16a34a" : "#d97706",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 1,
            },
          });
          bounds.extend({ lat: p.lat, lng: p.lng });
        });

        // Start & end markers.
        if (path.length) {
          new g.maps.Marker({
            map,
            position: path[0],
            label: { text: "A", color: "#fff", fontSize: "12px", fontWeight: "700" },
            title: `Start · ${formatAuTime(shift.startedAt)}`,
          });
          new g.maps.Marker({
            map,
            position: path[path.length - 1],
            label: { text: "B", color: "#fff", fontSize: "12px", fontWeight: "700" },
            title: shift.endedAt ? `End · ${formatAuTime(shift.endedAt)}` : "Latest",
          });
        }

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 48);
          if (path.length === 1) map.setZoom(17);
        }
        setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.id]);

  if (!mapsAvailable()) {
    return (
      <div
        className="rounded-xl bg-[var(--color-canvas)] grid place-items-center text-sm text-[var(--color-muted)] px-6 text-center"
        style={{ height }}
      >
        Add a Google Maps key to view the movement map.
      </div>
    );
  }

  if (track.length === 0) {
    return (
      <div
        className="rounded-xl bg-[var(--color-canvas)] grid place-items-center text-sm text-[var(--color-muted)] px-6 text-center"
        style={{ height }}
      >
        No location trail was recorded for this shift.
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={divRef} className="w-full rounded-xl overflow-hidden border border-[var(--color-line)]" style={{ height }} />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-sm text-[var(--color-muted)]">
          Loading map…
        </div>
      )}
      <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]" /> on site</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--color-warn)]" /> off site</span>
        <span className="inline-flex items-center gap-1.5"><span className="text-[#2563eb]">→</span> direction · A start · B end</span>
      </div>
    </div>
  );
}
