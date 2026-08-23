"use client";

import { useState } from "react";
import type { Shift, Site, Timesheet } from "@/lib/types";
import {
  formatAuDateTime,
  formatAuTime,
  minutesToHhMm,
  shiftWorkedMinutes,
} from "@/lib/time";
import { fortnightLabel } from "@/lib/fortnight";
import Modal from "@/components/modal";
import ShiftMap from "@/components/shift-map";
import { StatusPill, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconCheck, IconPencil, IconTrash, IconMapPin } from "@/components/icons";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-[var(--color-line)] last:border-0">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function History({ items }: { items: Shift["history"] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-4">
      <h4 className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">History</h4>
      <ul className="space-y-1.5">
        {items.map((h, i) => (
          <li key={i} className="text-xs text-[var(--color-ink-soft)]">
            <span className="text-[var(--color-muted)]">{formatAuDateTime(h.at)}</span> · {h.action}
            {h.note ? ` — ${h.note}` : ""} <span className="text-[var(--color-muted)]">({h.by})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionFooter({
  onApprove,
  onEdit,
  onDelete,
  busy,
}: {
  onApprove: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: string;
}) {
  return (
    <>
      <button className="btn-ghost text-[var(--color-danger)] mr-auto" onClick={onDelete} disabled={!!busy}>
        {busy === "delete" ? <Spinner /> : <><IconTrash size={15} /> Delete</>}
      </button>
      <button className="btn-outline" onClick={onEdit} disabled={!!busy}>
        <IconPencil size={15} /> Edit
      </button>
      <button className="btn-success" onClick={onApprove} disabled={!!busy}>
        {busy === "approve" ? <Spinner /> : <><IconCheck size={15} /> Approve</>}
      </button>
    </>
  );
}

export function ShiftDetailModal({
  shift,
  site,
  onClose,
  onEdit,
}: {
  shift: Shift;
  site?: Site | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState("");

  async function approve() {
    setBusy("approve");
    const res = await fetch(`/api/admin/approvals/shift/${shift.id}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    setBusy("");
    res.ok ? toast.success("Shift approved") : toast.error("Could not approve");
  }
  async function del() {
    const ok = await confirm({
      title: "Delete this shift?",
      message: `${shift.workerName}'s shift at ${shift.siteName} will be permanently removed.`,
      confirmLabel: "Delete", danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    const res = await fetch(`/api/admin/approvals/shift/${shift.id}`, { method: "DELETE" });
    setBusy("");
    if (res.ok) { toast.success("Shift deleted"); onClose(); }
    else toast.error("Could not delete");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${shift.workerName} · shift`}
      footer={<ActionFooter onApprove={approve} onEdit={onEdit} onDelete={del} busy={busy} />}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <StatusPill status={shift.status} />
        <StatusPill status={shift.approvalStatus} />
        {shift.currentlyInside === false && <span className="chip pill-declined">Off-site</span>}
        {shift.underworked && <span className="chip pill-declined">Under scheduled hours</span>}
      </div>

      <div className="card p-3">
        <Row label="Site" value={shift.siteName} />
        <Row label="Clock-in (actual)" value={formatAuDateTime(shift.startedAt)} />
        <Row label="Clock-out (actual)" value={shift.endedAt ? formatAuDateTime(shift.endedAt) : "In progress"} />
        {shift.payStart != null && shift.payEnd != null && (
          <Row
            label="Paid window (rounded)"
            value={`${formatAuTime(shift.payStart)} – ${formatAuTime(shift.payEnd)}`}
          />
        )}
        <Row label="Elapsed" value={shift.durationMinutes != null ? minutesToHhMm(shift.durationMinutes) : "—"} />
        <Row label="Break" value={`${shift.breakMinutes ?? 0} min`} />
        <Row label="Net worked" value={<b>{minutesToHhMm(shiftWorkedMinutes(shift))}</b>} />
        {shift.startAddress && <Row label="Started at" value={shift.startAddress} />}
        {shift.endAddress && <Row label="Ended at" value={shift.endAddress} />}
      </div>

      {(shift.startPhotoUrl || shift.endPhotoUrl) && (
        <div className="flex gap-3 mt-3">
          {shift.startPhotoUrl && <Photo url={shift.startPhotoUrl} label="Clock-in" />}
          {shift.endPhotoUrl && <Photo url={shift.endPhotoUrl} label="Clock-out" />}
        </div>
      )}

      {(shift.track?.length ?? 0) > 0 && (
        <div className="mt-4">
          <h4 className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1">
            <IconMapPin size={13} /> Movement route
          </h4>
          <ShiftMap shift={shift} site={site} height={260} />
        </div>
      )}

      <History items={shift.history} />
    </Modal>
  );
}

export function TimesheetDetailModal({
  ts,
  onClose,
  onEdit,
}: {
  ts: Timesheet;
  onClose: () => void;
  onEdit: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState("");
  const net = ts.adminTotalMinutes ?? ts.totalMinutes;

  async function approve() {
    setBusy("approve");
    const res = await fetch(`/api/admin/approvals/timesheet/${ts.id}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    setBusy("");
    res.ok ? toast.success("Timesheet approved") : toast.error("Could not approve");
  }
  async function del() {
    const ok = await confirm({
      title: "Delete this timesheet?",
      message: `${ts.workerName}'s timesheet for ${ts.siteLabel} will be permanently removed.`,
      confirmLabel: "Delete", danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    const res = await fetch(`/api/admin/approvals/timesheet/${ts.id}`, { method: "DELETE" });
    setBusy("");
    if (res.ok) { toast.success("Timesheet deleted"); onClose(); }
    else toast.error("Could not delete");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${ts.workerName} · timesheet`}
      footer={<ActionFooter onApprove={approve} onEdit={onEdit} onDelete={del} busy={busy} />}
    >
      <div className="mb-3"><StatusPill status={ts.status} /></div>
      <div className="card p-3">
        <Row label="Location" value={ts.siteLabel} />
        {ts.placeAddress && ts.placeAddress !== ts.siteLabel && <Row label="Address" value={ts.placeAddress} />}
        <Row label="Start" value={formatAuDateTime(ts.startAt)} />
        <Row label="End" value={formatAuDateTime(ts.endAt)} />
        <Row label="Break" value={`${ts.breakMinutes} min ${ts.breakPaid ? "(paid)" : "(unpaid)"}`} />
        <Row label="Total worked" value={<b>{minutesToHhMm(net)}</b>} />
        {ts.periodStart && <Row label="Working period" value={fortnightLabel(ts.periodStart)} />}
        {ts.adminTotalMinutes != null && (
          <Row label="Admin adjusted" value={`${formatAuTime(ts.adminStartAt ?? ts.startAt)}–${formatAuTime(ts.adminEndAt ?? ts.endAt)}`} />
        )}
        {ts.note && <Row label="Note" value={ts.note} />}
      </div>
      <History items={ts.history} />
    </Modal>
  );
}

function Photo({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-28 h-28 rounded-lg object-cover border border-[var(--color-line)]" />
      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{label}</span>
    </a>
  );
}
