"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUid, useLiveCollection, where } from "@/lib/live";
import type { Timesheet } from "@/lib/types";
import { computeWorkedMinutes, formatAuDateTime, minutesToHhMm } from "@/lib/time";
import {
  listFortnights,
  fortnightStartKey,
  fortnightLabel,
  addDaysKey,
} from "@/lib/fortnight";
import { auDateKey } from "@/lib/reconcile";
import { StatusPill, Spinner, EmptyState } from "@/components/ui";
import PlaceSearch from "@/components/place-search";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconClipboard } from "@/components/icons";

/** Short label for a fortnight day key, e.g. "Mon, 18 Aug". */
function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Epoch ms for a local calendar day + minutes-since-midnight. */
function atTime(dayKey: string, minutes: number): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
}

/** "HH:MM" (24h) -> minutes since midnight, or null. */
function parseTime(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Decimal hours from minutes, 2dp (150 -> 2.5). */
function decimalHours(mins: number): number {
  return Math.round((mins / 60) * 100) / 100;
}

export default function TimesheetPage() {
  const uid = useCurrentUid();
  const { data: timesheets, loading } = useLiveCollection<Timesheet>(
    "timesheets",
    uid ? [where("workerUid", "==", uid)] : [],
    [uid],
    !!uid
  );

  const sorted = useMemo(
    () => [...timesheets].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [timesheets]
  );

  const [open, setOpen] = useState(true);

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
            <p className="text-sm text-[var(--color-muted)]">Enter your fortnight&rsquo;s hours.</p>
          </div>
          <button className="btn-ocean" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "New"}
          </button>
        </div>
      </header>

      <main className="px-4 py-4">
        {open && <FortnightGrid onDone={() => setOpen(false)} />}

        {sorted.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mt-6 mb-2">
              Submitted
            </h2>
            <div className="space-y-3">
              {sorted.map((ts) => (
                <TimesheetCard key={ts.id} ts={ts} />
              ))}
            </div>
          </>
        )}
        {!open && loading && !uid && (
          <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>
        )}
        {!open && !loading && sorted.length === 0 && (
          <EmptyState icon={<IconClipboard size={22} />} title="No timesheets yet" subtitle="Tap “New” to log hours." />
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
        <span className="text-[var(--color-muted)]">{ts.breakMinutes}m break</span>
      </div>
      {ts.status === "edited" && ts.adminTotalMinutes != null && (
        <p className="text-xs text-ocean-700 mt-2">
          Admin adjusted hours to {minutesToHhMm(ts.adminTotalMinutes)}.
        </p>
      )}
      <button className="text-xs text-ocean-600 mt-2" onClick={() => setShowHistory((v) => !v)}>
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

// ---------------------------------------------------------------------------
//  Fortnight entry: one card per day (mobile-first). Each filled day is
//  submitted as its own timesheet entry via POST /api/timesheets, so admin
//  approval, reconciliation and exports keep working unchanged.
// ---------------------------------------------------------------------------

interface Row {
  dayKey: string;
  loc: string;
  lat?: number;
  lng?: number;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  brk: string;   // minutes as string
}

function buildRows(startKey: string): Row[] {
  return Array.from({ length: 14 }, (_, i) => ({
    dayKey: addDaysKey(startKey, i),
    loc: "",
    start: "",
    end: "",
    brk: "",
  }));
}

/** Worked minutes for a row (supports an end past midnight). 0 if incomplete. */
function rowMinutes(r: Row): number {
  const s = parseTime(r.start);
  const e = parseTime(r.end);
  if (s == null || e == null) return 0;
  const startAt = atTime(r.dayKey, s);
  const endAt = e > s ? atTime(r.dayKey, e) : atTime(addDaysKey(r.dayKey, 1), e);
  return computeWorkedMinutes(startAt, endAt, Number(r.brk) || 0, false);
}

function FortnightGrid({ onDone }: { onDone: () => void }) {
  const periods = useMemo(() => listFortnights(), []);
  const [periodStart, setPeriodStart] = useState(() => fortnightStartKey(auDateKey(Date.now())));
  const [rows, setRows] = useState<Row[]>(() => buildRows(periodStart));
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  function changePeriod(next: string) {
    setPeriodStart(next);
    setRows((prev) => prev.map((r, i) => ({ ...r, dayKey: addDaysKey(next, i) })));
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const perDay = useMemo(() => rows.map(rowMinutes), [rows]);
  const filledCount = perDay.filter((m) => m > 0).length;
  const totalMinutes = perDay.reduce((s, m) => s + m, 0);

  async function submit() {
    setError("");
    const toSubmit = rows.filter((r) => r.start && r.end);
    if (toSubmit.length === 0) {
      setError("Enter start and end times for at least one day.");
      return;
    }
    const missingLoc = toSubmit.filter((r) => !r.loc.trim()).map((r) => dayLabel(r.dayKey));
    if (missingLoc.length > 0) {
      setError(`Add a location for: ${missingLoc.join(", ")}.`);
      return;
    }

    const ok = await confirm({
      title: "Submit timesheet?",
      message: `Submit ${toSubmit.length} day${toSubmit.length === 1 ? "" : "s"} for ${fortnightLabel(periodStart)} — ${decimalHours(totalMinutes)} h total. Your admin will review it for approval.`,
      confirmLabel: "Yes, submit",
      cancelLabel: "Not yet",
    });
    if (!ok) return;

    setSaving(true);
    setProgress({ done: 0, total: toSubmit.length });
    const failures: string[] = [];

    for (let i = 0; i < toSubmit.length; i++) {
      const r = toSubmit[i];
      const s = parseTime(r.start)!;
      const e = parseTime(r.end)!;
      const startAt = atTime(r.dayKey, s);
      const endAt = e > s ? atTime(r.dayKey, e) : atTime(addDaysKey(r.dayKey, 1), e);
      try {
        const res = await fetch("/api/timesheets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            siteLabel: r.loc.trim(),
            placeAddress: r.loc.trim(),
            location: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : undefined,
            startAt,
            endAt,
            breakMinutes: Number(r.brk) || 0,
            breakPaid: false,
            periodStart,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          failures.push(`${dayLabel(r.dayKey)}: ${data.error || "failed"}`);
        }
      } catch {
        failures.push(`${dayLabel(r.dayKey)}: network error`);
      }
      setProgress({ done: i + 1, total: toSubmit.length });
    }

    setSaving(false);
    setProgress(null);

    if (failures.length > 0) {
      setError(failures.join(" · "));
      toast.error("Some days didn’t submit", `${failures.length} of ${toSubmit.length} failed.`);
      return;
    }
    toast.success("Timesheet submitted", `${toSubmit.length} day${toSubmit.length === 1 ? "" : "s"} sent for approval.`);
    onDone();
  }

  return (
    <div className="mb-4">
      {/* Working period */}
      <div className="card p-3 mb-3">
        <label className="block text-xs font-medium text-[var(--color-ink-soft)] mb-1">Working period</label>
        <select className="input !py-2.5" value={periodStart} onChange={(e) => changePeriod(e.target.value)}>
          {periods.map((p) => (
            <option key={p.startKey} value={p.startKey}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* One card per day */}
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <DayRow key={r.dayKey} row={r} minutes={perDay[i]} onChange={(patch) => update(i, patch)} />
        ))}
      </div>

      {/* Totals + submit */}
      <div className="card p-4 mt-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-[var(--color-muted)]">{filledCount} of 14 days</div>
            <div className="text-lg font-bold text-ocean-700 leading-tight">{decimalHours(totalMinutes)} h</div>
          </div>
          <div className="text-right text-xs text-[var(--color-muted)]">
            Fortnight total<br />{minutesToHhMm(totalMinutes)}
          </div>
        </div>
        {error && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{error}</p>}
        <button className="btn-ocean w-full" onClick={submit} disabled={saving}>
          {saving && progress ? `Submitting ${progress.done}/${progress.total}…` : "Submit timesheet"}
        </button>
      </div>
    </div>
  );
}

const cellInput =
  "w-full min-w-0 rounded-lg border border-[var(--color-line)] bg-white px-2 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function DayRow({
  row,
  minutes,
  onChange,
}: {
  row: Row;
  minutes: number;
  onChange: (patch: Partial<Row>) => void;
}) {
  const worked = minutes > 0;
  return (
    <div className={`card p-3 ${worked ? "border-ocean-300" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{dayLabel(row.dayKey)}</span>
        <span className={`text-sm font-bold ${worked ? "text-ocean-700" : "text-[var(--color-muted)]"}`}>
          {worked ? `${decimalHours(minutes)} h` : "—"}
        </span>
      </div>

      <PlaceSearch className={`${cellInput} mb-2`} placeholder="Location / site…" onChange={(p) =>
        onChange({ loc: p.address, lat: "lat" in p ? p.lat : undefined, lng: "lat" in p ? p.lng : undefined })
      } />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_62px] gap-1.5">
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Start</span>
          <input type="time" className={`${cellInput} ts-time`} value={row.start} onChange={(e) => onChange({ start: e.target.value })} />
        </label>
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">End</span>
          <input type="time" className={`${cellInput} ts-time`} value={row.end} onChange={(e) => onChange({ end: e.target.value })} />
        </label>
        <label className="block min-w-0">
          <span className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Break</span>
          <input type="number" min={0} step={5} inputMode="numeric" placeholder="0" className={cellInput} value={row.brk} onChange={(e) => onChange({ brk: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
