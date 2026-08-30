"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUid, useLiveCollection, where } from "@/lib/live";
import type { BreakMinutes, Timesheet } from "@/lib/types";
import { computeWorkedMinutes, formatAuDateTime, minutesToHhMm } from "@/lib/time";
import {
  listFortnights,
  fortnightStartKey,
  addDaysKey,
} from "@/lib/fortnight";
import { auDateKey } from "@/lib/reconcile";
import { StatusPill, Spinner, EmptyState } from "@/components/ui";
import PlaceSearch from "@/components/place-search";
import { Toggle } from "@/app/admin/sites/page";
import { useToast } from "@/components/toast";
import { IconClipboard, IconWarning } from "@/components/icons";

const BREAKS: BreakMinutes[] = [0, 20, 30, 45, 60];

/** Short label for a fortnight day key, e.g. "Mon 18 Aug". */
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

/** Decimal hours from minutes, 2dp (so 150 → 2.5). */
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
            <p className="text-sm text-[var(--color-muted)]">Fill your fortnight, all days at once.</p>
          </div>
          <button className="btn-ocean" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Fill fortnight"}
          </button>
        </div>
      </header>

      <main className="px-5 py-4">
        {open && <FortnightGrid onDone={() => setOpen(false)} />}

        {loading && !uid ? (
          <div className="py-12 text-center text-[var(--color-muted)]">
            <Spinner />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={<IconClipboard size={22} />} title="No timesheets yet" subtitle="Tap “Fill fortnight” to log hours." />
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

// ---------------------------------------------------------------------------
//  Fortnight grid: 14 day rows filled at once. Each filled day is submitted as
//  its own timesheet entry (reusing POST /api/timesheets), so admin approval,
//  reconciliation and exports keep working unchanged.
// ---------------------------------------------------------------------------

interface Row {
  dayKey: string;
  loc: string;
  lat?: number;
  lng?: number;
  start: number | null; // minutes since midnight
  end: number | null;
  brk: BreakMinutes;
}

function buildRows(startKey: string): Row[] {
  return Array.from({ length: 14 }, (_, i) => ({
    dayKey: addDaysKey(startKey, i),
    loc: "",
    start: null,
    end: null,
    brk: 0 as BreakMinutes,
  }));
}

/** Minutes worked for a row (supports an end past midnight). 0 if incomplete. */
function rowMinutes(r: Row, breakPaid: boolean): number {
  if (r.start == null || r.end == null) return 0;
  const startAt = atTime(r.dayKey, r.start);
  const endAt = r.end > r.start ? atTime(r.dayKey, r.end) : atTime(addDaysKey(r.dayKey, 1), r.end);
  return computeWorkedMinutes(startAt, endAt, r.brk, breakPaid);
}

function FortnightGrid({ onDone }: { onDone: () => void }) {
  const periods = useMemo(() => listFortnights(), []);
  const [periodStart, setPeriodStart] = useState(() =>
    fortnightStartKey(auDateKey(Date.now()))
  );
  const [rows, setRows] = useState<Row[]>(() => buildRows(periodStart));
  const [breakPaid, setBreakPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  function changePeriod(next: string) {
    setPeriodStart(next);
    // Re-date rows to the new fortnight, keeping any values already entered.
    setRows((prev) => prev.map((r, i) => ({ ...r, dayKey: addDaysKey(next, i) })));
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const perDay = useMemo(() => rows.map((r) => rowMinutes(r, breakPaid)), [rows, breakPaid]);
  const filledCount = perDay.filter((m) => m > 0).length;
  const totalMinutes = perDay.reduce((s, m) => s + m, 0);

  async function submit() {
    setError("");

    // A day counts as "to submit" if it has both times entered.
    const toSubmit = rows.filter((r) => r.start != null && r.end != null);
    if (toSubmit.length === 0) {
      setError("Enter start and end times for at least one day.");
      return;
    }
    const missingLoc = toSubmit.filter((r) => !r.loc.trim()).map((r) => dayLabel(r.dayKey));
    if (missingLoc.length > 0) {
      setError(`Add a location for: ${missingLoc.join(", ")}.`);
      return;
    }

    setSaving(true);
    setProgress({ done: 0, total: toSubmit.length });
    const failures: string[] = [];

    for (let i = 0; i < toSubmit.length; i++) {
      const r = toSubmit[i];
      const startAt = atTime(r.dayKey, r.start!);
      const endAt = r.end! > r.start! ? atTime(r.dayKey, r.end!) : atTime(addDaysKey(r.dayKey, 1), r.end!);
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
            breakMinutes: r.brk,
            breakPaid,
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
    toast.success(
      "Fortnight submitted",
      `${toSubmit.length} day${toSubmit.length === 1 ? "" : "s"} sent for approval.`
    );
    onDone();
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Fill fortnight</h2>
        <button onClick={onDone} className="text-[var(--color-muted)] text-sm">
          Cancel
        </button>
      </div>

      <label className="label">Working period (fortnight)</label>
      <select
        className="input mb-3"
        value={periodStart}
        onChange={(e) => changePeriod(e.target.value)}
      >
        {periods.map((p) => (
          <option key={p.startKey} value={p.startKey}>
            {p.label}
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between rounded-xl bg-[var(--color-canvas)] px-3 py-2 mb-3">
        <span className="text-sm">Breaks are {breakPaid ? "paid" : "unpaid"}</span>
        <Toggle checked={breakPaid} onChange={setBreakPaid} />
      </div>

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <DayRow
            key={r.dayKey}
            row={r}
            minutes={perDay[i]}
            onChange={(patch) => update(i, patch)}
          />
        ))}
      </div>

      <div className="sticky bottom-0 mt-4 -mx-4 -mb-4 rounded-b-xl border-t border-[var(--color-line)] bg-white px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--color-muted)]">{filledCount} of 14 days</span>
          <span className="text-base font-bold">
            {minutesToHhMm(totalMinutes)} · {decimalHours(totalMinutes)}h
          </span>
        </div>

        {error && (
          <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            <IconWarning size={14} />
            <span>{error}</span>
          </p>
        )}

        <button className="btn-ocean w-full" onClick={submit} disabled={saving || filledCount === 0}>
          {saving && progress
            ? `Submitting ${progress.done}/${progress.total}…`
            : `Submit ${filledCount || ""} day${filledCount === 1 ? "" : "s"}`.trim()}
        </button>
      </div>
    </div>
  );
}

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
    <div
      className={`rounded-xl border p-2.5 ${
        worked ? "border-ocean-300 bg-ocean-50/40" : "border-[var(--color-line)]"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold">{dayLabel(row.dayKey)}</span>
        <span className={`text-sm font-semibold ${worked ? "text-ocean-700" : "text-[var(--color-muted)]"}`}>
          {worked ? `${minutesToHhMm(minutes)} · ${decimalHours(minutes)}h` : "—"}
        </span>
      </div>

      <div className="mb-1.5">
        <PlaceSearch
          placeholder="Location / site…"
          onChange={(p) =>
            onChange({
              loc: p.address,
              lat: "lat" in p ? p.lat : undefined,
              lng: "lat" in p ? p.lng : undefined,
            })
          }
        />
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Time12 ariaLabel={`${dayLabel(row.dayKey)} start`} value={row.start} onChange={(v) => onChange({ start: v })} />
        <Time12 ariaLabel={`${dayLabel(row.dayKey)} end`} value={row.end} onChange={(v) => onChange({ end: v })} />
        <select
          className="input px-2 py-3 text-sm appearance-none bg-white text-center"
          value={row.brk}
          onChange={(e) => onChange({ brk: Number(e.target.value) as BreakMinutes })}
          aria-label={`${dayLabel(row.dayKey)} break`}
        >
          {BREAKS.map((b) => (
            <option key={b} value={b}>
              {b}m
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

/** Time-of-day picker (12h with AM/PM). Emits minutes-since-midnight or null. */
function Time12({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
  ariaLabel: string;
}) {
  const has = value != null;
  const h24 = has ? Math.floor(value! / 60) : 0;
  const min = has ? value! % 60 : 0;
  const ap: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  function build(nh12: number, nmin: number, nap: "AM" | "PM") {
    let hh = nh12 % 12;
    if (nap === "PM") hh += 12;
    onChange(hh * 60 + nmin);
  }

  const cls = "input px-1.5 py-3 text-sm appearance-none bg-white text-center min-w-0";

  return (
    <div className="flex gap-1">
      <select
        className={cls}
        value={has ? h12 : 0}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v === 0) onChange(null);
          else build(v, has ? min : 0, has ? ap : "AM");
        }}
        aria-label={`${ariaLabel} hour`}
      >
        <option value={0}>–</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <select
        className={cls}
        value={min}
        disabled={!has}
        onChange={(e) => build(h12, Number(e.target.value), ap)}
        aria-label={`${ariaLabel} minute`}
      >
        {(MINUTE_OPTS.includes(min) ? MINUTE_OPTS : [...MINUTE_OPTS, min].sort((a, b) => a - b)).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        className={cls}
        value={ap}
        disabled={!has}
        onChange={(e) => build(h12, min, e.target.value as "AM" | "PM")}
        aria-label={`${ariaLabel} AM or PM`}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
