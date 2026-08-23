import "server-only";
import { adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import { computeWorkedMinutes } from "./time";
import type {
  ApprovalStatus,
  BreakMinutes,
  HistoryEntry,
  Shift,
  Timesheet,
} from "./types";

export type ApprovalAction = "approve" | "decline" | "on_hold" | "edit" | "reset";

const ACTION_TO_STATUS: Record<Exclude<ApprovalAction, "reset">, ApprovalStatus> = {
  approve: "approved",
  decline: "declined",
  on_hold: "on_hold",
  edit: "edited",
};

const ACTION_LABEL: Record<ApprovalAction, string> = {
  approve: "Approved",
  decline: "Declined",
  on_hold: "Put on hold",
  edit: "Edited",
  reset: "Reset to pending",
};

export interface ShiftEdit {
  startedAt?: number;
  endedAt?: number;
  breakMinutes?: number;
}

export async function updateShiftApproval(params: {
  shiftId: string;
  action: ApprovalAction;
  by: string;
  note?: string;
  edit?: ShiftEdit;
}) {
  const { shiftId, action, by, note, edit } = params;
  const ref = adminDb.collection(COL.shifts).doc(shiftId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Shift not found");
  const data = doc.data() as Shift;

  const to: ApprovalStatus =
    action === "reset" ? "pending" : ACTION_TO_STATUS[action];

  const update: Record<string, unknown> = {
    approvalStatus: to,
    updatedAt: now(),
  };

  if (action === "edit" && edit) {
    const startedAt = edit.startedAt ?? data.startedAt;
    const endedAt = edit.endedAt ?? data.endedAt ?? data.startedAt;
    update.startedAt = startedAt;
    update.endedAt = endedAt;
    update.durationMinutes = Math.max(0, Math.round((endedAt - startedAt) / 60000));
    // Admin override wins: drop any auto-rounded pay window so the edited
    // actual times are used directly.
    update.payStart = null;
    update.payEnd = null;
    update.underworked = false;
    // Admin can override the break; otherwise leave the existing value.
    if (edit.breakMinutes != null) {
      update.breakMinutes = Math.max(0, Math.round(edit.breakMinutes));
    }
  }

  const entry: HistoryEntry = {
    at: now(),
    by,
    action: ACTION_LABEL[action],
    note: note || undefined,
    from: data.approvalStatus,
    to,
  };
  update.history = [...(data.history ?? []), entry];

  await ref.update(update);
  return to;
}

export interface TimesheetEdit {
  startAt?: number;
  endAt?: number;
  breakMinutes?: BreakMinutes;
  breakPaid?: boolean;
}

export async function updateTimesheetApproval(params: {
  tsId: string;
  action: ApprovalAction;
  by: string;
  note?: string;
  edit?: TimesheetEdit;
}) {
  const { tsId, action, by, note, edit } = params;
  const ref = adminDb.collection(COL.timesheets).doc(tsId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Timesheet not found");
  const data = doc.data() as Timesheet;

  const to: ApprovalStatus =
    action === "reset" ? "pending" : ACTION_TO_STATUS[action];

  const update: Record<string, unknown> = {
    status: to,
    updatedAt: now(),
  };

  if (action === "edit" && edit) {
    const startAt = edit.startAt ?? data.startAt;
    const endAt = edit.endAt ?? data.endAt;
    const breakMinutes = (edit.breakMinutes ?? data.breakMinutes) as BreakMinutes;
    const breakPaid = edit.breakPaid ?? data.breakPaid;
    const total = computeWorkedMinutes(startAt, endAt, breakMinutes, breakPaid);
    update.adminStartAt = startAt;
    update.adminEndAt = endAt;
    update.adminBreakMinutes = breakMinutes;
    update.adminTotalMinutes = total;
  }

  const entry: HistoryEntry = {
    at: now(),
    by,
    action: ACTION_LABEL[action],
    note: note || undefined,
    from: data.status,
    to,
  };
  update.history = [...(data.history ?? []), entry];

  await ref.update(update);
  return to;
}
