import "server-only";
import { adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import { computeWorkedMinutes } from "./time";
import { getSite } from "./shift-repo";
import { applySchedule } from "./schedule";
import type { BreakMinutes, HistoryEntry, Timesheet, Worker } from "./types";

export interface TimesheetInput {
  siteLabel: string;
  siteId?: string;
  placeAddress?: string;
  location?: { lat: number; lng: number };
  startAt: number;
  endAt: number;
  breakMinutes: BreakMinutes;
  breakPaid: boolean;
  periodStart?: string;
  note?: string;
}

/**
 * If a picked saved site has auto-round on, snap the entered start/end to its
 * schedule (within the grace window). Returns the possibly-adjusted times and a
 * note describing the change.
 */
async function roundToSiteSchedule(
  siteId: string | undefined,
  startAt: number,
  endAt: number
): Promise<{ startAt: number; endAt: number; note: string | null }> {
  if (!siteId) return { startAt, endAt, note: null };
  const site = await getSite(siteId);
  if (!site?.autoRound) return { startAt, endAt, note: null };
  const sched = applySchedule(site, startAt, endAt);
  if (!sched.applied || sched.payStart == null || sched.payEnd == null)
    return { startAt, endAt, note: null };
  const changed = sched.payStart !== startAt || sched.payEnd !== endAt;
  return {
    startAt: sched.payStart,
    endAt: sched.payEnd,
    note: changed ? `Auto-rounded to ${site.name} schedule (${site.scheduledStart}–${site.scheduledEnd})` : null,
  };
}

export async function createTimesheet(
  worker: Worker,
  input: TimesheetInput
): Promise<string> {
  const rounded = await roundToSiteSchedule(input.siteId, input.startAt, input.endAt);
  const totalMinutes = computeWorkedMinutes(
    rounded.startAt,
    rounded.endAt,
    input.breakMinutes,
    input.breakPaid
  );
  const t = now();
  const history: HistoryEntry[] = [
    { at: t, by: worker.email, action: "Submitted for approval", to: "pending" },
  ];
  if (rounded.note) history.push({ at: t, by: "system", action: rounded.note });

  const ref = await adminDb.collection(COL.timesheets).add({
    workerId: worker.id,
    workerUid: worker.uid,
    workerName: worker.name,
    siteLabel: input.siteLabel.trim(),
    siteId: input.siteId ?? null,
    placeAddress: input.placeAddress ?? null,
    location: input.location ?? null,
    startAt: rounded.startAt,
    endAt: rounded.endAt,
    breakMinutes: input.breakMinutes,
    breakPaid: input.breakPaid,
    periodStart: input.periodStart ?? null,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    status: "pending",
    note: input.note ?? null,
    history,
    createdAt: t,
    updatedAt: t,
  });
  return ref.id;
}

export async function listWorkerTimesheets(uid: string): Promise<Timesheet[]> {
  const snap = await adminDb
    .collection(COL.timesheets)
    .where("workerUid", "==", uid)
    .get();
  const rows = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Timesheet, "id">) })
  );
  return rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

// ---- Timesheet drafts (worker "save but not submit") ----------------------

export interface DraftRow {
  dayKey: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  brk: string;   // minutes as string
  /** Per-day work location (a site can be state-wide, so each day may differ). */
  loc?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface TimesheetDraft {
  periodStart: string;
  siteId?: string | null;
  siteLabel?: string | null;
  lat?: number | null;
  lng?: number | null;
  rows: DraftRow[];
  updatedAt?: number;
}

function draftId(workerUid: string, periodStart: string) {
  return `${workerUid}__${periodStart}`;
}

export async function getTimesheetDraft(
  workerUid: string,
  periodStart: string
): Promise<TimesheetDraft | null> {
  const doc = await adminDb.collection(COL.timesheetDrafts).doc(draftId(workerUid, periodStart)).get();
  if (!doc.exists) return null;
  const d = doc.data() as Partial<TimesheetDraft>;
  return {
    periodStart: d.periodStart || periodStart,
    siteId: d.siteId ?? null,
    siteLabel: d.siteLabel ?? null,
    lat: d.lat ?? null,
    lng: d.lng ?? null,
    rows: Array.isArray(d.rows) ? d.rows : [],
    updatedAt: d.updatedAt,
  };
}

export async function saveTimesheetDraft(
  workerUid: string,
  periodStart: string,
  data: { siteId?: string | null; siteLabel?: string | null; lat?: number | null; lng?: number | null; rows: DraftRow[] }
) {
  await adminDb.collection(COL.timesheetDrafts).doc(draftId(workerUid, periodStart)).set({
    workerUid,
    periodStart,
    siteId: data.siteId ?? null,
    siteLabel: data.siteLabel ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    rows: data.rows,
    updatedAt: now(),
  });
}

export async function deleteTimesheetDraft(workerUid: string, periodStart: string) {
  await adminDb.collection(COL.timesheetDrafts).doc(draftId(workerUid, periodStart)).delete().catch(() => {});
}

/**
 * Admin-created timesheet for casual / one-off work where there is no registered
 * worker. workerName is free text (defaults to "Casual") and workerUid is null,
 * so it never shows in a worker's app but appears in all admin views/exports.
 */
export async function createAdminTimesheet(input: {
  workerName?: string;
  /** Link to a registered worker (from the dropdown); omit for casual work. */
  workerUid?: string | null;
  workerId?: string | null;
  siteLabel: string;
  siteId?: string;
  placeAddress?: string;
  location?: { lat: number; lng: number } | null;
  startAt: number;
  endAt: number;
  breakMinutes: number;
  breakPaid?: boolean;
  periodStart?: string;
  by: string;
}): Promise<string> {
  const rounded = await roundToSiteSchedule(input.siteId, input.startAt, input.endAt);
  const totalMinutes = computeWorkedMinutes(
    rounded.startAt,
    rounded.endAt,
    input.breakMinutes as BreakMinutes,
    !!input.breakPaid
  );
  const t = now();
  const linked = !!input.workerUid;
  const name = (input.workerName || "").trim() || "Casual";
  const history: HistoryEntry[] = [
    { at: t, by: input.by, action: linked ? "Added by admin" : "Added by admin (casual)", to: "pending" },
  ];
  if (rounded.note) history.push({ at: t, by: "system", action: rounded.note });
  const ref = await adminDb.collection(COL.timesheets).add({
    workerId: input.workerId ?? null,
    workerUid: input.workerUid ?? null,
    workerName: name,
    casual: !linked,
    siteLabel: input.siteLabel.trim(),
    siteId: input.siteId ?? null,
    placeAddress: input.placeAddress ?? null,
    location: input.location ?? null,
    startAt: rounded.startAt,
    endAt: rounded.endAt,
    breakMinutes: input.breakMinutes,
    breakPaid: !!input.breakPaid,
    periodStart: input.periodStart ?? null,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    status: "pending",
    note: null,
    history,
    createdAt: t,
    updatedAt: t,
  });
  return ref.id;
}
