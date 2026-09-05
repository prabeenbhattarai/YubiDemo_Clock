import type { Shift, Site, Timesheet, Worker } from "./types";
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

const AU_STATE_ABBR: Record<string, string> = {
  "new south wales": "nsw",
  victoria: "vic",
  queensland: "qld",
  "south australia": "sa",
  "western australia": "wa",
  tasmania: "tas",
  "northern territory": "nt",
  "australian capital territory": "act",
};

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Is the timesheet's work location inside the shift's site geofence?
 *  - radius  -> haversine distance from the site centre (uses the timesheet's lat/lng)
 *  - state   -> the timesheet address names the state (long name or AU abbreviation)
 *  - country -> the timesheet address names the country (name or code)
 */
export function timesheetInSiteGeofence(site: Site, t: Timesheet): boolean {
  if (site.geofenceType === "radius") {
    if (!t.location || !site.location) return false;
    return haversineM(site.location, t.location) <= (site.radiusMeters ?? 150);
  }
  const addr = normalizeLoc(t.placeAddress || t.siteLabel);
  if (!addr) return false;
  if (site.geofenceType === "state") {
    if (!site.state) return false;
    if (addr.includes(normalizeLoc(site.state))) return true;
    const abbr = AU_STATE_ABBR[site.state.toLowerCase()];
    return !!abbr && new RegExp(`(^| )${abbr}( |$)`).test(addr);
  }
  if (site.geofenceType === "country") {
    if (site.country && addr.includes(normalizeLoc(site.country))) return true;
    return !!site.countryCode && new RegExp(`(^| )${site.countryCode.toLowerCase()}( |$)`).test(addr);
  }
  return false;
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
  timesheets: Timesheet[],
  sites: Site[] = []
): ReconRow[] {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const completed = shifts.filter((s) => s.status === "completed");
  const usedTs = new Set<string>();
  const rows: ReconRow[] = [];

  // 1) Manual links take priority.
  const tsById = new Map(timesheets.map((t) => [t.id, t]));
  for (const s of completed) {
    if (s.linkedTimesheetId && tsById.has(s.linkedTimesheetId)) {
      const t = tsById.get(s.linkedTimesheetId)!;
      usedTs.add(t.id);
      rows.push(makeRow(s, t, siteById));
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
      rows.push(makeRow(s, cand, siteById));
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

function makeRow(s: Shift, t: Timesheet, siteById?: Map<string, Site>): ReconRow {
  const site = siteById?.get(s.siteId);
  const loc =
    (site ? timesheetInSiteGeofence(site, t) : false) ||
    locationsMatch(s.siteName, t.siteLabel);
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
  /** Source document id (shift or timesheet), for edit/delete. */
  id: string;
  location: string;
  dateKey: string;
  workerName: string;
  jobTitle?: string;
  workerUid?: string;
  inMs?: number;
  outMs?: number;
  breakMinutes: number;
  totalMinutes: number;
  status?: string;
  source: "Clock-in" | "Timesheet";
}

/** Flatten shifts + timesheets into per-site entries for export. */
export function buildSiteEntries(
  shifts: Shift[],
  timesheets: Timesheet[],
  workers: Worker[] = []
): ExportEntry[] {
  const titleByUid = new Map<string, string>();
  for (const w of workers) if (w.uid && w.jobTitle) titleByUid.set(w.uid, w.jobTitle);

  const out: ExportEntry[] = [];
  for (const s of shifts) {
    if (s.status !== "completed") continue;
    out.push({
      id: s.id,
      location: s.siteName,
      dateKey: auDateKey(s.startedAt),
      workerName: s.workerName,
      jobTitle: s.workerUid ? titleByUid.get(s.workerUid) : undefined,
      workerUid: s.workerUid,
      inMs: s.payStart ?? s.startedAt,
      outMs: s.payEnd ?? s.endedAt,
      breakMinutes: s.breakMinutes ?? 0,
      totalMinutes: shiftWorkedMinutes(s),
      status: s.approvalStatus,
      source: "Clock-in",
    });
  }
  for (const t of timesheets) {
    out.push({
      id: t.id,
      location: t.siteLabel,
      dateKey: auDateKey(t.startAt),
      workerName: t.workerName,
      jobTitle: t.workerUid ? titleByUid.get(t.workerUid) : undefined,
      workerUid: t.workerUid,
      inMs: t.adminStartAt ?? t.startAt,
      outMs: t.adminEndAt ?? t.endAt,
      breakMinutes: t.adminBreakMinutes ?? t.breakMinutes ?? 0,
      totalMinutes: timesheetWorkedMinutes(t),
      status: t.status,
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
    const key = normalizeLoc((e.location || "").split(",")[0]) || "unspecified";
    if (!groups.has(key)) groups.set(key, { label: e.location || "Unspecified", entries: [] });
    const g = groups.get(key)!;
    // Prefer the shortest non-empty label as the clean site name.
    if (e.location && e.location.length < g.label.length) g.label = e.location;
    g.entries.push(e);
  }
  return [...groups.values()]
    .map((g) => ({
      label: g.label,
      entries: g.entries.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
      totalMinutes: g.entries.reduce((s, e) => s + e.totalMinutes, 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
