"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { orderBy, useLiveCollection } from "@/lib/live";
import type { ApprovalStatus, Shift, Site, Timesheet, Worker } from "@/lib/types";
import { formatAuDateTime, formatAuTime, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import { auDateKey } from "@/lib/reconcile";
import { SITE_ALL, belongsToSite } from "@/lib/site-filter";
import { listFortnights, isWithinFortnight, fortnightLabel, fortnightStartKey } from "@/lib/fortnight";
import { StatusPill, Spinner, EmptyState } from "@/components/ui";
import Modal from "@/components/modal";
import { ShiftDetailModal, TimesheetDetailModal } from "@/components/record-detail";
import ShiftMap from "@/components/shift-map";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import {
  IconCheck,
  IconPencil,
  IconX,
  IconPause,
  IconCamera,
  IconApprovals,
  IconMapPin,
  IconInfo,
  IconTrash,
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

const ALL = "all";

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("timesheets");
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  // Default to the current working period; admin can widen to "All periods".
  const [period, setPeriod] = useState<string>(() => fortnightStartKey(auDateKey(Date.now())));
  const [siteId, setSiteId] = useState<string>(SITE_ALL);
  const [workerName, setWorkerName] = useState<string>(ALL);

  const { data: sites } = useLiveCollection<Site>("sites", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const periods = useMemo(() => listFortnights(), []);
  const activeSites = useMemo(() => sites.filter((s) => s.active !== false), [sites]);
  const workerNames = useMemo(
    () =>
      Array.from(new Set(workers.filter((w) => w.active !== false).map((w) => w.name)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [workers]
  );

  // Human summary of the active filters — printed under the PDF heading.
  const siteName = siteId === SITE_ALL ? "All sites" : sites.find((s) => s.id === siteId)?.name ?? "Site";
  const subtitle = [
    siteName,
    period === ALL ? "All periods" : fortnightLabel(period),
    workerName === ALL ? "All workers" : workerName,
    filter === ALL ? "All statuses" : filter.replace("_", " "),
  ].join(" · ");

  return (
    <div>
      <h1 className="text-2xl font-bold no-print">Approvals</h1>
      <p className="text-[var(--color-muted)] text-sm mb-5 no-print">
        Review, edit and approve submitted time.
      </p>

      <div className="flex gap-2 mb-4 no-print">
        <TabBtn active={tab === "timesheets"} onClick={() => setTab("timesheets")}>
          Timesheets
        </TabBtn>
        <TabBtn active={tab === "shifts"} onClick={() => setTab("shifts")}>
          Clock-in shifts
        </TabBtn>
      </div>

      {/* Site + working-period + worker filters, applied to both tabs. */}
      <div className="card p-4 mb-4 no-print flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Site / project</label>
          <select className="input max-w-xs" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value={SITE_ALL}>All sites</option>
            {activeSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Working period</label>
          <select className="input max-w-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value={ALL}>All periods</option>
            {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
          </select>
        </div>
        <div>
          <label className="label">Worker</label>
          <select className="input max-w-xs" value={workerName} onChange={(e) => setWorkerName(e.target.value)}>
            <option value={ALL}>All workers</option>
            {workerNames.map((w) => (<option key={w} value={w}>{w}</option>))}
          </select>
        </div>
        <button className="btn-primary ml-auto self-end" onClick={() => window.print()}>
          Export PDF
        </button>
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 no-print">
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
        <TimesheetList
          filter={filter}
          period={period}
          siteId={siteId}
          sites={sites}
          workerName={workerName}
          subtitle={subtitle}
        />
      ) : (
        <ShiftList
          filter={filter}
          period={period}
          siteId={siteId}
          sites={sites}
          workerName={workerName}
          subtitle={subtitle}
        />
      )}
    </div>
  );
}

/** Filters shared by both approval lists. */
interface ListFilters {
  filter: ApprovalStatus | "all";
  period: string;
  siteId: string;
  sites: Site[];
  workerName: string;
  subtitle: string;
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

function TimesheetList({ filter, period, siteId, sites, workerName, subtitle }: ListFilters) {
  const { data, loading } = useLiveCollection<Timesheet>("timesheets", [
    orderBy("createdAt", "desc"),
  ]);
  const toast = useToast();
  const confirm = useConfirm();
  const rows = data
    .filter((t) => filter === "all" || t.status === filter)
    .filter((t) => belongsToSite(t, siteId, sites))
    .filter((t) => period === "all" || isWithinFortnight(auDateKey(t.startAt), period))
    .filter((t) => workerName === "all" || t.workerName === workerName);
  const [editing, setEditing] = useState<Timesheet | null>(null);
  const [detail, setDetail] = useState<Timesheet | null>(null);

  async function del(ts: Timesheet) {
    const ok = await confirm({
      title: "Delete this timesheet?",
      message: `Permanently delete ${ts.workerName}'s timesheet for ${ts.siteLabel}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/approvals/timesheet/${ts.id}`, { method: "DELETE" });
    if (res.ok) toast.success("Timesheet deleted");
    else toast.error("Could not delete");
  }

  if (loading)
    return <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>;

  return (
    <>
    <TimesheetsPrint rows={rows} subtitle={subtitle} />
    {rows.length === 0 ? (
      <div className="no-print">
        <EmptyState icon={<IconApprovals size={22} />} title="Nothing here" subtitle="No timesheets match these filters." />
      </div>
    ) : (
    <div className="space-y-3 no-print">
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
            onDetails={() => setDetail(ts)}
            onDelete={() => del(ts)}
            status={ts.status}
          />
        </div>
      ))}

      {editing && (
        <EditTimesheet ts={editing} onClose={() => setEditing(null)} />
      )}
      {detail && (
        <TimesheetDetailModal
          ts={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}
    </div>
    )}
    </>
  );
}

export function EditTimesheet({ ts, onClose }: { ts: Timesheet; onClose: () => void }) {
  const [start, setStart] = useState(toLocalInput(ts.adminStartAt ?? ts.startAt));
  const [end, setEnd] = useState(toLocalInput(ts.adminEndAt ?? ts.endAt));
  const [breakMin, setBreakMin] = useState(ts.adminBreakMinutes ?? ts.breakMinutes);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const workerList = useMemo(
    () => workers.filter((w) => w.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [workers]
  );
  const [workerId, setWorkerId] = useState("");
  // Preselect the timesheet's current worker once the list has loaded.
  useEffect(() => {
    if (workerId) return;
    const match = workers.find(
      (w) => (ts.workerUid && w.uid === ts.workerUid) || (ts.workerId && w.id === ts.workerId)
    );
    if (match) setWorkerId(match.id);
  }, [workers, ts.workerUid, ts.workerId, workerId]);

  async function save() {
    const w = workerList.find((x) => x.id === workerId);
    setSaving(true);
    const ok = await act(`/api/admin/approvals/timesheet/${ts.id}`, "edit", note, {
      startAt: new Date(start).getTime(),
      endAt: new Date(end).getTime(),
      breakMinutes: Number(breakMin),
      workerName: w?.name ?? "",
      workerUid: w?.uid ?? null,
      workerId: w?.id ?? null,
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
        <label className="label">Worker</label>
        <select className="input" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          <option value="">Casual (no registered worker)</option>
          {workerList.map((w) => (
            <option key={w.id} value={w.id}>{w.name}{w.jobTitle ? ` — ${w.jobTitle}` : ""}</option>
          ))}
        </select>
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

function ShiftList({ filter, period, siteId, sites, workerName, subtitle }: ListFilters) {
  const { data, loading } = useLiveCollection<Shift>("shifts", [
    orderBy("startedAt", "desc"),
  ]);
  const toast = useToast();
  const confirm = useConfirm();
  const rows = data
    .filter((s) => s.status === "completed")
    .filter((s) => filter === "all" || s.approvalStatus === filter)
    .filter((s) => belongsToSite(s, siteId, sites))
    .filter((s) => period === "all" || isWithinFortnight(auDateKey(s.startedAt), period))
    .filter((s) => workerName === "all" || s.workerName === workerName);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [mapShift, setMapShift] = useState<Shift | null>(null);
  const [detail, setDetail] = useState<Shift | null>(null);

  async function del(s: Shift) {
    const ok = await confirm({
      title: "Delete this shift?",
      message: `Permanently delete ${s.workerName}'s shift at ${s.siteName}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/approvals/shift/${s.id}`, { method: "DELETE" });
    if (res.ok) toast.success("Shift deleted");
    else toast.error("Could not delete");
  }

  if (loading)
    return <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>;

  return (
    <>
    <ShiftsPrint rows={rows} subtitle={subtitle} />
    {rows.length === 0 ? (
      <div className="no-print">
        <EmptyState icon={<IconApprovals size={22} />} title="Nothing here" subtitle="No shifts match these filters." />
      </div>
    ) : (
    <div className="space-y-3 no-print">
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
            onDetails={() => setDetail(s)}
            onDelete={() => del(s)}
            status={s.approvalStatus}
          />
        </div>
      ))}

      {editing && <EditShift shift={editing} onClose={() => setEditing(null)} />}
      {detail && (
        <ShiftDetailModal
          shift={detail}
          site={sites.find((s) => s.id === detail.siteId) ?? null}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}

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
    )}
    </>
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
  onDetails,
  onDelete,
  status,
}: {
  onAction: (action: string, note?: string) => Promise<unknown>;
  onEdit: () => void;
  onDetails?: () => void;
  onDelete?: () => void;
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
      {onDetails && (
        <button className="btn-outline px-3 py-2 text-xs" onClick={onDetails} disabled={!!busy}>
          <IconInfo size={15} /> Details
        </button>
      )}
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
      {onDelete && (
        <button className="btn-ghost px-3 py-2 text-xs text-[var(--color-danger)] ml-auto" onClick={onDelete} disabled={!!busy} title="Delete permanently">
          <IconTrash size={15} /> Delete
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

/* ------------------------------ PDF export ------------------------------- */
// Print-only layouts. The global `@media print` rules (globals.css) hide
// everything except `.print-area`, so `window.print()` → "Save as PDF" yields
// a clean document that follows the on-screen site/period/worker/status filters.

const pCell: CSSProperties = { border: "1px solid #cbd5e1", padding: "6px 8px", textAlign: "left", fontSize: 12, verticalAlign: "top" };
const pHead: CSSProperties = { ...pCell, background: "#e5e7eb", fontWeight: 700 };

function PrintHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 12, margin: "4px 0 0", color: "#475569" }}>{subtitle}</p>
    </div>
  );
}

function PrintPhoto({ url, label }: { url: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} style={{ width: 200, height: 200, objectFit: "cover", border: "1px solid #cbd5e1", borderRadius: 8 }} />
      <div style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/** Timesheets PDF — table of the filtered timesheets (no photos). */
function TimesheetsPrint({ rows, subtitle }: { rows: Timesheet[]; subtitle: string }) {
  const total = rows.reduce((s, t) => s + (t.adminTotalMinutes ?? t.totalMinutes ?? 0), 0);
  return (
    <div className="print-area hidden print:block">
      <PrintHeader title="Yubi Demolition — Timesheets" subtitle={subtitle} />
      {rows.length === 0 ? (
        <p style={{ fontSize: 12 }}>No records for this filter.</p>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Worker", "Site", "Date", "In → Out", "Break", "Total"].map((h) => (
                  <th key={h} style={pHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} style={{ pageBreakInside: "avoid" }}>
                  <td style={pCell}>{t.workerName}</td>
                  <td style={pCell}>{t.siteLabel}</td>
                  <td style={pCell}>{auDateKey(t.adminStartAt ?? t.startAt)}</td>
                  <td style={pCell}>{formatAuTime(t.adminStartAt ?? t.startAt)} → {formatAuTime(t.adminEndAt ?? t.endAt)}</td>
                  <td style={pCell}>{(t.adminBreakMinutes ?? t.breakMinutes)}m</td>
                  <td style={pCell}>{minutesToHhMm(t.adminTotalMinutes ?? t.totalMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: "right", fontWeight: 700, marginTop: 10 }}>
            Grand total: {minutesToHhMm(total)}
          </div>
        </>
      )}
    </div>
  );
}

/** Clock-in shifts PDF — one block per shift, including the in/out photos. */
function ShiftsPrint({ rows, subtitle }: { rows: Shift[]; subtitle: string }) {
  const total = rows.reduce((s, sh) => s + shiftWorkedMinutes(sh), 0);
  return (
    <div className="print-area hidden print:block">
      <PrintHeader title="Yubi Demolition — Clock-in shifts" subtitle={subtitle} />
      {rows.length === 0 ? (
        <p style={{ fontSize: 12 }}>No records for this filter.</p>
      ) : (
        <>
          {rows.map((s) => (
            <div key={s.id} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12, pageBreakInside: "avoid" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.workerName}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>{s.siteName}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {auDateKey(s.startedAt)} · {formatAuTime(s.startedAt)}{s.endedAt ? ` → ${formatAuTime(s.endedAt)}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{minutesToHhMm(shiftWorkedMinutes(s))}</div>
                  {(s.breakMinutes ?? 0) > 0 && <div style={{ fontSize: 12, color: "#475569" }}>{s.breakMinutes}m break</div>}
                </div>
              </div>
              {(s.startPhotoUrl || s.endPhotoUrl) && (
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  {s.startPhotoUrl && <PrintPhoto url={s.startPhotoUrl} label="Clock-in" />}
                  {s.endPhotoUrl && <PrintPhoto url={s.endPhotoUrl} label="Clock-out" />}
                </div>
              )}
            </div>
          ))}
          <div style={{ textAlign: "right", fontWeight: 700, marginTop: 10 }}>
            Grand total: {minutesToHhMm(total)}
          </div>
        </>
      )}
    </div>
  );
}
