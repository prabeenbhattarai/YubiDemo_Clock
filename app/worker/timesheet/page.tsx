"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUid, useLiveCollection, where } from "@/lib/live";
import type { BreakMinutes, Timesheet } from "@/lib/types";
import { computeWorkedMinutes, formatAuDateTime, minutesToHhMm } from "@/lib/time";
import { StatusPill, Spinner, Field, EmptyState } from "@/components/ui";
import PlaceSearch from "@/components/place-search";
import { Toggle } from "@/app/admin/sites/page";
import { useToast } from "@/components/toast";
import { IconClipboard } from "@/components/icons";

const BREAKS: BreakMinutes[] = [0, 20, 30, 45, 60];

const pad2 = (n: number) => String(n).padStart(2, "0");
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

/** Date + 12-hour time picker with explicit AM/PM. Emits epoch ms. */
function DateTime12({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (ms: number) => void;
}) {
  const d = new Date(value);
  const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const h24 = d.getHours();
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = d.getMinutes();

  function build(ds: string, hh12: number, mm: number, ap: "AM" | "PM") {
    let hh = hh12 % 12;
    if (ap === "PM") hh += 12;
    const [y, m, day] = ds.split("-").map(Number);
    return new Date(y, m - 1, day, hh, mm, 0, 0).getTime();
  }

  const selectCls =
    "input px-2 py-3 text-sm appearance-none bg-white text-center";

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input
          type="date"
          className="input flex-1 min-w-0"
          value={dateStr}
          onChange={(e) => onChange(build(e.target.value, h12, minute, ampm))}
        />
        <select
          className={selectCls}
          value={h12}
          onChange={(e) => onChange(build(dateStr, Number(e.target.value), minute, ampm))}
          aria-label={`${label} hour`}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={MINUTES.includes(minute) ? minute : minute}
          onChange={(e) => onChange(build(dateStr, h12, Number(e.target.value), ampm))}
          aria-label={`${label} minute`}
        >
          {(MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b)).map((m) => (
            <option key={m} value={m}>{pad2(m)}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={ampm}
          onChange={(e) => onChange(build(dateStr, h12, minute, e.target.value as "AM" | "PM"))}
          aria-label={`${label} AM or PM`}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

export default function TimesheetPage() {
  const uid = useCurrentUid();
  const { data: timesheets, loading } = useLiveCollection<Timesheet>(
    "timesheets",
    uid ? [where("workerUid", "==", uid)] : [],
    [uid]
  );

  const sorted = useMemo(
    () => [...timesheets].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [timesheets]
  );

  const [open, setOpen] = useState(false);

  // Open the form automatically when arriving from the Home quick-action.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new")) {
      setOpen(true);
    }
  }, []);

  return (
    <div>
      <header className="bg-white px-5 pt-safe pb-4 border-b border-[var(--color-line)] sticky top-0 z-20">
        <div className="pt-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Timesheets</h1>
            <p className="text-sm text-[var(--color-muted)]">Add hours for any location.</p>
          </div>
          <button className="btn-ocean" onClick={() => setOpen(true)}>
            + Add
          </button>
        </div>
      </header>

      <main className="px-5 py-4">
        {open && <TimesheetForm onClose={() => setOpen(false)} />}

        {loading && !uid ? (
          <div className="py-12 text-center text-[var(--color-muted)]">
            <Spinner />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={<IconClipboard size={22} />} title="No timesheets yet" subtitle="Tap “Add” to log hours." />
        ) : (
          <div className="space-y-3 mt-2">
            {sorted.map((ts) => (
              <TimesheetCard key={ts.id} ts={ts} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TimesheetCard({ ts }: { ts: Timesheet }) {
  const [showHistory, setShowHistory] = useState(false);
  const effMinutes = ts.adminTotalMinutes ?? ts.totalMinutes;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{ts.siteLabel}</div>
          <div className="text-xs text-[var(--color-muted)]">
            {formatAuDateTime(ts.startAt)} → {formatAuDateTime(ts.endAt)}
          </div>
        </div>
        <StatusPill status={ts.status} />
      </div>
      <div className="flex items-center gap-4 mt-3 text-sm">
        <span className="font-semibold">{minutesToHhMm(effMinutes)}</span>
        <span className="text-[var(--color-muted)]">
          {ts.breakMinutes}m break ({ts.breakPaid ? "paid" : "unpaid"})
        </span>
      </div>
      {ts.status === "edited" && ts.adminTotalMinutes != null && (
        <p className="text-xs text-ocean-700 mt-2">
          Admin adjusted hours to {minutesToHhMm(ts.adminTotalMinutes)}.
        </p>
      )}
      <button
        className="text-xs text-ocean-600 mt-2"
        onClick={() => setShowHistory((v) => !v)}
      >
        {showHistory ? "Hide" : "View"} history
      </button>
      {showHistory && (
        <ul className="mt-2 space-y-1.5 border-t border-[var(--color-line)] pt-2">
          {ts.history?.map((h, i) => (
            <li key={i} className="text-xs text-[var(--color-ink-soft)] flex gap-2">
              <span className="text-[var(--color-muted)]">{formatAuDateTime(h.at)}</span>
              <span>· {h.action}{h.note ? ` — ${h.note}` : ""} ({h.by})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimesheetForm({ onClose }: { onClose: () => void }) {
  const nowD = new Date();
  const [label, setLabel] = useState("");
  const [placeAddress, setPlaceAddress] = useState<string | undefined>();
  const [location, setLocation] = useState<{ lat: number; lng: number } | undefined>();
  const round5 = (ms: number) => Math.round(ms / 300000) * 300000;
  const [startMs, setStartMs] = useState(round5(nowD.getTime() - 8 * 3600000));
  const [endMs, setEndMs] = useState(round5(nowD.getTime()));
  const [breakMin, setBreakMin] = useState<BreakMinutes>(30);
  const [breakPaid, setBreakPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const total = useMemo(
    () =>
      endMs > startMs ? computeWorkedMinutes(startMs, endMs, breakMin, breakPaid) : 0,
    [startMs, endMs, breakMin, breakPaid]
  );

  async function submit() {
    setError("");
    if (!label.trim()) return setError("Enter a location.");
    if (!(endMs > startMs)) return setError("End must be after start.");
    setSaving(true);
    const res = await fetch("/api/timesheets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteLabel: label,
        placeAddress,
        location,
        startAt: startMs,
        endAt: endMs,
        breakMinutes: breakMin,
        breakPaid,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not submit.");
      toast.error("Couldn't submit timesheet", data.error);
      return;
    }
    toast.success("Timesheet submitted", "Sent to your admin for approval.");
    onClose();
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">New timesheet</h2>
        <button onClick={onClose} className="text-[var(--color-muted)] text-sm">
          Cancel
        </button>
      </div>
      <div className="space-y-3">
        <Field label="Location / site">
          <PlaceSearch
            onChange={(p) => {
              setLabel(p.address);
              if ("lat" in p) {
                setLocation({ lat: p.lat, lng: p.lng });
                setPlaceAddress(p.address);
              }
            }}
          />
        </Field>
        <div className="space-y-3">
          <DateTime12 label="Start" value={startMs} onChange={setStartMs} />
          <DateTime12 label="End" value={endMs} onChange={setEndMs} />
        </div>

        <Field label="Break">
          <div className="grid grid-cols-5 gap-1.5">
            {BREAKS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBreakMin(b)}
                className={`rounded-lg border py-2 text-xs font-medium ${
                  breakMin === b
                    ? "border-ocean-500 bg-ocean-50 text-ocean-700"
                    : "border-[var(--color-line)] text-[var(--color-ink-soft)]"
                }`}
              >
                {b === 0 ? "None" : `${b}m`}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-center justify-between py-1">
          <span className="text-sm font-medium">
            Break is {breakPaid ? "paid" : "unpaid"}
          </span>
          <Toggle checked={breakPaid} onChange={setBreakPaid} />
        </label>

        <div className="rounded-xl bg-[var(--color-canvas)] px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-[var(--color-muted)]">Total worked</span>
          <span className="text-lg font-bold">{minutesToHhMm(total)}</span>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <button className="btn-ocean w-full" onClick={submit} disabled={saving}>
          {saving ? <Spinner /> : "Submit for approval"}
        </button>
      </div>
    </div>
  );
}
