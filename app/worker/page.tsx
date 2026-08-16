"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Shift, Site } from "@/lib/types";
import { distanceMeters } from "@/lib/geofence";
import { getPosition, watchPosition, type Position } from "@/lib/geo-client";
import { uploadShiftPhoto } from "@/lib/photo-upload";
import { auParts, elapsed, greeting } from "@/lib/time";
import { useNow } from "@/components/live-clock";
import CameraCapture from "@/components/camera-capture";
import WorkerMap from "@/components/worker-map";
import Modal from "@/components/modal";
import { Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  IconMapPin,
  IconChevronDown,
  IconCheck,
  IconX,
  IconWarning,
  IconCamera,
} from "@/components/icons";

interface Ctx {
  worker: { id: string; name: string; email: string };
  sites: Site[];
  activeShift: Shift | null;
}

export default function WorkerHome() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch("/api/worker/context");
    const data = await res.json();
    if (res.ok) {
      setCtx(data);
      setSelectedSite((prev) => prev ?? data.sites[0] ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Best-effort location for the map + faster clock-in.
    getPosition().then(setPos).catch(() => {});
  }, [load]);

  const active = ctx?.activeShift ?? null;
  const now = useNow(1000);
  const { time, hour } = auParts(now);

  if (loading) {
    return (
      <div className="grid place-items-center h-dvh text-ocean-600">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Time Clock header */}
      <header className="grad-ocean text-white px-5 pt-safe rounded-b-[28px]">
        <div className="pt-5 pb-4 flex items-center justify-between">
          <div>
            <p className="text-ocean-100 text-xs font-medium">
              {greeting(hour)}
              {ctx?.worker.name ? `, ${ctx.worker.name.split(" ")[0]}` : ""}
            </p>
            <h1 className="text-lg font-bold -mt-0.5">Time Clock</h1>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums leading-none">{time}</div>
            <div className="text-[11px] text-ocean-100 mt-0.5">Australian time</div>
          </div>
        </div>
      </header>

      {active ? (
        <ActiveView
          shift={active}
          site={ctx?.sites.find((s) => s.id === active.siteId) ?? null}
          onEnd={() => setEndOpen(true)}
          onPosition={setPos}
        />
      ) : (
        <ClockInView
          site={selectedSite}
          pos={pos}
          initial={ctx?.worker.name}
          onSwitch={() => setSwitcherOpen(true)}
          onStart={() => setStartOpen(true)}
        />
      )}

      <QuickGrid />

      {switcherOpen && ctx && (
        <SiteSwitcher
          sites={ctx.sites}
          selected={selectedSite}
          onSelect={(s) => {
            setSelectedSite(s);
            setSwitcherOpen(false);
          }}
          onClose={() => setSwitcherOpen(false)}
        />
      )}

      {startOpen && selectedSite && (
        <StartSheet
          site={selectedSite}
          onClose={() => setStartOpen(false)}
          onStarted={async () => {
            setStartOpen(false);
            await load();
            toast.success("Shift started", "Your timer is now running.");
          }}
        />
      )}

      {endOpen && active && (
        <EndSheet
          shift={active}
          site={ctx?.sites.find((s) => s.id === active.siteId) ?? null}
          livePos={pos}
          onClose={() => setEndOpen(false)}
          onEnded={async () => {
            setEndOpen(false);
            await load();
            toast.success("Shift ended", "Submitted for approval.");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ clock-in view ---------------------------- */

function ClockInView({
  site,
  pos,
  initial,
  onSwitch,
  onStart,
}: {
  site: Site | null;
  pos: Position | null;
  initial?: string;
  onSwitch: () => void;
  onStart: () => void;
}) {
  return (
    <div>
      <div className="-mt-3">
        <WorkerMap position={pos} initial={initial} height={250} />
      </div>

      {/* Big START button overlapping the map */}
      <div className="flex flex-col items-center -mt-14 relative z-10">
        <button
          onClick={onStart}
          disabled={!site}
          className="grad-start shadow-start w-40 h-40 rounded-full grid place-items-center text-white ring-8 ring-[var(--color-canvas)] disabled:opacity-60 active:scale-95 transition"
        >
          <div className="flex flex-col items-center">
            <StopwatchIcon />
            <span className="font-bold tracking-widest mt-1">START</span>
          </div>
        </button>

        {/* Site selector */}
        <button
          onClick={onSwitch}
          disabled={!site}
          className="mt-5 inline-flex items-center gap-2 bg-white border border-[var(--color-line)] rounded-full pl-3 pr-3 py-2 shadow-sm"
        >
          <span className="text-ocean-600"><IconMapPin size={16} /></span>
          <span className="text-sm font-medium max-w-[200px] truncate">
            {site?.name ?? "No sites assigned"}
          </span>
          {site && <IconChevronDown size={18} className="text-[var(--color-muted)]" />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ active view ------------------------------ */

function ActiveView({
  shift,
  site,
  onEnd,
  onPosition,
}: {
  shift: Shift;
  site: Site | null;
  onEnd: () => void;
  onPosition?: (p: Position) => void;
}) {
  const now = useNow(1000);
  const [inside, setInside] = useState<boolean | null>(shift.currentlyInside ?? null);
  const [tracking, setTracking] = useState(false);
  const lastPing = useRef(0);

  // Continuous background tracking for the whole shift. Every fix updates the
  // shared position (used for instant clock-out) and pings the server ~every 45s.
  useEffect(() => {
    const stop = watchPosition(
      async (p) => {
        setTracking(true);
        onPosition?.(p);
        if (Date.now() - lastPing.current < 45000) return;
        lastPing.current = Date.now();
        try {
          const res = await fetch("/api/shifts/ping", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shiftId: shift.id, siteId: shift.siteId, location: p }),
          });
          const data = await res.json();
          if (res.ok) setInside(data.inside);
        } catch {
          /* ignore transient */
        }
      },
      () => setTracking(false)
    );
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.id, shift.siteId]);

  return (
    <div className="px-5 -mt-3">
      <div className="grad-ocean shadow-ocean text-white rounded-3xl p-6 text-center">
        <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-teal-300 animate-pulse" /> On shift · {shift.siteName}
        </div>
        <div className="text-6xl font-bold tabular-nums tracking-tight mt-4">
          {elapsed(shift.startedAt, now)}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-ocean-100 text-sm">
          <PinIcon />
          <span className="truncate max-w-[85%]">
            Started at: {shift.startAddress || shift.siteName}
          </span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-ocean-100">
          <span className={`w-1.5 h-1.5 rounded-full ${tracking ? "bg-teal-300 animate-pulse" : "bg-white/40"}`} />
          {tracking ? "Live location tracking on" : "Waiting for location…"}
        </div>
      </div>

      {/* on/off site banner */}
      {inside === false ? (
        <div className="mt-3 rounded-xl bg-warn-soft text-warn text-sm px-4 py-3 flex items-center gap-2">
          <IconWarning size={18} className="shrink-0" />
          <span>You appear to be outside the site boundary — your admin can see this.</span>
        </div>
      ) : inside === true ? (
        <div className="mt-3 rounded-xl bg-[#e6faf3] text-teal-500 text-sm px-4 py-3 flex items-center gap-2">
          <IconCheck size={18} className="shrink-0" />
          <span>You are on site.</span>
        </div>
      ) : null}

      <button onClick={onEnd} className="grad-stop w-full text-white font-semibold rounded-2xl py-4 mt-4 text-base active:scale-[.98] transition flex items-center justify-center gap-2">
        <StopIcon /> End Shift
      </button>

      <span className="hidden">{site?.id}</span>
    </div>
  );
}

/* ------------------------------ quick grid ------------------------------- */

function QuickGrid() {
  const tiles = [
    { href: "/worker/timesheet", label: "Timesheet", color: "bg-ocean-500", icon: <CalIcon /> },
    { href: "/worker/timesheet?new=1", label: "Add timesheet", color: "bg-teal-500", icon: <PlusIcon /> },
    { href: "/worker/history", label: "My history", color: "bg-[#a855f7]", icon: <CheckIcon /> },
    { href: "/worker/profile", label: "Profile", color: "bg-[#f472b6]", icon: <UserMiniIcon /> },
  ];
  return (
    <div className="px-5 mt-6 grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="card p-4 flex items-center gap-3 active:scale-[.98] transition"
        >
          <span className={`w-11 h-11 rounded-full ${t.color} grid place-items-center text-white shrink-0`}>
            {t.icon}
          </span>
          <span className="font-medium text-sm">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------- sheets --------------------------------- */

function SiteSwitcher({
  sites,
  selected,
  onSelect,
  onClose,
}: {
  sites: Site[];
  selected: Site | null;
  onSelect: (s: Site) => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="Choose a site">
      <div className="space-y-2">
        {sites.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">No sites assigned.</p>
        )}
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${
              selected?.id === s.id ? "border-ocean-500 bg-ocean-50" : "border-[var(--color-line)]"
            }`}
          >
            <span className="text-ocean-600"><IconMapPin size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{s.name}</div>
              <div className="text-xs text-[var(--color-muted)] truncate">{s.address}</div>
            </div>
            {selected?.id === s.id && <IconCheck size={18} className="text-ocean-600" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function StartSheet({
  site,
  onClose,
  onStarted,
}: {
  site: Site;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [pos, setPos] = useState<Position | null>(null);
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refreshLocation = useCallback(async () => {
    setLocating(true);
    setLocError("");
    try {
      setPos(await getPosition());
    } catch (e) {
      setLocError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  const distance =
    pos && site.geofenceType === "radius"
      ? Math.round(distanceMeters(site.location, pos))
      : null;
  const insideRadius =
    site.geofenceType === "radius" && distance != null
      ? distance <= (site.radiusMeters ?? 150)
      : null;

  const photoOk = !site.photoRequired || !!photo;
  const locationOk = !!pos && !locError && insideRadius !== false;
  const canStart = photoOk && locationOk && !submitting;

  async function start() {
    if (!pos) return;
    setSubmitting(true);
    setError("");
    try {
      let photoUrl: string | undefined;
      if (site.photoRequired && photo) photoUrl = await uploadShiftPhoto(photo);
      const res = await fetch("/api/shifts/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: site.id, location: pos, photoUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start shift.");
        setSubmitting(false);
        return;
      }
      onStarted();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Start shift"
      footer={
        <button className="btn-ocean w-full text-base py-3.5" disabled={!canStart} onClick={start}>
          {submitting ? <Spinner /> : "Start shift"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="text-sm">
          <div className="font-semibold">{site.name}</div>
          <div className="text-[var(--color-muted)]">{site.address}</div>
        </div>

        <div className="rounded-xl border border-[var(--color-line)] p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm inline-flex items-center gap-1.5">
              <IconMapPin size={16} className="text-ocean-600" /> Location check
            </span>
            <button className="text-xs text-ocean-600 font-medium" onClick={refreshLocation}>Refresh</button>
          </div>
          {locating ? (
            <p className="text-sm text-[var(--color-muted)] mt-2 flex items-center gap-2">
              <Spinner /> Getting your location…
            </p>
          ) : locError ? (
            <p className="text-sm text-[var(--color-danger)] mt-2">{locError}</p>
          ) : (
            <div className="mt-2 text-sm">
              {site.geofenceType === "radius" ? (
                insideRadius ? (
                  <p className="text-teal-500 flex items-center gap-1.5"><IconCheck size={16} /> Within range ({distance}m of {site.radiusMeters}m)</p>
                ) : (
                  <p className="text-danger flex items-center gap-1.5"><IconX size={16} /> Too far — {distance}m away (limit {site.radiusMeters}m).</p>
                )
              ) : (
                <p className="text-[var(--color-ink-soft)] flex items-center gap-1.5"><IconCheck size={16} className="text-teal-500" /> Location captured — region verified on start.</p>
              )}
              {pos?.accuracy != null && (
                <p className="text-xs text-[var(--color-muted)] mt-1">Accuracy ±{Math.round(pos.accuracy)}m</p>
              )}
            </div>
          )}
        </div>

        {site.photoRequired && (
          <div>
            <p className="font-medium text-sm mb-2 inline-flex items-center gap-1.5">
              <IconCamera size={16} className="text-ocean-600" /> Photo required
            </p>
            <CameraCapture photo={photo} onCapture={setPhoto} onClear={() => setPhoto(null)} />
          </div>
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {!canStart && !submitting && (
          <p className="text-xs text-[var(--color-muted)]">
            {site.photoRequired && !photo
              ? "Take the required photo and confirm you're on site to start."
              : "You must be on site to start your shift."}
          </p>
        )}
      </div>
    </Modal>
  );
}

function EndSheet({
  shift,
  site,
  livePos,
  onClose,
  onEnded,
}: {
  shift: Shift;
  site: Site | null;
  livePos: Position | null;
  onClose: () => void;
  onEnded: () => void;
}) {
  const photoRequired = site?.photoRequired ?? false;
  const [photo, setPhoto] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Clock-out never blocks on a fresh GPS lookup. It uses the position already
  // being tracked live during the shift (server falls back to the last ping).
  const canEnd = (!photoRequired || !!photo) && !submitting;

  async function end() {
    setSubmitting(true);
    setError("");
    try {
      let photoUrl: string | undefined;
      if (photoRequired && photo) photoUrl = await uploadShiftPhoto(photo);
      const res = await fetch("/api/shifts/end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location: livePos ?? undefined, photoUrl, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not end shift.");
        setSubmitting(false);
        return;
      }
      onEnded();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="End shift"
      footer={
        <button className="grad-stop w-full text-white font-semibold rounded-xl text-base py-3.5 disabled:opacity-50" disabled={!canEnd} onClick={end}>
          {submitting ? <Spinner /> : "End shift"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-[var(--color-canvas)] px-4 py-3 text-sm">
          Total so far: <b>{elapsed(shift.startedAt)}</b>
        </div>

        <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${livePos ? "bg-teal-500" : "bg-[var(--color-line)]"}`} />
          {livePos
            ? "Using your live tracked location."
            : "No recent location — you can still clock out."}
        </p>

        {photoRequired && (
          <div>
            <p className="font-medium text-sm mb-2 inline-flex items-center gap-1.5">
              <IconCamera size={16} className="text-ocean-600" /> Photo required
            </p>
            <CameraCapture photo={photo} onCapture={setPhoto} onClear={() => setPhoto(null)} />
          </div>
        )}

        <div>
          <label className="label">Comment (optional)</label>
          <textarea
            className="input min-h-20 resize-none"
            placeholder="Any notes about your shift…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}

/* --------------------------------- icons --------------------------------- */

function StopwatchIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="8" stroke="white" strokeWidth="1.8" />
      <path d="M12 9v4l2.5 2M9 2h6M12 5V2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StopIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="white" /></svg>;
}
function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="10" r="2.4" fill="currentColor" />
    </svg>
  );
}
function CalIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="white" strokeWidth="1.8"/><path d="M3 9h18M8 3v4M16 3v4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
function PlusIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function CheckIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>;
}
function UserMiniIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="white" strokeWidth="1.8"/><path d="M5 20c1.3-3.5 4.2-5 7-5s5.7 1.5 7 5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
