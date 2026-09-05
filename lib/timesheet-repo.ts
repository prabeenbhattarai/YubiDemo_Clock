import "server-only";
import { adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import { computeWorkedMinutes } from "./time";
import type { BreakMinutes, HistoryEntry, Timesheet, Worker } from "./types";

export interface TimesheetInput {
  siteLabel: string;
  placeAddress?: string;
  location?: { lat: number; lng: number };
  startAt: number;
  endAt: number;
  breakMinutes: BreakMinutes;
  breakPaid: boolean;
  periodStart?: string;
  note?: string;
}

export async function createTimesheet(
  worker: Worker,
  input: TimesheetInput
): Promise<string> {
  const totalMinutes = computeWorkedMinutes(
    input.startAt,
    input.endAt,
    input.breakMinutes,
    input.breakPaid
  );
  const t = now();
  const history: HistoryEntry[] = [
    { at: t, by: worker.email, action: "Submitted for approval", to: "pending" },
  ];

  const ref = await adminDb.collection(COL.timesheets).add({
    workerId: worker.id,
    workerUid: worker.uid,
    workerName: worker.name,
    siteLabel: input.siteLabel.trim(),
    placeAddress: input.placeAddress ?? null,
    location: input.location ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
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
  loc: string;
  lat: number | null;
  lng: number | null;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  brk: string;   // minutes as string
}

function draftId(workerUid: string, periodStart: string) {
  return `${workerUid}__${periodStart}`;
}

export async function getTimesheetDraft(
  workerUid: string,
  periodStart: string
): Promise<{ periodStart: string; rows: DraftRow[]; updatedAt?: number } | null> {
  const doc = await adminDb.collection(COL.timesheetDrafts).doc(draftId(workerUid, periodStart)).get();
  if (!doc.exists) return null;
  const d = doc.data() as { periodStart?: string; rows?: DraftRow[]; updatedAt?: number };
  return { periodStart: d.periodStart || periodStart, rows: Array.isArray(d.rows) ? d.rows : [], updatedAt: d.updatedAt };
}

export async function saveTimesheetDraft(workerUid: string, periodStart: string, rows: DraftRow[]) {
  await adminDb.collection(COL.timesheetDrafts).doc(draftId(workerUid, periodStart)).set({
    workerUid,
    periodStart,
    rows,
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
  siteLabel: string;
  placeAddress?: string;
  location?: { lat: number; lng: number } | null;
  startAt: number;
  endAt: number;
  breakMinutes: number;
  breakPaid?: boolean;
  periodStart?: string;
  by: string;
}): Promise<string> {
  const totalMinutes = computeWorkedMinutes(
    input.startAt,
    input.endAt,
    input.breakMinutes as BreakMinutes,
    !!input.breakPaid
  );
  const t = now();
  const name = (input.workerName || "").trim() || "Casual";
  const history: HistoryEntry[] = [
    { at: t, by: input.by, action: "Added by admin (casual)", to: "pending" },
  ];
  const ref = await adminDb.collection(COL.timesheets).add({
    workerId: null,
    workerUid: null,
    workerName: name,
    casual: true,
    siteLabel: input.siteLabel.trim(),
    placeAddress: input.placeAddress ?? null,
    location: input.location ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
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
