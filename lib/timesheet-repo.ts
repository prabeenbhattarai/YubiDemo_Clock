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
