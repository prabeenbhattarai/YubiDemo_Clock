"use client";

import { useMemo } from "react";
import { useCurrentUid, useLiveCollection, where } from "@/lib/live";
import type { Shift, Timesheet } from "@/lib/types";
import { formatAuDateTime, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import { fortnightStartForMs, fortnightLabel } from "@/lib/fortnight";
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
    () => shifts.reduce((sum, s) => sum + shiftWorkedMinutes(s), 0),
    [shifts]
  );
  const tsMinutes = useMemo(
    () => timesheets.reduce((sum, t) => sum + (t.adminTotalMinutes ?? t.totalMinutes ?? 0), 0),
    [timesheets]
  );
  const totalMinutes = shiftMinutes + tsMinutes;

  // Group everything into fortnightly working periods (newest first).
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { startKey: string; shifts: Shift[]; timesheets: Timesheet[]; total: number }
    >();
    const get = (key: string) => {
      if (!map.has(key)) map.set(key, { startKey: key, shifts: [], timesheets: [], total: 0 });
      return map.get(key)!;
    };
    for (const s of shiftsSorted) {
      const g = get(fortnightStartForMs(s.startedAt));
      g.shifts.push(s);
      g.total += shiftWorkedMinutes(s);
    }
    for (const t of tsSorted) {
      const g = get(fortnightStartForMs(t.startAt));
      g.timesheets.push(t);
      g.total += t.adminTotalMinutes ?? t.totalMinutes ?? 0;
    }
    return [...map.values()].sort((a, b) => b.startKey.localeCompare(a.startKey));
  }, [shiftsSorted, tsSorted]);

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

            {/* Fortnightly sections */}
            {groups.length === 0 ? (
              <EmptyState icon={<IconClock size={22} />} title="No records yet" />
            ) : (
              groups.map((g) => (
                <section key={g.startKey}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                      {fortnightLabel(g.startKey)}
                    </h2>
                    <span className="chip bg-ocean-50 text-ocean-700 font-semibold">
                      {minutesToHhMm(g.total)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {g.shifts.map((s) => (
                      <ShiftRow key={s.id} shift={s} />
                    ))}
                    {g.timesheets.map((t) => (
                      <TimesheetRow key={t.id} ts={t} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </main>
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

      <div className="flex items-center gap-3 mt-3 text-sm flex-wrap">
        {shift.durationMinutes != null && (
          <span className="font-semibold">{minutesToHhMm(shiftWorkedMinutes(shift))}</span>
        )}
        {(shift.breakMinutes ?? 0) > 0 && (
          <span className="text-[var(--color-muted)] text-xs">
            {shift.breakMinutes}m break deducted
          </span>
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
