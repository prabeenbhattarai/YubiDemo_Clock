"use client";

import { useMemo, useState } from "react";
import { orderBy, useLiveCollection } from "@/lib/live";
import type { ApprovalStatus, Shift, Site, Timesheet } from "@/lib/types";
import { formatAuDateTime, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import { StatusPill, Spinner, EmptyState } from "@/components/ui";
import Modal from "@/components/modal";
import ShiftMap from "@/components/shift-map";
import { useToast } from "@/components/toast";
import {
  IconCheck,
  IconPencil,
  IconX,
  IconPause,
  IconCamera,
  IconApprovals,
  IconMapPin,
} from "@/components/icons";

const ACTION_TOAST: Record<string, string> = {
  approve: "Approved",
  decline: "Declined",
  on_hold: "Put on hold",
  edit: "Changes saved",
  reset: "Reset to pending",
};

type Tab = "timesheets" | "shifts";
const STATUS_FILTERS: (ApprovalStatus | "all")[] = [
  "pending",
  "approved",
  "on_hold",
  "declined",
  "edited",
  "all",
];

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("timesheets");
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");

  return (
    <div>
      <h1 className="text-2xl font-bold">Approvals</h1>
      <p className="text-[var(--color-muted)] text-sm mb-5">
        Review, edit and approve submitted time.
      </p>

      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === "timesheets"} onClick={() => setTab("timesheets")}>
          Timesheets
        </TabBtn>
        <TabBtn active={tab === "shifts"} onClick={() => setTab("shifts")}>
          Clock-in shifts
        </TabBtn>
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip whitespace-nowrap capitalize ${
              filter === f
                ? "bg-brand-600 text-white"
                : "bg-white border border-[var(--color-line)] text-[var(--color-ink-soft)]"
            }`}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      {tab === "timesheets" ? (
        <TimesheetList filter={filter} />
      ) : (
        <ShiftList filter={filter} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium ${
        active ? "bg-ink text-white" : "bg-white border border-[var(--color-line)]"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Timesheets ------------------------------ */

function TimesheetList({ filter }: { filter: ApprovalStatus | "all" }) {
  const { data, loading } = useLiveCollection<Timesheet>("timesheets", [
    orderBy("createdAt", "desc"),
  ]);
  const toast = useToast();
  const rows = data.filter((t) => filter === "all" || t.status === filter);
  const [editing, setEditing] = useState<Timesheet | null>(null);

  if (loading)
    return <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>;
  if (rows.length === 0)
    return <EmptyState icon={<IconApprovals size={22} />} title="Nothing here" subtitle={`No ${filter} timesheets.`} />;

  return (
    <div className="space-y-3">
      {rows.map((ts) => (
        <div key={ts.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{ts.workerName}</div>
              <div className="text-sm text-[var(--color-muted)] truncate">{ts.siteLabel}</div>
              <div className="text-xs text-[var(--color-muted)] mt-1">
                {formatAuDateTime(ts.startAt)} → {formatAuDateTime(ts.endAt)}
              </div>
            </div>
            <StatusPill status={ts.status} />
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm">
            <span className="font-semibold">
              {minutesToHhMm(ts.adminTotalMinutes ?? ts.totalMinutes)}
            </span>
            <span className="text-[var(--color-muted)]">
              {ts.breakMinutes}m {ts.breakPaid ? "paid" : "unpaid"} break
            </span>
          </div>

          <Actions
            onAction={(action, note) =>
              act(`/api/admin/approvals/timesheet/${ts.id}`, action, note, undefined, toast)
            }
            onEdit={() => setEditing(ts)}
            status={ts.status}
          />
        </div>
      ))}

      {editing && (
        <EditTimesheet ts={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export function EditTimesheet({ ts, onClose }: { ts: Timesheet; onClose: () => void }) {
  const [start, setStart] = useState(toLocalInput(ts.adminStartAt ?? ts.startAt));
  const [end, setEnd] = useState(toLocalInput(ts.adminEndAt ?? ts.endAt));
  const [breakMin, setBreakMin] = useState(ts.adminBreakMinutes ?? ts.breakMinutes);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    setSaving(true);
    const ok = await act(`/api/admin/approvals/timesheet/${ts.id}`, "edit", note, {
      startAt: new Date(start).getTime(),
      endAt: new Date(end).getTime(),
      breakMinutes: Number(breakMin),
    }, toast);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit timesheet"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : "Save & mark edited"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="label">Start</label>
        <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        <label className="label">End</label>
        <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        <label className="label">Break (minutes)</label>
        <input type="number" className="input" value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) as typeof breakMin)} />
        <label className="label">Note (optional)</label>
        <input className="input" placeholder="Reason for edit" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/* --------------------------------- Shifts -------------------------------- */

function ShiftList({ filter }: { filter: ApprovalStatus | "all" }) {
  const { data, loading } = useLiveCollection<Shift>("shifts", [
    orderBy("startedAt", "desc"),
  ]);
  const toast = useToast();
  const { data: sites } = useLiveCollection<Site>("sites", []);
  const rows = data
    .filter((s) => s.status === "completed")
    .filter((s) => filter === "all" || s.approvalStatus === filter);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [mapShift, setMapShift] = useState<Shift | null>(null);

  if (loading)
    return <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>;
  if (rows.length === 0)
    return <EmptyState icon={<IconApprovals size={22} />} title="Nothing here" subtitle={`No ${filter} shifts.`} />;

  return (
    <div className="space-y-3">
      {rows.map((s) => (
        <div key={s.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{s.workerName}</div>
              <div className="text-sm text-[var(--color-muted)] truncate">{s.siteName}</div>
              <div className="text-xs text-[var(--color-muted)] mt-1">
                {formatAuDateTime(s.startedAt)}
                {s.endedAt ? ` → ${formatAuDateTime(s.endedAt)}` : ""}
              </div>
            </div>
            <StatusPill status={s.approvalStatus} />
          </div>

          <div className="flex items-center gap-3 mt-3 text-sm flex-wrap">
            {s.durationMinutes != null && (
              <span className="font-semibold">{minutesToHhMm(shiftWorkedMinutes(s))}</span>
            )}
            {(s.breakMinutes ?? 0) > 0 && (
              <span className="text-xs text-[var(--color-muted)]">{s.breakMinutes}m break</span>
            )}
            {(s.startPhotoUrl || s.endPhotoUrl) && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                <IconCamera size={13} /> photo
              </span>
            )}
            {s.currentlyInside === false && (
              <span className="text-xs text-warn">left boundary</span>
            )}
            {(s.track?.length ?? 0) > 0 && (
              <button
                onClick={() => setMapShift(s)}
                className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium ml-auto"
              >
                <IconMapPin size={14} /> View route
              </button>
            )}
          </div>

          {(s.startPhotoUrl || s.endPhotoUrl) && (
            <div className="flex gap-2 mt-3">
              {s.startPhotoUrl && <Thumb url={s.startPhotoUrl} label="In" />}
              {s.endPhotoUrl && <Thumb url={s.endPhotoUrl} label="Out" />}
            </div>
          )}

          <Actions
            onAction={(action, note) =>
              act(`/api/admin/approvals/shift/${s.id}`, action, note, undefined, toast)
            }
            onEdit={() => setEditing(s)}
            status={s.approvalStatus}
          />
        </div>
      ))}

      {editing && <EditShift shift={editing} onClose={() => setEditing(null)} />}

      {mapShift && (
        <Modal open onClose={() => setMapShift(null)} title={`${mapShift.workerName} · route`}>
          <div className="mb-3 text-sm text-[var(--color-muted)]">
            {formatAuDateTime(mapShift.startedAt)}
            {mapShift.endedAt ? ` → ${formatAuDateTime(mapShift.endedAt)}` : ""} · {mapShift.siteName}
          </div>
          <ShiftMap
            shift={mapShift}
            site={sites.find((s) => s.id === mapShift.siteId) ?? null}
          />
        </Modal>
      )}
    </div>
  );
}

export function EditShift({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const [start, setStart] = useState(toLocalInput(shift.startedAt));
  const [end, setEnd] = useState(toLocalInput(shift.endedAt ?? shift.startedAt));
  const [breakMin, setBreakMin] = useState(shift.breakMinutes ?? 0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const worked = Math.max(0, Math.round((endMs - startMs) / 60000) - breakMin);

  async function save() {
    setSaving(true);
    const ok = await act(`/api/admin/approvals/shift/${shift.id}`, "edit", note, {
      startedAt: startMs,
      endedAt: endMs,
      breakMinutes: Number(breakMin),
    }, toast);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit shift"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : "Save & mark edited"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="label">Clock-in</label>
        <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        <label className="label">Clock-out</label>
        <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        <label className="label">Break (minutes) — auto 30 for shifts over 4h</label>
        <input type="number" min={0} step={5} className="input" value={breakMin} onChange={(e) => setBreakMin(Math.max(0, Number(e.target.value)))} />
        <div className="rounded-lg bg-[var(--color-canvas)] px-3 py-2 text-sm">
          Net worked: <b>{minutesToHhMm(worked)}</b>
        </div>
        <label className="label">Note (optional)</label>
        <input className="input" placeholder="Reason for edit" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/* -------------------------------- shared --------------------------------- */

function Thumb({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-16 h-16 rounded-lg object-cover border border-[var(--color-line)]" />
      <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
        {label}
      </span>
    </a>
  );
}

function Actions({
  onAction,
  onEdit,
  status,
}: {
  onAction: (action: string, note?: string) => Promise<unknown>;
  onEdit: () => void;
  status: ApprovalStatus;
}) {
  const [busy, setBusy] = useState("");
  async function run(action: string) {
    setBusy(action);
    await onAction(action);
    setBusy("");
  }
  return (
    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[var(--color-line)]">
      {status !== "approved" && (
        <button className="btn-success px-3 py-2 text-xs" onClick={() => run("approve")} disabled={!!busy}>
          {busy === "approve" ? <Spinner /> : <><IconCheck size={15} /> Approve</>}
        </button>
      )}
      <button className="btn-outline px-3 py-2 text-xs" onClick={onEdit} disabled={!!busy}>
        <IconPencil size={15} /> Edit
      </button>
      {status !== "on_hold" && (
        <button className="btn-ghost px-3 py-2 text-xs" onClick={() => run("on_hold")} disabled={!!busy}>
          {busy === "on_hold" ? <Spinner /> : <><IconPause size={15} /> On hold</>}
        </button>
      )}
      {status !== "declined" && (
        <button className="btn-ghost px-3 py-2 text-xs text-[var(--color-danger)]" onClick={() => run("decline")} disabled={!!busy}>
          {busy === "decline" ? <Spinner /> : <><IconX size={15} /> Decline</>}
        </button>
      )}
    </div>
  );
}

async function act(
  url: string,
  action: string,
  note?: string,
  edit?: Record<string, unknown>,
  toast?: ReturnType<typeof useToast>
): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, note, edit }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    toast?.error("Action failed", d.error);
    return false;
  }
  toast?.success(ACTION_TOAST[action] || "Updated");
  return true;
}

function toLocalInput(ms: number) {
  const d = new Date(ms);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}
