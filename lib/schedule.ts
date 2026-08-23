import type { Site } from "./types";
import { auDateKey } from "./reconcile";

const AU_TZ = "Australia/Sydney";

/** AU wall-clock "HH:MM" for an epoch ms. */
function auHHMM(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: AU_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Epoch ms for a given AU wall time ("HH:MM") on the AU date of refMs.
 * Tries both AEST (+10) and AEDT (+11) so it stays correct across DST.
 */
export function auWallToMs(refMs: number, hhmm: string): number {
  const dateKey = auDateKey(refMs);
  for (const off of ["+10:00", "+11:00"]) {
    const ms = Date.parse(`${dateKey}T${hhmm}:00${off}`);
    if (!Number.isNaN(ms) && auHHMM(ms) === hhmm) return ms;
  }
  return Date.parse(`${dateKey}T${hhmm}:00+10:00`);
}

export interface ScheduleResult {
  applied: boolean;
  payStart?: number;
  payEnd?: number;
  breakMinutes: number;
  underworked: boolean;
  reason?: string;
}

/**
 * Apply a site's standard schedule to actual clock times:
 *  - early start is capped UP to the scheduled start,
 *  - late finish is capped DOWN to the scheduled end,
 *  - a late start or early finish is NOT topped up — it's flagged (underworked).
 */
export function applySchedule(
  site: Site | null | undefined,
  actualStart: number,
  actualEnd: number
): ScheduleResult {
  const grossFallback = { applied: false, breakMinutes: 0, underworked: false };
  if (!site?.autoRound || !site.scheduledStart || !site.scheduledEnd) return grossFallback;

  const schedStart = auWallToMs(actualStart, site.scheduledStart);
  const schedEnd = auWallToMs(actualStart, site.scheduledEnd);
  if (!(schedEnd > schedStart)) return grossFallback; // bad/overnight config → skip

  const payStart = Math.max(actualStart, schedStart); // early start capped up
  const payEnd = Math.min(actualEnd, schedEnd); // late finish capped down
  if (!(payEnd > payStart)) return grossFallback;

  const tol = 60 * 1000; // 1-minute grace
  const lateStart = actualStart > schedStart + tol;
  const earlyEnd = actualEnd < schedEnd - tol;
  const underworked = lateStart || earlyEnd;

  return {
    applied: true,
    payStart,
    payEnd,
    breakMinutes: site.scheduledBreakMinutes ?? 30,
    underworked,
    reason: underworked
      ? [lateStart ? "started late" : "", earlyEnd ? "left early" : ""]
          .filter(Boolean)
          .join(" & ")
      : undefined,
  };
}
