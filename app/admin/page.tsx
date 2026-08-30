"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveCollection } from "@/lib/live";
import type { Shift, Site, Timesheet, Worker } from "@/lib/types";
import { elapsed, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import { useNow } from "@/components/live-clock";
import { EmptyState, StatusPill } from "@/components/ui";
import Modal from "@/components/modal";
import ShiftMap from "@/components/shift-map";
import {
  IconCheck,
  IconWarning,
  IconUsers,
  IconClipboard,
  IconArrowUpRight,
  IconMapPin,
} from "@/components/icons";

const AU_TZ = "Australia/Sydney";
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function auWeekday(ms: number): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: AU_TZ, weekday: "short" }).format(
    new Date(ms)
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export default function AdminDashboard() {
  const { data: shifts } = useLiveCollection<Shift>("shifts", []);
  const { data: timesheets } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const { data: sites } = useLiveCollection<Site>("sites", []);

  const [mapShift, setMapShift] = useState<Shift | null>(null);
  const active = shifts.filter((s) => s.status === "active");
  const offsite = active.filter((s) => s.currentlyInside === false);
  const pending =
    shifts.filter((s) => s.status === "completed" && s.approvalStatus === "pending").length +
    timesheets.filter((t) => t.status === "pending").length;

  // Weekly hours (Sun..Sat, current calendar behaviour — recent 7 buckets).
  const weekly = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    for (const s of shifts) {
      if (s.durationMinutes) buckets[auWeekday(s.startedAt)] += shiftWorkedMinutes(s);
    }
    for (const t of timesheets) {
      buckets[auWeekday(t.startAt)] += t.adminTotalMinutes ?? t.totalMinutes;
    }
    return buckets;
  }, [shifts, timesheets]);

  // Approvals progress across everything reviewed.
  const reviewables = [
    ...shifts.filter((s) => s.status === "completed").map((s) => s.approvalStatus),
    ...timesheets.map((t) => t.status),
  ];
  const approved = reviewables.filter((s) => s === "approved").length;
  const approvalPct = reviewables.length
    ? Math.round((approved / reviewables.length) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-[var(--color-muted)]">
            Plan, monitor, and approve your team&apos;s time with ease.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/workers" className="btn-primary">+ Add worker</Link>
          <Link href="/admin/sites" className="btn-outline">Add site</Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard highlight title="On shift now" value={active.length} sub="Live headcount" href="/admin" />
        <StatCard title="Off-site" value={offsite.length} sub="Left the boundary" tone="warn" />
        <StatCard title="Pending approvals" value={pending} sub="Awaiting review" href="/admin/approvals" tone="brand" />
        <StatCard title="Workers" value={workers.length} sub={`${sites.length} sites`} href="/admin/workers" />
      </div>

      {/* Row: weekly hours + attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Hours logged</h2>
            <span className="text-xs text-[var(--color-muted)]">by weekday</span>
          </div>
          <WeeklyBars data={weekly} />
        </div>

        <AttentionCard offsite={offsite} pending={pending} />
      </div>

      {/* Row: team status + approvals gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-lg mb-4">Team status</h2>
          <TeamStatus workers={workers} active={active} onViewRoute={setMapShift} />
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-lg mb-2">Approvals progress</h2>
          <Gauge pct={approvalPct} />
          <div className="flex justify-center gap-4 text-xs mt-3">
            <Legend color="var(--color-success)" label={`Approved ${approved}`} />
            <Legend color="var(--color-warn)" label={`Open ${reviewables.length - approved}`} />
          </div>
        </div>
      </div>

      {/* Row: recent + time tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Recent activity</h2>
            <Link href="/admin/approvals" className="text-sm text-brand-600 font-medium">
              Go to approvals →
            </Link>
          </div>
          <RecentActivity shifts={shifts} timesheets={timesheets} />
        </div>

        <TimeTracker active={active} />
      </div>

      {mapShift && (
        <Modal open onClose={() => setMapShift(null)} title={`${mapShift.workerName} · live route`}>
          <div className="mb-3 text-sm text-[var(--color-muted)]">On shift · {mapShift.siteName}</div>
          <ShiftMap shift={mapShift} site={sites.find((s) => s.id === mapShift.siteId) ?? null} />
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------- widgets -------------------------------- */

function StatCard({
  title,
  value,
  sub,
  highlight,
  tone,
  href,
}: {
  title: string;
  value: number;
  sub: string;
  highlight?: boolean;
  tone?: "warn" | "brand";
  href?: string;
}) {
  const body = (
    <div
      className={`rounded-2xl border p-4 h-full ${
        highlight
          ? "bg-brand-600 border-brand-600 text-white"
          : "bg-[var(--color-surface)] border-[var(--color-line)]"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className={`text-sm font-medium ${highlight ? "text-brand-50" : "text-[var(--color-ink-soft)]"}`}>
          {title}
        </span>
        <span
          className={`w-7 h-7 rounded-full grid place-items-center ${
            highlight ? "bg-white/20" : "border border-[var(--color-line)]"
          }`}
        >
          <IconArrowUpRight size={14} />
        </span>
      </div>
      <div className={`text-4xl font-bold mt-3 ${
        tone === "warn" && value > 0 && !highlight ? "text-warn" : ""
      }`}>{value}</div>
      <div className={`text-xs mt-1 ${highlight ? "text-brand-100" : "text-[var(--color-muted)]"}`}>{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function WeeklyBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const peak = data.indexOf(max);
  return (
    <div className="flex items-stretch justify-between gap-2 h-40">
      {data.map((v, i) => {
        const h = Math.max(6, Math.round((v / max) * 100));
        const isPeak = i === peak && v > 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex-1 min-h-0 flex items-end justify-center">
              <div
                className={`w-full max-w-9 rounded-full transition-all ${
                  v === 0
                    ? "bg-[var(--color-canvas)] border border-dashed border-[var(--color-line)]"
                    : isPeak
                    ? "bg-brand-600"
                    : "bg-brand-300"
                }`}
                style={{ height: `${h}%` }}
                title={minutesToHhMm(v)}
              />
            </div>
            <span className="text-xs text-[var(--color-muted)]">{DAYS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

function AttentionCard({ offsite, pending }: { offsite: Shift[]; pending: number }) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-lg mb-3">Needs attention</h2>
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
            <Link
              href="/admin/approvals"
              className="btn-primary w-full mt-1"
            >
              Review {pending} pending {pending === 1 ? "item" : "items"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function TeamStatus({
  workers,
  active,
  onViewRoute,
}: {
  workers: Worker[];
  active: Shift[];
  onViewRoute?: (s: Shift) => void;
}) {
  if (workers.length === 0)
    return <EmptyState icon={<IconUsers size={22} />} title="No workers yet" />;
  const activeByUid = new Map(active.map((s) => [s.workerUid, s]));
  return (
    <ul className="space-y-1">
      {workers.slice(0, 6).map((w) => {
        const shift = w.uid ? activeByUid.get(w.uid) : undefined;
        return (
          <li key={w.id} className="flex items-center gap-3 py-2">
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-sm shrink-0">
              {w.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{w.name}</div>
              <div className="text-xs text-[var(--color-muted)] truncate">
                {shift ? `Working at ${shift.siteName}` : "Off shift"}
              </div>
            </div>
            {shift && (shift.track?.length ?? 0) > 0 && onViewRoute && (
              <button
                onClick={() => onViewRoute(shift)}
                className="text-[var(--color-muted)] hover:text-brand-600 p-1"
                title="View live route"
              >
                <IconMapPin size={16} />
              </button>
            )}
            {shift ? (
              <span className="chip pill-active">On shift</span>
            ) : (
              <span className="chip pill-completed">Off</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Gauge({ pct }: { pct: number }) {
  // Semi-circle gauge.
  const r = 70;
  const circ = Math.PI * r; // half circle length
  const filled = (pct / 100) * circ;
  return (
    <div className="relative grid place-items-center py-2">
      <svg width="180" height="110" viewBox="0 0 180 110">
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 160 100`}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 160 100`}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
        />
      </svg>
      <div className="absolute bottom-1 text-center">
        <div className="text-3xl font-bold">{pct}%</div>
        <div className="text-xs text-[var(--color-muted)]">Approved</div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function RecentActivity({
  shifts,
  timesheets,
}: {
  shifts: Shift[];
  timesheets: Timesheet[];
}) {
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
        <li key={it.id} className="flex items-center gap-3 py-2.5">
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

function TimeTracker({ active }: { active: Shift[] }) {
  const now = useNow(1000);
  const totalMs = active.reduce((sum, s) => sum + (now - s.startedAt), 0);
  return (
    <div className="card p-5 relative overflow-hidden text-white grad-ocean-dark">
      <div className="relative">
        <h2 className="font-semibold text-lg">Time Tracker</h2>
        <p className="text-white/70 text-xs mb-4">Total live time across active shifts</p>
        <div className="text-4xl font-bold tabular-nums">
          {active.length ? elapsed(0, totalMs) : "00:00:00"}
        </div>
        <div className="text-white/80 text-sm mt-2">
          {active.length} worker{active.length === 1 ? "" : "s"} on shift
        </div>
      </div>
    </div>
  );
}
