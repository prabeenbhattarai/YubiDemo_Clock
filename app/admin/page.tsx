"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveCollection } from "@/lib/live";
import type { Shift, Site, Timesheet, Worker } from "@/lib/types";
import { auParts, elapsed, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import {
  listFortnights,
  isWithinFortnight,
  fortnightStartKey,
  fortnightLabel,
  addDaysKey,
} from "@/lib/fortnight";
import { useNow } from "@/components/live-clock";
import { EmptyState, StatusPill } from "@/components/ui";
import Modal from "@/components/modal";
import ShiftMap from "@/components/shift-map";
import PeriodPicker from "@/components/period-picker";
import {
  IconCheck,
  IconWarning,
  IconUsers,
  IconClipboard,
  IconMapPin,
  IconClock,
  IconApprovals,
} from "@/components/icons";

const AU_TZ = "Australia/Sydney";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INIT = ["S", "M", "T", "W", "T", "F", "S"];

function auWeekday(ms: number): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: AU_TZ, weekday: "short" }).format(new Date(ms));
  return DAYS.indexOf(wd);
}

/** AU calendar day key (YYYY-MM-DD) for grouping by local date. */
function auDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AU_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Short "day mon" label from an AU/plain date key (tz-robust). */
function keyLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    Date.UTC(y, (m || 1) - 1, d || 1)
  );
}

function shiftMins(s: Shift): number {
  return s.durationMinutes ? shiftWorkedMinutes(s) : 0;
}
function tsMins(t: Timesheet): number {
  return t.adminTotalMinutes ?? t.totalMinutes ?? 0;
}
function sumMins(shifts: Shift[], timesheets: Timesheet[]): number {
  let m = 0;
  for (const s of shifts) m += shiftMins(s);
  for (const t of timesheets) m += tsMins(t);
  return m;
}
/** Percent change vs a baseline, or null when there's no baseline to compare. */
function pctChange(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

const ALL = "all";
type GraphKey = "trend" | "split" | "bySite" | "byWorker" | "weekly";
const GRAPH_TITLES: Record<GraphKey, string> = {
  trend: "Hours trend",
  split: "Timesheet vs clock-in",
  bySite: "Hours by site",
  byWorker: "Top workers",
  weekly: "Hours logged by weekday",
};

/** Records limited to a working period (or all, for "all"). */
function inPeriod<T>(rows: T[], getMs: (r: T) => number, period: string): T[] {
  return period === ALL ? rows : rows.filter((r) => isWithinFortnight(auDayKey(getMs(r)), period));
}

// --- Graph datasets, computed from already period-filtered records. Shared by
//     the dashboard cards and the zoom popup so both always agree. ---

function calcWeekly(shifts: Shift[], timesheets: Timesheet[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const s of shifts) if (s.durationMinutes) buckets[auWeekday(s.startedAt)] += shiftWorkedMinutes(s);
  for (const t of timesheets) buckets[auWeekday(t.startAt)] += t.adminTotalMinutes ?? t.totalMinutes;
  return buckets;
}

function calcTrend(
  shifts: Shift[],
  timesheets: Timesheet[],
  period: string
): { key: string; label: string; mins: number }[] {
  const days: { key: string; label: string; mins: number }[] = [];
  const idx = new Map<string, number>();
  if (period === ALL) {
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const key = auDayKey(now - i * 86400000);
      idx.set(key, days.length);
      days.push({ key, label: keyLabel(key), mins: 0 });
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const key = addDaysKey(period, i);
      idx.set(key, days.length);
      days.push({ key, label: keyLabel(key), mins: 0 });
    }
  }
  for (const s of shifts) { const i = idx.get(auDayKey(s.startedAt)); if (i != null) days[i].mins += shiftMins(s); }
  for (const t of timesheets) { const i = idx.get(auDayKey(t.startAt)); if (i != null) days[i].mins += tsMins(t); }
  return days;
}

function calcBySite(
  shifts: Shift[],
  timesheets: Timesheet[],
  sites: Site[],
  limit = 6
): { name: string; mins: number }[] {
  const m = new Map<string, number>();
  const nameOf = (id?: string) => (id ? sites.find((s) => s.id === id)?.name : undefined);
  const add = (name: string, mins: number) => { if (mins) m.set(name, (m.get(name) || 0) + mins); };
  for (const s of shifts) add(nameOf(s.siteId) || s.siteName || "Unspecified", shiftMins(s));
  for (const t of timesheets) add(nameOf(t.siteId) || t.siteLabel || "Unspecified", tsMins(t));
  return [...m.entries()].map(([name, mins]) => ({ name, mins })).sort((a, b) => b.mins - a.mins).slice(0, limit);
}

function calcByWorker(shifts: Shift[], timesheets: Timesheet[], limit = 6): { name: string; mins: number }[] {
  const m = new Map<string, number>();
  const add = (name: string, mins: number) => { if (mins) m.set(name, (m.get(name) || 0) + mins); };
  for (const s of shifts) add(s.workerName || "—", shiftMins(s));
  for (const t of timesheets) add(t.workerName || "—", tsMins(t));
  return [...m.entries()].map(([name, mins]) => ({ name, mins })).sort((a, b) => b.mins - a.mins).slice(0, limit);
}

function calcSplit(shifts: Shift[], timesheets: Timesheet[]): { ts: number; sh: number } {
  let ts = 0, sh = 0;
  for (const s of shifts) sh += shiftMins(s);
  for (const t of timesheets) ts += tsMins(t);
  return { ts, sh };
}

export default function AdminDashboard() {
  const { data: shifts } = useLiveCollection<Shift>("shifts", []);
  const { data: timesheets } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const { data: sites } = useLiveCollection<Site>("sites", []);

  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState<string>(() => fortnightStartKey(auDayKey(Date.now())));
  const [zoom, setZoom] = useState<GraphKey | null>(null);
  const [mapShift, setMapShift] = useState<Shift | null>(null);

  // Live (period-independent) figures.
  const active = shifts.filter((s) => s.status === "active");
  const offsite = active.filter((s) => s.currentlyInside === false);
  const pending =
    shifts.filter((s) => s.status === "completed" && s.approvalStatus === "pending").length +
    timesheets.filter((t) => t.status === "pending").length;

  // Current + previous period slices (previous powers the KPI deltas).
  const prevPeriod = period === ALL ? null : addDaysKey(period, -14);
  const pShifts = useMemo(() => inPeriod(shifts, (s) => s.startedAt, period), [shifts, period]);
  const pTimesheets = useMemo(() => inPeriod(timesheets, (t) => t.startAt, period), [timesheets, period]);
  const prevShifts = useMemo(() => (prevPeriod ? inPeriod(shifts, (s) => s.startedAt, prevPeriod) : []), [shifts, prevPeriod]);
  const prevTimesheets = useMemo(() => (prevPeriod ? inPeriod(timesheets, (t) => t.startAt, prevPeriod) : []), [timesheets, prevPeriod]);

  const curMins = useMemo(() => sumMins(pShifts, pTimesheets), [pShifts, pTimesheets]);
  const prevMins = useMemo(() => sumMins(prevShifts, prevTimesheets), [prevShifts, prevTimesheets]);
  const hoursDelta = pctChange(curMins, prevMins);
  const tsDelta = pctChange(pTimesheets.length, prevTimesheets.length);

  const weekly = useMemo(() => calcWeekly(pShifts, pTimesheets), [pShifts, pTimesheets]);
  const trend = useMemo(() => calcTrend(pShifts, pTimesheets, period), [pShifts, pTimesheets, period]);
  const bySite = useMemo(() => calcBySite(pShifts, pTimesheets, sites), [pShifts, pTimesheets, sites]);
  const byWorker = useMemo(() => calcByWorker(pShifts, pTimesheets), [pShifts, pTimesheets]);
  const split = useMemo(() => calcSplit(pShifts, pTimesheets), [pShifts, pTimesheets]);

  // Approval status mix for the current period.
  const approvalCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of pShifts) if (s.status === "completed") c[s.approvalStatus] = (c[s.approvalStatus] || 0) + 1;
    for (const t of pTimesheets) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [pShifts, pTimesheets]);

  const periodText = period === ALL ? "All time" : fortnightLabel(period);
  const { dateLong } = auParts(Date.now());
  const currentKey = fortnightStartKey(auDayKey(Date.now()));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{dateLong}</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker periods={periods} value={period} currentKey={currentKey} onChange={setPeriod} />
          <Link href="/admin/reports" className="btn-outline">Reports</Link>
          <Link href="/admin/workers" className="btn-primary">+ Add worker</Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiTile label="Hours" value={minutesToHhMm(curMins)} sub={periodText} delta={hoursDelta} icon={<IconClock size={16} />} />
        <KpiTile label="Timesheets" value={String(pTimesheets.length)} sub="submitted" delta={tsDelta} href="/admin/approvals" icon={<IconClipboard size={16} />} />
        <KpiTile label="On shift now" value={String(active.length)} sub={offsite.length ? `${offsite.length} off-site` : "all on-site"} live href="/admin/live" icon={<IconMapPin size={16} />} />
        <KpiTile label="Pending approvals" value={String(pending)} sub="awaiting review" tone={pending > 0 ? "warn" : undefined} href="/admin/approvals" icon={<IconApprovals size={16} />} />
      </div>

      {/* Hours trend + on shift now */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2">
          <CardHead title="Hours trend" sub={`${periodText} · clock-ins + timesheets`} />
          <div className="flex items-end gap-3 mb-4">
            <div className="text-3xl font-bold tabular-nums text-brand-700 leading-none">{minutesToHhMm(curMins)}</div>
            {hoursDelta != null && <Delta pct={hoursDelta} />}
            {hoursDelta != null && <span className="text-xs text-[var(--color-muted)] mb-0.5">vs last period</span>}
          </div>
          <div className="cursor-zoom-in" onClick={() => setZoom("trend")} title="Click to enlarge">
            <HoursTrend data={trend} />
          </div>
        </div>

        <div className="card p-5">
          <CardHead
            title="On shift now"
            sub={`${active.length} working`}
            right={<Link href="/admin/live" className="text-sm text-brand-600 font-medium hover:underline">Live →</Link>}
          />
          <OnShiftList active={active} onViewRoute={setMapShift} />
        </div>
      </div>

      {/* Weekday + source + approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <CardHead title="Hours by weekday" sub="hover a bar" />
          <div className="cursor-zoom-in" onClick={() => setZoom("weekly")} title="Click to enlarge">
            <WeeklyBars data={weekly} />
          </div>
        </div>
        <div className="card p-5">
          <CardHead title="Hours by source" sub="timesheet vs clock-in" />
          <div className="cursor-zoom-in" onClick={() => setZoom("split")} title="Click to enlarge">
            <SourceDonut ts={split.ts} sh={split.sh} />
          </div>
        </div>
        <div className="card p-5">
          <CardHead title="Approvals" sub={periodText} />
          <ApprovalsStatus counts={approvalCounts} />
        </div>
      </div>

      {/* By site + top workers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <CardHead title="Hours by site" right={<Link href="/admin/reports" className="text-sm text-brand-600 font-medium hover:underline">Reports →</Link>} />
          <div className="cursor-zoom-in" onClick={() => setZoom("bySite")} title="Click to enlarge">
            {bySite.length === 0
              ? <EmptyState icon={<IconMapPin size={22} />} title="No hours logged yet" />
              : <RankedList rows={bySite} color="var(--color-brand-500)" />}
          </div>
        </div>
        <div className="card p-5">
          <CardHead title="Top workers" right={<Link href="/admin/workers" className="text-sm text-brand-600 font-medium hover:underline">All →</Link>} />
          <div className="cursor-zoom-in" onClick={() => setZoom("byWorker")} title="Click to enlarge">
            {byWorker.length === 0
              ? <EmptyState icon={<IconUsers size={22} />} title="No hours logged yet" />
              : <RankedList rows={byWorker} color="var(--color-ocean-500)" />}
          </div>
        </div>
      </div>

      {/* Attention + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <AttentionCard offsite={offsite} pending={pending} />
        <div className="card p-5 lg:col-span-2">
          <CardHead title="Recent activity" right={<Link href="/admin/approvals" className="text-sm text-brand-600 font-medium hover:underline">Approvals →</Link>} />
          <RecentActivity shifts={shifts} timesheets={timesheets} />
        </div>
      </div>

      {mapShift && (
        <Modal open onClose={() => setMapShift(null)} title={`${mapShift.workerName} · live route`}>
          <div className="mb-3 text-sm text-[var(--color-muted)]">On shift · {mapShift.siteName}</div>
          <ShiftMap shift={mapShift} site={sites.find((s) => s.id === mapShift.siteId) ?? null} />
        </Modal>
      )}

      {zoom && (
        <GraphModal
          graph={zoom}
          shifts={shifts}
          timesheets={timesheets}
          sites={sites}
          periods={periods}
          initialPeriod={period}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}

/* --------------------------------- widgets -------------------------------- */

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="font-semibold text-base">{title}</h2>
        {sub && <p className="text-xs text-[var(--color-muted)] mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className="chip"
      style={{
        background: up ? "var(--color-success-soft)" : "var(--color-danger-soft)",
        color: up ? "var(--color-success)" : "var(--color-danger)",
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function KpiTile({
  label,
  value,
  sub,
  delta,
  tone,
  live,
  href,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
  tone?: "warn";
  live?: boolean;
  href?: string;
  icon?: React.ReactNode;
}) {
  const body = (
    <div className={`card p-4 h-full transition ${href ? "hover:shadow-md hover:-translate-y-0.5" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--color-ink-soft)]">
          <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 grid place-items-center">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        {delta != null ? (
          <Delta pct={delta} />
        ) : live ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-success)]">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-[var(--color-success)]" />
            </span>
            live
          </span>
        ) : null}
      </div>
      <div className={`text-3xl font-bold tabular-nums mt-3 ${tone === "warn" && value !== "0" ? "text-warn" : ""}`}>
        {value}
      </div>
      <div className="text-xs text-[var(--color-muted)] mt-1">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function RankedList({ rows, color }: { rows: { name: string; mins: number }[]; color: string }) {
  const total = rows.reduce((s, r) => s + r.mins, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.mins));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="w-5 text-xs text-[var(--color-muted)] tabular-nums text-center">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="truncate pr-2">{r.name}</span>
              <span className="text-[var(--color-muted)] tabular-nums shrink-0">
                {minutesToHhMm(r.mins)} · {Math.round((r.mins / total) * 100)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-canvas)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, (r.mins / max) * 100)}%`, background: color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OnShiftList({ active, onViewRoute }: { active: Shift[]; onViewRoute?: (s: Shift) => void }) {
  const now = useNow(1000);
  if (active.length === 0)
    return <EmptyState icon={<IconClock size={22} />} title="No one on shift" subtitle="Live sessions show up here." />;
  return (
    <ul className="space-y-2">
      {active.map((s) => (
        <li key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] p-3">
          <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-sm shrink-0">
            {s.workerName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{s.workerName}</div>
            <div className="text-xs text-[var(--color-muted)] truncate">
              {s.siteName}{s.currentlyInside === false ? " · off-site" : ""}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold tabular-nums">{elapsed(s.startedAt, now)}</div>
            {(s.track?.length ?? 0) > 0 && onViewRoute && (
              <button onClick={() => onViewRoute(s)} className="text-xs text-brand-600 hover:underline">route</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

const APPROVAL_SEGMENTS: [string, string, string][] = [
  ["approved", "Approved", "var(--color-success)"],
  ["pending", "Pending", "var(--color-warn)"],
  ["on_hold", "On hold", "var(--color-ocean-400)"],
  ["edited", "Edited", "var(--color-brand-400)"],
  ["declined", "Declined", "var(--color-danger)"],
];

function ApprovalsStatus({ counts }: { counts: Record<string, number> }) {
  const total = APPROVAL_SEGMENTS.reduce((s, [k]) => s + (counts[k] || 0), 0);
  if (total === 0)
    return <EmptyState icon={<IconApprovals size={22} />} title="Nothing to review" subtitle="Submitted time appears here." />;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-4">
        {APPROVAL_SEGMENTS.map(([k, , color]) => {
          const v = counts[k] || 0;
          if (!v) return null;
          return <div key={k} style={{ width: `${(v / total) * 100}%`, background: color }} />;
        })}
      </div>
      <ul className="space-y-2 text-sm">
        {APPROVAL_SEGMENTS.map(([k, label, color]) => (
          <li key={k} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[var(--color-ink-soft)]">{label}</span>
            <span className="ml-auto font-medium tabular-nums">
              {counts[k] || 0} · {Math.round(((counts[k] || 0) / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttentionCard({ offsite, pending }: { offsite: Shift[]; pending: number }) {
  return (
    <div className="card p-5">
      <CardHead title="Needs attention" />
      {offsite.length === 0 && pending === 0 ? (
        <div className="flex flex-col items-center gap-2 text-sm text-[var(--color-muted)] py-6 text-center">
          <span className="w-10 h-10 rounded-full bg-success-soft text-[var(--color-success)] grid place-items-center">
            <IconCheck size={20} />
          </span>
          All clear — nothing needs review.
        </div>
      ) : (
        <div className="space-y-3">
          {offsite.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl bg-warn-soft/60 px-3 py-2">
              <span className="text-warn"><IconWarning size={18} /></span>
              <div className="min-w-0 text-sm">
                <div className="font-medium truncate">{s.workerName}</div>
                <div className="text-xs text-[var(--color-muted)]">Off-site · {s.siteName}</div>
              </div>
            </div>
          ))}
          {pending > 0 && (
            <Link href="/admin/approvals" className="btn-primary w-full mt-1">
              Review {pending} pending {pending === 1 ? "item" : "items"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- charts --------------------------------- */

function WeeklyBars({ data, heightClass = "h-40" }: { data: number[]; heightClass?: string }) {
  const max = Math.max(1, ...data);
  const peak = data.indexOf(max);
  return (
    <div className={`flex items-stretch justify-between gap-2 ${heightClass}`}>
      {data.map((v, i) => {
        const h = Math.max(6, Math.round((v / max) * 100));
        const isPeak = i === peak && v > 0;
        return (
          <div key={i} className="group relative flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex-1 min-h-0 flex items-end justify-center">
              <div
                className={`w-full max-w-9 rounded-full transition-all duration-200 group-hover:brightness-110 ${
                  v === 0
                    ? "bg-[var(--color-canvas)] border border-dashed border-[var(--color-line)]"
                    : isPeak
                    ? "bg-brand-600"
                    : "bg-brand-300 group-hover:bg-brand-500"
                }`}
                style={{ height: `${h}%` }}
                title={`${DAYS[i]} · ${v > 0 ? minutesToHhMm(v) : "No hours"}`}
              />
            </div>
            <span className="text-xs text-[var(--color-muted)]">{DAY_INIT[i]}</span>
            <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-ink text-white text-xs font-medium rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap">
                {DAYS[i]} · {v > 0 ? minutesToHhMm(v) : "No hours"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HoursTrend({ data, heightClass = "h-40" }: { data: { label: string; mins: number }[]; heightClass?: string }) {
  const max = Math.max(1, ...data.map((d) => d.mins));
  const n = data.length;
  const pts = data.map((d, i) => ({
    x: n === 1 ? 0 : (i / (n - 1)) * 100,
    y: 38 - (d.mins / max) * 34,
  }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L100,40 L0,40 Z`;
  return (
    <div className={`relative ${heightClass}`}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trendFill)" />
        <path d={line} fill="none" stroke="var(--color-brand-600)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {data.map((d, i) => (
        <div
          key={i}
          className="group absolute top-0 bottom-5"
          style={{ left: `${pts[i].x}%`, width: `${100 / n}%`, transform: "translateX(-50%)" }}
        >
          <span
            className="absolute w-2.5 h-2.5 rounded-full bg-brand-600 ring-2 ring-white left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition"
            style={{ top: `${(pts[i].y / 40) * 100}%` }}
          />
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition"
            style={{ top: `${(pts[i].y / 40) * 100}%` }}
          >
            <div className="-translate-y-[135%] bg-ink text-white text-xs font-medium rounded-lg px-2 py-1 shadow-lg whitespace-nowrap">
              {d.label} · {d.mins > 0 ? minutesToHhMm(d.mins) : "0h"}
            </div>
          </div>
        </div>
      ))}
      <div className="absolute left-0 right-0 bottom-0 flex justify-between text-[10px] text-[var(--color-muted)]">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(n / 2)]?.label}</span>
        <span>{data[n - 1]?.label}</span>
      </div>
    </div>
  );
}

function HBars({ rows, color }: { rows: { name: string; mins: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.mins));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="truncate pr-2">{r.name}</span>
            <span className="font-medium tabular-nums text-[var(--color-ink-soft)]">{minutesToHhMm(r.mins)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-canvas)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, (r.mins / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceDonut({ ts, sh }: { ts: number; sh: number }) {
  const total = ts + sh;
  const r = 54;
  const c = 2 * Math.PI * r;
  const tsLen = total ? (ts / total) * c : 0;
  const shLen = total ? (sh / total) * c : 0;
  const pct = total ? Math.round((ts / total) * 100) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
        <svg width="132" height="132" viewBox="0 0 140 140" className="-rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-line)" strokeWidth="16" />
          {total > 0 && (
            <>
              <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-brand-500)" strokeWidth="16" strokeDasharray={`${tsLen} ${c}`} />
              <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-ocean-500)" strokeWidth="16" strokeDasharray={`${shLen} ${c}`} strokeDashoffset={-tsLen} />
            </>
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-base font-bold tabular-nums leading-none">{minutesToHhMm(total)}</div>
            <div className="text-[10px] text-[var(--color-muted)]">total</div>
          </div>
        </div>
      </div>
      <div className="space-y-2 text-sm min-w-0 flex-1">
        <SplitLegend color="var(--color-brand-500)" label="Timesheets" mins={ts} pct={pct} />
        <SplitLegend color="var(--color-ocean-500)" label="Clock-ins" mins={sh} pct={total ? 100 - pct : 0} />
      </div>
    </div>
  );
}

function SplitLegend({ color, label, mins, pct }: { color: string; label: string; mins: number; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[var(--color-ink-soft)]">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{minutesToHhMm(mins)} · {pct}%</span>
    </div>
  );
}

function RecentActivity({ shifts, timesheets }: { shifts: Shift[]; timesheets: Timesheet[] }) {
  const items = useMemo(() => {
    const a = shifts.map((s) => ({
      id: s.id,
      when: s.endedAt ?? s.startedAt,
      title: s.workerName,
      sub: s.status === "active" ? `Clocked in · ${s.siteName}` : `Shift · ${s.siteName}`,
      status: s.status === "active" ? "active" : s.approvalStatus,
    }));
    const b = timesheets.map((t) => ({
      id: t.id,
      when: t.createdAt ?? t.startAt,
      title: t.workerName,
      sub: `Timesheet · ${t.siteLabel}`,
      status: t.status,
    }));
    return [...a, ...b].sort((x, y) => (y.when ?? 0) - (x.when ?? 0)).slice(0, 6);
  }, [shifts, timesheets]);

  if (items.length === 0) return <EmptyState icon={<IconClipboard size={22} />} title="No activity yet" />;
  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-xl transition hover:bg-[var(--color-canvas)]">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold shrink-0">
            {it.title.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{it.title}</div>
            <div className="text-xs text-[var(--color-muted)] truncate">{it.sub}</div>
          </div>
          <StatusPill status={it.status} />
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------- graph zoom popup ---------------------------- */

function GraphModal({
  graph,
  shifts,
  timesheets,
  sites,
  periods,
  initialPeriod,
  onClose,
}: {
  graph: GraphKey;
  shifts: Shift[];
  timesheets: Timesheet[];
  sites: Site[];
  periods: { startKey: string; label: string }[];
  initialPeriod: string;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const pShifts = useMemo(() => inPeriod(shifts, (s) => s.startedAt, period), [shifts, period]);
  const pTimesheets = useMemo(() => inPeriod(timesheets, (t) => t.startAt, period), [timesheets, period]);

  const trend = useMemo(() => calcTrend(pShifts, pTimesheets, period), [pShifts, pTimesheets, period]);
  const weekly = useMemo(() => calcWeekly(pShifts, pTimesheets), [pShifts, pTimesheets]);
  const bySite = useMemo(() => calcBySite(pShifts, pTimesheets, sites, 12), [pShifts, pTimesheets, sites]);
  const byWorker = useMemo(() => calcByWorker(pShifts, pTimesheets, 12), [pShifts, pTimesheets]);
  const split = useMemo(() => calcSplit(pShifts, pTimesheets), [pShifts, pTimesheets]);

  const total =
    graph === "trend"
      ? trend.reduce((s, d) => s + d.mins, 0)
      : graph === "weekly"
      ? weekly.reduce((s, m) => s + m, 0)
      : graph === "bySite"
      ? bySite.reduce((s, r) => s + r.mins, 0)
      : graph === "byWorker"
      ? byWorker.reduce((s, r) => s + r.mins, 0)
      : split.ts + split.sh;

  return (
    <Modal open onClose={onClose} title={GRAPH_TITLES[graph]} widthClass="sm:max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-muted)]">Working period</span>
          <select className="input max-w-[220px] py-1.5" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value={ALL}>All time</option>
            {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
          </select>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-brand-700">{minutesToHhMm(total)}</div>
          <div className="text-xs text-[var(--color-muted)]">total hours</div>
        </div>
      </div>

      <div>
        {graph === "trend" && <HoursTrend data={trend} heightClass="h-72" />}
        {graph === "weekly" && <WeeklyBars data={weekly} heightClass="h-72" />}
        {graph === "bySite" &&
          (bySite.length === 0
            ? <EmptyState icon={<IconMapPin size={22} />} title="No hours logged" />
            : <HBars rows={bySite} color="var(--color-brand-500)" />)}
        {graph === "byWorker" &&
          (byWorker.length === 0
            ? <EmptyState icon={<IconUsers size={22} />} title="No hours logged" />
            : <HBars rows={byWorker} color="var(--color-ocean-500)" />)}
        {graph === "split" && (
          <div className="py-4">
            <SourceDonut ts={split.ts} sh={split.sh} />
          </div>
        )}
      </div>
    </Modal>
  );
}
