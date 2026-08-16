import type { BreakMinutes } from "./types";

export const AU_TZ = "Australia/Sydney";

/** Parts of the current time in the Australian timezone. */
export function auNow(tz: string = AU_TZ) {
  return auParts(Date.now(), tz);
}

export function auParts(epochMs: number, tz: string = AU_TZ) {
  const d = new Date(epochMs);
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
  const dateLong = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(d)
  );
  return { time, dateLong, hour };
}

/** Time-of-day greeting based on the Australian hour. */
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatAuTime(epochMs: number, tz: string = AU_TZ): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(epochMs));
}

export function formatAuDateTime(epochMs: number, tz: string = AU_TZ): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(epochMs));
}

/** Elapsed HH:MM:SS from a start time to now (for the live shift timer). */
export function elapsed(startMs: number, nowMs: number = Date.now()): string {
  let s = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function minutesToHhMm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return `${h}h ${m}m`;
}

/** Company rule: shifts longer than 4h get an automatic 30-min unpaid break. */
export function autoBreakMinutes(grossMinutes: number): number {
  return grossMinutes > 240 ? 30 : 0;
}

/** Net worked minutes for a clock-in shift (gross elapsed minus break). */
export function shiftWorkedMinutes(shift: {
  durationMinutes?: number;
  breakMinutes?: number;
}): number {
  return Math.max(0, (shift.durationMinutes ?? 0) - (shift.breakMinutes ?? 0));
}

/**
 * Compute worked minutes for a manual timesheet.
 * Unpaid breaks are subtracted; paid breaks are not.
 */
export function computeWorkedMinutes(
  startAt: number,
  endAt: number,
  breakMinutes: BreakMinutes,
  breakPaid: boolean
): number {
  const gross = Math.max(0, Math.round((endAt - startAt) / 60000));
  const deduction = breakPaid ? 0 : breakMinutes;
  return Math.max(0, gross - deduction);
}
