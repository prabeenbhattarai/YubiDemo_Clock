import type { Shift, Timesheet } from "./types";
import { shiftWorkedMinutes } from "./time";

export const AU_TZ = "Australia/Sydney";

/** YYYY-MM-DD in Australian time (stable grouping key). */
export function auDateKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AU_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function normalizeLoc(s: string | undefined | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Loose location match: one contains the other (after normalizing). */
export function locationsMatch(a?: string, b?: string): boolean {
  const na = normalizeLoc(a);
  const nb = normalizeLoc(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function timesheetWorkedMinutes(t: Timesheet): number {
  return t.adminTotalMinutes ?? t.totalMinutes ?? 0;
}

export type MatchState = "matched" | "location-mismatch" | "shift-only" | "timesheet-only";

export interface ReconRow {
  key: string;
  workerName: string;
  workerUid?: string;
  dateKey: string;
  shift?: Shift;
  timesheet?: Timesheet;
  state: MatchState;
}

/**
 * Pair each worker's clock-in shift with their manual timesheet when they fall
 * on the same day. Honors manual links first, then auto-matches by worker+date,
 * flagging whether the location also matches.
 */
export function buildReconciliation(
  shifts: Shift[],
  timesheets: Timesheet[]
): ReconRow[] {
  const completed = shifts.filter((s) => s.status === "completed");
  const usedTs = new Set<string>();
  const rows: ReconRow[] = [];

  // 1) Manual links take priority.
  const tsById = new Map(timesheets.map((t) => [t.id, t]));
  for (const s of completed) {
    if (s.linkedTimesheetId && tsById.has(s.linkedTimesheetId)) {
      const t = tsById.get(s.linkedTimesheetId)!;
      usedTs.add(t.id);
      rows.push(makeRow(s, t));
    }
  }
  const linkedShiftIds = new Set(rows.map((r) => r.shift?.id));

  // 2) Auto-match remaining shifts by worker + same AU date.
  for (const s of completed) {
    if (linkedShiftIds.has(s.id)) continue;
    const dk = auDateKey(s.startedAt);
    const cand = timesheets.find(
      (t) =>
        !usedTs.has(t.id) &&
        t.workerUid === s.workerUid &&
        auDateKey(t.startAt) === dk
    );
    if (cand) {
      usedTs.add(cand.id);
      rows.push(makeRow(s, cand));
    } else {
      rows.push({
        key: `s-${s.id}`,
        workerName: s.workerName,
        workerUid: s.workerUid,
        dateKey: dk,
        shift: s,
        state: "shift-only",
      });
    }
  }

  // 3) Timesheets with no shift.
  for (const t of timesheets) {
    if (usedTs.has(t.id)) continue;
    rows.push({
      key: `t-${t.id}`,
      workerName: t.workerName,
      workerUid: t.workerUid,
      dateKey: auDateKey(t.startAt),
      timesheet: t,
      state: "timesheet-only",
    });
  }

  return rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function makeRow(s: Shift, t: Timesheet): ReconRow {
  const loc = locationsMatch(s.siteName, t.siteLabel);
  return {
    key: `p-${s.id}`,
    workerName: s.workerName,
    workerUid: s.workerUid,
    dateKey: auDateKey(s.startedAt),
    shift: s,
    timesheet: t,
    state: loc ? "matched" : "location-mismatch",
  };
}

/* ------------------------------ site export ------------------------------ */

export interface ExportEntry {
  location: string;
  dateKey: string;
  workerName: string;
  inMs?: number;
  outMs?: number;
  breakMinutes: number;
  totalMinutes: number;
  source: "Clock-in" | "Timesheet";
}

/** Flatten shifts + timesheets into per-site entries for export. */
export function buildSiteEntries(
  shifts: Shift[],
  timesheets: Timesheet[]
): ExportEntry[] {
  const out: ExportEntry[] = [];
  for (const s of shifts) {
    if (s.status !== "completed") continue;
    out.push({
      location: s.siteName,
      dateKey: auDateKey(s.startedAt),
      workerName: s.workerName,
      inMs: s.startedAt,
      outMs: s.endedAt,
      breakMinutes: s.breakMinutes ?? 0,
      totalMinutes: shiftWorkedMinutes(s),
      source: "Clock-in",
    });
  }
  for (const t of timesheets) {
    out.push({
      location: t.siteLabel,
      dateKey: auDateKey(t.startAt),
      workerName: t.workerName,
      inMs: t.adminStartAt ?? t.startAt,
      outMs: t.adminEndAt ?? t.endAt,
      breakMinutes: t.adminBreakMinutes ?? t.breakMinutes ?? 0,
      totalMinutes: timesheetWorkedMinutes(t),
      source: "Timesheet",
    });
  }
  return out;
}

/** Group entries by location (normalized), keeping a display label. */
export function groupByLocation(entries: ExportEntry[]): {
  label: string;
  entries: ExportEntry[];
  totalMinutes: number;
}[] {
  const groups = new Map<string, { label: string; entries: ExportEntry[] }>();
  for (const e of entries) {
    const key = normalizeLoc(e.location) || "unspecified";
    if (!groups.has(key)) groups.set(key, { label: e.location || "Unspecified", entries: [] });
    groups.get(key)!.entries.push(e);
  }
  return [...groups.values()]
    .map((g) => ({
      label: g.label,
      entries: g.entries.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
      totalMinutes: g.entries.reduce((s, e) => s + e.totalMinutes, 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
