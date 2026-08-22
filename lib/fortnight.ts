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

/** Recent fortnights (current + a few future/past), newest first. */
export function listFortnights(pastCount = 12, futureCount = 1): Fortnight[] {
  const curStart = fortnightStartKey(auDateKey(Date.now()));
  const out: Fortnight[] = [];
  for (let i = futureCount; i >= -pastCount; i--) {
    const startKey = addDaysKey(curStart, i * 14);
    out.push({ startKey, endKey: fortnightEndKey(startKey), label: fortnightLabel(startKey) });
  }
  return out;
}

/** Is the given date key inside the fortnight starting at startKey? */
export function isWithinFortnight(dateKey: string, startKey: string): boolean {
  const t = keyToUTC(dateKey);
  return t >= keyToUTC(startKey) && t <= keyToUTC(fortnightEndKey(startKey));
}
