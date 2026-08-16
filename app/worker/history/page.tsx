"use client";

import { useMemo } from "react";
import { useCurrentUid, useLiveCollection, where } from "@/lib/live";
import type { Shift, Timesheet } from "@/lib/types";
import { formatAuDateTime, minutesToHhMm } from "@/lib/time";
import { StatusPill, Spinner, EmptyState } from "@/components/ui";
import { IconClock, IconClipboard } from "@/components/icons";

export default function HistoryPage() {
  const uid = useCurrentUid();
  const { data: shifts, loading: l1 } = useLiveCollection<Shift>(
    "shifts",
    uid ? [where("workerUid", "==", uid)] : [],
    [uid],
    !!uid
  );
  const { data: timesheets, loading: l2 } = useLiveCollection<Timesheet>(
    "timesheets",
    uid ? [where("workerUid", "==", uid)] : [],
    [uid],
    !!uid
  );

  const shiftsSorted = useMemo(
    () => [...shifts].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)),
    [shifts]
  );
  const tsSorted = useMemo(
    () => [...timesheets].sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0)),
    [timesheets]
  );

  const shiftMinutes = useMemo(
    () => shifts.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0),
    [shifts]
  );
  const tsMinutes = useMemo(
    () => timesheets.reduce((sum, t) => sum + (t.adminTotalMinutes ?? t.totalMinutes ?? 0), 0),
    [timesheets]
  );
  const totalMinutes = shiftMinutes + tsMinutes;

  const loading = (l1 || l2) && !uid;

  return (
    <div>
      <header className="bg-white px-5 pt-safe pb-4 border-b border-[var(--color-line)] sticky top-0 z-20">
        <h1 className="text-xl font-bold pt-4">History</h1>
        <p className="text-sm text-[var(--color-muted)]">Your shifts, timesheets & approvals.</p>
      </header>

      <main className="px-5 py-4 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-[var(--color-muted)]">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Overall total */}
            <div className="grad-ocean text-white rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-ocean-100 text-xs font-medium">Total worked</div>
                <div className="text-3xl font-bold tabular-nums">{minutesToHhMm(totalMinutes)}</div>
              </div>
              <div className="text-right text-xs text-ocean-100 leading-relaxed">
                <div>Shifts: <b className="text-white">{minutesToHhMm(shiftMinutes)}</b></div>
                <div>Timesheets: <b className="text-white">{minutesToHhMm(tsMinutes)}</b></div>
              </div>
            </div>

            {/* Clock-in shifts */}
            <section>
              <SectionHeader
                title="Clock-in shifts"
                total={shiftMinutes}
                count={shifts.length}
              />
              {shiftsSorted.length === 0 ? (
                <EmptyState icon={<IconClock size={22} />} title="No shifts yet" />
              ) : (
                <div className="space-y-3">
                  {shiftsSorted.map((s) => (
                    <ShiftRow key={s.id} shift={s} />
                  ))}
                </div>
              )}
            </section>

            {/* Timesheets */}
            <section>
              <SectionHeader title="Timesheets" total={tsMinutes} count={timesheets.length} />
              {tsSorted.length === 0 ? (
                <EmptyState icon={<IconClipboard size={22} />} title="No timesheets yet" />
              ) : (
                <div className="space-y-3">
                  {tsSorted.map((t) => (
                    <TimesheetRow key={t.id} ts={t} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SectionHeader({
  title,
  total,
  count,
}: {
  title: string;
  total: number;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
        {title} {count > 0 && <span className="normal-case font-normal">({count})</span>}
      </h2>
      <span className="chip bg-ocean-50 text-ocean-700 font-semibold">
        {minutesToHhMm(total)}
      </span>
    </div>
  );
}

function ShiftRow({ shift }: { shift: Shift }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{shift.siteName}</div>
          <div className="text-xs text-[var(--color-muted)]">
            {formatAuDateTime(shift.startedAt)}
            {shift.endedAt ? ` → ${formatAuDateTime(shift.endedAt)}` : " · in progress"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={shift.status} />
          <StatusPill status={shift.approvalStatus} />
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-sm">
        {shift.durationMinutes != null && (
          <span className="font-semibold">{minutesToHhMm(shift.durationMinutes)}</span>
        )}
        {shift.currentlyInside === false && shift.status === "active" && (
          <span className="text-warn text-xs">Outside boundary</span>
        )}
      </div>

      {shift.endComment && (
        <p className="text-xs text-[var(--color-ink-soft)] mt-2 bg-[var(--color-canvas)] rounded-lg px-3 py-2">
          &ldquo;{shift.endComment}&rdquo;
        </p>
      )}

      {shift.history?.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-[var(--color-line)] pt-2">
          {shift.history.map((h, i) => (
            <li key={i} className="text-xs text-[var(--color-ink-soft)]">
              <span className="text-[var(--color-muted)]">{formatAuDateTime(h.at)}</span> ·{" "}
              {h.action}
              {h.note ? ` — ${h.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimesheetRow({ ts }: { ts: Timesheet }) {
  const eff = ts.adminTotalMinutes ?? ts.totalMinutes;
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
        <span className="font-semibold">{minutesToHhMm(eff)}</span>
        <span className="text-[var(--color-muted)]">
          {ts.breakMinutes}m {ts.breakPaid ? "paid" : "unpaid"} break
        </span>
      </div>
    </div>
  );
}
