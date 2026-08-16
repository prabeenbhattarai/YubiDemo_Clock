"use client";

import { useEffect, useMemo, useState } from "react";
import { orderBy, useLiveCollection } from "@/lib/live";
import type { GeofenceType, Site } from "@/lib/types";
import { Spinner, EmptyState, Field } from "@/components/ui";
import Modal from "@/components/modal";
import PlacePicker from "@/components/place-picker";
import type { ResolvedPlace } from "@/lib/google-maps";
import { IconMapPin, IconCamera, IconX } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";

const GEOFENCE_LABELS: Record<GeofenceType, string> = {
  radius: "Radius around point",
  state: "Whole state / region",
  country: "Whole country",
};

export default function SitesPage() {
  const { data: allSites, loading } = useLiveCollection<Site>("sites", [orderBy("name")]);
  const [editing, setEditing] = useState<Site | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get("q") || "");
  }, []);

  const sites = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return allSites;
    return allSites.filter(
      (s) => s.name.toLowerCase().includes(t) || (s.address || "").toLowerCase().includes(t)
    );
  }, [allSites, q]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="text-[var(--color-muted)] text-sm">
            Define work locations and their clock-in boundaries.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + Add site
        </button>
      </div>

      {q && (
        <button onClick={() => setQ("")} className="chip bg-brand-50 text-brand-700 mb-4">
          Filtered: “{q}” <IconX size={13} />
        </button>
      )}

      {loading ? (
        <div className="py-16 text-center text-[var(--color-muted)]">
          <Spinner /> Loading…
        </div>
      ) : sites.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconMapPin size={22} />}
            title="No sites yet"
            subtitle="Add your first work location to get started."
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditing(s)}
              className="card p-4 text-left hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{s.name}</div>
                  <div className="text-sm text-[var(--color-muted)] truncate">
                    {s.address}
                  </div>
                </div>
                {s.photoRequired && (
                  <span className="chip bg-brand-50 text-brand-700 shrink-0">
                    <IconCamera size={13} /> Photo
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="chip bg-[var(--color-canvas)] text-[var(--color-ink-soft)]">
                  {s.geofenceType === "radius"
                    ? `${s.radiusMeters}m radius`
                    : s.geofenceType === "state"
                    ? s.state
                    : s.country}
                </span>
                {s.active === false && (
                  <span className="chip pill-declined">Inactive</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <SiteForm
          site={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SiteForm({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const isEdit = !!site;
  const [name, setName] = useState(site?.name ?? "");
  const [place, setPlace] = useState<ResolvedPlace | null>(
    site
      ? {
          address: site.address,
          lat: site.location.lat,
          lng: site.location.lng,
          state: site.state,
          country: site.country,
          countryCode: site.countryCode,
        }
      : null
  );
  const [geofenceType, setGeofenceType] = useState<GeofenceType>(
    site?.geofenceType ?? "radius"
  );
  const [radius, setRadius] = useState(site?.radiusMeters ?? 150);
  const [photoRequired, setPhotoRequired] = useState(site?.photoRequired ?? true);
  const [active, setActive] = useState(site?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  async function save() {
    setError("");
    if (!name.trim()) return setError("Site name is required.");
    if (!place) return setError("Select a location.");
    if (geofenceType === "state" && !place.state)
      return setError("This location has no detectable state. Pick another point.");
    if (geofenceType === "country" && !place.country && !place.countryCode)
      return setError("This location has no detectable country.");

    setSaving(true);
    const body = {
      name,
      address: place.address,
      location: { lat: place.lat, lng: place.lng },
      geofenceType,
      radiusMeters: geofenceType === "radius" ? radius : undefined,
      state: place.state,
      country: place.country,
      countryCode: place.countryCode,
      photoRequired,
      active,
    };
    const res = await fetch(
      isEdit ? `/api/admin/sites/${site!.id}` : "/api/admin/sites",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      toast.error("Couldn't save site", data.error);
      return;
    }
    toast.success(isEdit ? "Site updated" : "Site created", name);
    onClose();
  }

  async function remove() {
    if (!site) return;
    const ok = await confirm({
      title: `Delete "${site.name}"?`,
      message: "This removes the site permanently. Existing records are kept.",
      confirmLabel: "Delete site",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    const res = await fetch(`/api/admin/sites/${site.id}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) toast.success("Site deleted", site.name);
    else toast.error("Couldn't delete site");
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit site" : "Add site"}
      footer={
        <>
          {isEdit && (
            <button className="btn-ghost text-[var(--color-danger)] mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : isEdit ? "Save changes" : "Create site"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Site name">
          <input
            className="input"
            placeholder="e.g. Warehouse — Docklands"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Location">
          <PlacePicker
            value={place}
            radiusMeters={radius}
            showRadius={geofenceType === "radius"}
            onChange={setPlace}
          />
        </Field>

        <Field
          label="Clock-in boundary"
          hint="Radius keeps workers near a point. State/Country lets them clock in anywhere in that region (for workers who move between sites)."
        >
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GEOFENCE_LABELS) as GeofenceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setGeofenceType(t)}
                className={`rounded-xl border px-2 py-2.5 text-xs font-medium ${
                  geofenceType === t
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-[var(--color-line)] text-[var(--color-ink-soft)]"
                }`}
              >
                {GEOFENCE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        {geofenceType === "radius" && (
          <Field label={`Radius: ${radius} m`}>
            <input
              type="range"
              min={20}
              max={2000}
              step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
          </Field>
        )}

        {geofenceType === "state" && (
          <div className="rounded-lg bg-brand-50 text-brand-700 text-sm px-3 py-2">
            Detected region: <b>{place?.state ?? "—"}</b>
            {place?.country ? `, ${place.country}` : ""}
          </div>
        )}
        {geofenceType === "country" && (
          <div className="rounded-lg bg-brand-50 text-brand-700 text-sm px-3 py-2">
            Detected country: <b>{place?.country ?? place?.countryCode ?? "—"}</b>
          </div>
        )}

        <label className="flex items-center justify-between py-2">
          <span className="text-sm font-medium">Require photo at clock in/out</span>
          <Toggle checked={photoRequired} onChange={setPhotoRequired} />
        </label>
        <label className="flex items-center justify-between py-2 border-t border-[var(--color-line)]">
          <span className="text-sm font-medium">Site active</span>
          <Toggle checked={active} onChange={setActive} />
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition relative ${
        checked ? "bg-brand-600" : "bg-[var(--color-line)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
