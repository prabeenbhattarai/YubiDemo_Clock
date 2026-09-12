import { auDateKey } from "./reconcile";

// Fortnightly working periods: 14 days, starting Monday and ending Sunday.
// Anchored to Monday 1 Jan 2024. All math is on calendar dates (UTC epoch of
// midnight) to stay DST-safe; input dates are Australian date keys.

const DAY = 86400000;
const ANCHOR = Date.UTC(2024, 0, 1); // Monday
const pad = (n: number) => String(n).padStart(2, "0");

function keyToUTC(k: string): number {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function utcToKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDaysKey(k: string, n: number): string {
  return utcToKey(keyToUTC(k) + n * DAY);
}

/** Start (Monday) of the fortnight that contains the given date key. */
export function fortnightStartKey(dateKey: string): string {
  const diff = Math.floor((keyToUTC(dateKey) - ANCHOR) / DAY);
  const block = Math.floor(diff / 14);
  return utcToKey(ANCHOR + block * 14 * DAY);
}

/** Fortnight start for an epoch-ms timestamp (via AU date). */
export function fortnightStartForMs(ms: number): string {
  return fortnightStartKey(auDateKey(ms));
}

/** End (Sunday) of the fortnight given its start Monday key. */
export function fortnightEndKey(startKey: string): string {
  return addDaysKey(startKey, 13);
}

function fmt(k: string, withYear = false): string {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(dt);
}

/** e.g. "18 Aug – 31 Aug 2026". */
export function fortnightLabel(startKey: string): string {
  return `${fmt(startKey)} – ${fmt(fortnightEndKey(startKey), true)}`;
}

export interface Fortnight {
  startKey: string;
  endKey: string;
  label: string;
}

// Fixed bounds for the selectable working periods (both are grid Mondays):
//   earliest = 27 Jul – 9 Aug 2026, latest = 26 Jul – 8 Aug 2027.
// Bounding the list keeps stale early periods out of every picker and caps the
// future at July 2027; extend MAX_PERIOD_START when the next year is needed.
export const MIN_PERIOD_START = "2026-07-27";
export const MAX_PERIOD_START = "2027-07-26";

/** All selectable working periods, newest first, within the fixed bounds. */
export function listFortnights(): Fortnight[] {
  const out: Fortnight[] = [];
  for (let k = MIN_PERIOD_START; k <= MAX_PERIOD_START; k = addDaysKey(k, 14)) {
    out.push({ startKey: k, endKey: fortnightEndKey(k), label: fortnightLabel(k) });
  }
  return out.reverse(); // newest first
}

/** Is the given date key inside the fortnight starting at startKey? */
export function isWithinFortnight(dateKey: string, startKey: string): boolean {
  const t = keyToUTC(dateKey);
  return t >= keyToUTC(startKey) && t <= keyToUTC(fortnightEndKey(startKey));
}
