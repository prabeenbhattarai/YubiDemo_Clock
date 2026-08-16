"use client";

import { useEffect, useRef, useState } from "react";
import {
  extractComponents,
  loadGoogleMaps,
  mapsAvailable,
  type ResolvedPlace,
} from "@/lib/google-maps";

interface Props {
  value?: ResolvedPlace | null;
  radiusMeters?: number;
  showRadius?: boolean;
  onChange: (place: ResolvedPlace) => void;
}

// Default view: Australia.
const DEFAULT_CENTER = { lat: -25.2744, lng: 133.7751 };

export default function PlacePicker({
  value,
  radiusMeters,
  showRadius,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!mapsAvailable());

  // Init map + autocomplete once.
  useEffect(() => {
    if (!mapsAvailable()) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapDivRef.current) return;
        const center = value ? { lat: value.lat, lng: value.lng } : DEFAULT_CENTER;
        const map = new g.maps.Map(mapDivRef.current, {
          center,
          zoom: value ? 15 : 4,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;
        geocoderRef.current = new g.maps.Geocoder();

        const marker = new g.maps.Marker({
          map,
          position: center,
          draggable: true,
        });
        markerRef.current = marker;

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) reverseGeocode(pos.lat(), pos.lng());
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) {
            marker.setPosition(e.latLng);
            reverseGeocode(e.latLng.lat(), e.latLng.lng());
          }
        });

        // Places autocomplete on the text input.
        if (inputRef.current) {
          const ac = new g.maps.places.Autocomplete(inputRef.current, {
            fields: ["formatted_address", "geometry", "address_components", "name"],
          });
          ac.bindTo("bounds", map);
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            if (!place.geometry?.location) return;
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const comps = extractComponents(place.address_components);
            const resolved: ResolvedPlace = {
              address: place.formatted_address || place.name || "",
              lat,
              lng,
              ...comps,
            };
            applyPlace(resolved, 15);
            onChange(resolved);
          });
        }

        setReady(true);
        if (value) applyPlace(value, 15);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the radius circle in sync.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google;
    if (showRadius && radiusMeters && markerRef.current?.getPosition()) {
      if (!circleRef.current) {
        circleRef.current = new g.maps.Circle({
          map: mapRef.current,
          fillColor: "#6366f1",
          fillOpacity: 0.12,
          strokeColor: "#4f46e5",
          strokeOpacity: 0.6,
          strokeWeight: 2,
        });
      }
      circleRef.current.setCenter(markerRef.current.getPosition()!);
      circleRef.current.setRadius(radiusMeters);
    } else if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
  }, [ready, showRadius, radiusMeters, value]);

  function applyPlace(p: ResolvedPlace, zoom: number) {
    const pos = { lat: p.lat, lng: p.lng };
    mapRef.current?.setCenter(pos);
    mapRef.current?.setZoom(zoom);
    markerRef.current?.setPosition(pos);
  }

  function reverseGeocode(lat: number, lng: number) {
    geocoderRef.current?.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const r = results[0];
        const comps = extractComponents(r.address_components);
        const resolved: ResolvedPlace = {
          address: r.formatted_address,
          lat,
          lng,
          ...comps,
        };
        if (inputRef.current) inputRef.current.value = r.formatted_address;
        onChange(resolved);
      } else {
        onChange({ address: value?.address || "", lat, lng });
      }
    });
  }

  if (failed) {
    // Graceful fallback: manual coordinates when no Maps key is set.
    return (
      <ManualLatLng value={value} onChange={onChange} />
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        className="input"
        placeholder="Search address or place…"
        defaultValue={value?.address || ""}
      />
      <div
        ref={mapDivRef}
        className="w-full h-56 rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)]"
      />
      <p className="text-xs text-[var(--color-muted)]">
        Search, or drag/tap the marker to fine-tune the exact location.
      </p>
    </div>
  );
}

function ManualLatLng({
  value,
  onChange,
}: {
  value?: ResolvedPlace | null;
  onChange: (p: ResolvedPlace) => void;
}) {
  const [address, setAddress] = useState(value?.address || "");
  const [lat, setLat] = useState(value?.lat?.toString() || "");
  const [lng, setLng] = useState(value?.lng?.toString() || "");

  function emit(a: string, la: string, ln: string) {
    const latN = parseFloat(la);
    const lngN = parseFloat(ln);
    if (!isNaN(latN) && !isNaN(lngN)) {
      onChange({ address: a, lat: latN, lng: lngN });
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-warn-soft text-warn text-xs px-3 py-2">
        Google Maps key not set — enter the location manually. Add
        <code className="mx-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable
        search &amp; map.
      </div>
      <input
        className="input"
        placeholder="Address / label"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          emit(e.target.value, lat, lng);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input"
          placeholder="Latitude"
          value={lat}
          onChange={(e) => {
            setLat(e.target.value);
            emit(address, e.target.value, lng);
          }}
        />
        <input
          className="input"
          placeholder="Longitude"
          value={lng}
          onChange={(e) => {
            setLng(e.target.value);
            emit(address, lat, e.target.value);
          }}
        />
      </div>
    </div>
  );
}
