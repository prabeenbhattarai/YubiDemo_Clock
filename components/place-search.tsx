"use client";

import { useEffect, useRef } from "react";
import {
  extractComponents,
  loadGoogleMaps,
  mapsAvailable,
  type ResolvedPlace,
} from "@/lib/google-maps";

/** Single-line Google Places autocomplete. Falls back to plain text input. */
export default function PlaceSearch({
  defaultValue,
  onChange,
  placeholder = "Search a place or address…",
  className = "input",
}: {
  defaultValue?: string;
  onChange: (place: ResolvedPlace | { address: string }) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mapsAvailable() || !inputRef.current) return;
    let ac: google.maps.places.Autocomplete | null = null;
    loadGoogleMaps()
      .then((g) => {
        if (!inputRef.current) return;
        ac = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "address_components", "name"],
        });
        ac.addListener("place_changed", () => {
          const place = ac!.getPlace();
          const label = place.name || place.formatted_address || "";
          if (place.geometry?.location) {
            onChange({
              address: place.formatted_address || label,
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              ...extractComponents(place.address_components),
            });
            if (inputRef.current) inputRef.current.value = label;
          } else {
            onChange({ address: label });
          }
        });
      })
      .catch(() => {});
    return () => {
      ac = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the (uncontrolled) input in sync when the value is set externally,
  // e.g. a saved draft loading in. Only writes when it actually differs, so it
  // never fights the user's typing or moves the caret.
  useEffect(() => {
    if (inputRef.current && defaultValue != null && inputRef.current.value !== defaultValue) {
      inputRef.current.value = defaultValue;
    }
  }, [defaultValue]);

  return (
    <input
      ref={inputRef}
      className={className}
      placeholder={placeholder}
      defaultValue={defaultValue}
      onChange={(e) => onChange({ address: e.target.value })}
    />
  );
}
