"use client";

import { useMemo, useState } from "react";
import { useLiveCollection } from "@/lib/live";
import type { Shift, Timesheet, Worker } from "@/lib/types";
import { formatAuTime, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import {
  buildReconciliation,
  buildSiteEntries,
  groupByLocation,
  timesheetWorkedMinutes,
  auDateKey,
  type ReconRow,
  type ExportEntry,
} from "@/lib/reconcile";
import {
  listFortnights,
  fortnightStartKey,
  isWithinFortnight,
  fortnightLabel,
} from "@/lib/fortnight";
import { Spinner, EmptyState, StatusPill } from "@/components/ui";
import Modal from "@/components/modal";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { PasswordProvider, useRequirePassword } from "@/components/password-gate";
import {
  IconClipboard,
  IconPencil,
  IconX,
  IconCheck,
  IconWarning,
  IconTrash,
  IconLink,
  IconPause,
  IconChevronDown,
} from "@/components/icons";
import { EditShift, EditTimesheet } from "@/app/admin/approvals/page";

const ALL = "all";
type Tab = "reconcile" | "timesheets" | "export";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("reconcile");
  return (
    <PasswordProvider>
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-[var(--color-muted)] text-sm mb-5">
          Review timesheets by worker, reconcile clock-ins, and export hours by site.
        </p>

        <div className="flex gap-2 mb-5 no-print">
          <TabBtn active={tab === "reconcile"} onClick={() => setTab("reconcile")}>Reconcile</TabBtn>
          <TabBtn active={tab === "timesheets"} onClick={() => setTab("timesheets")}>Timesheets</TabBtn>
          <TabBtn active={tab === "export"} onClick={() => setTab("export")}>Clock-in shift</TabBtn>
        </div>

        {tab === "reconcile" && <Reconcile />}
        {tab === "timesheets" && <TimesheetsByWorker />}
        {tab === "export" && <SiteExport />}
      </div>
    </PasswordProvider>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

/* ===================== shared: grouped hours export ===================== */

/** Build a grouped CSV (Excel-openable) with a Job title column and download it. */
function downloadHoursCsv(
  groups: { label: string; entries: ExportEntry[]; totalMinutes: number }[],
  filename: string
) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const hrs = (m: number) => (m / 60).toFixed(2);
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(esc(`Site: ${g.label}`));
    lines.push(["Job title", "Worker", "Date", "Time In", "Time Out", "Break (min)", "Total Hours"].map(esc).join(","));
    for (const e of g.entries) {
      lines.push(
        [
          e.jobTitle || "",
          e.workerName,
          e.dateKey,
          e.inMs ? formatAuTime(e.inMs) : "",
          e.outMs ? formatAuTime(e.outMs) : "",
          e.breakMinutes,
          hrs(e.totalMinutes),
        ].map(esc).join(",")
      );
    }
    lines.push(["", "", "", "", "", "Site total", hrs(g.totalMinutes)].map(esc).join(","));
    lines.push("");
  }
  const grand = groups.reduce((s, g) => s + g.totalMinutes, 0);
  lines.push(["", "", "", "", "", "GRAND TOTAL", hrs(grand)].map(esc).join(","));

  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Site-grouped hours tables (used on-screen and inside print areas). */
function GroupedHoursTables({
  groups,
  onEdit,
  onDelete,
}: {
  groups: { label: string; entries: ExportEntry[]; totalMinutes: number }[];
  onEdit?: (e: ExportEntry) => void;
  onDelete?: (e: ExportEntry) => void;
}) {
  const actions = !!(onEdit || onDelete);
  return (
    <>
      {groups.map((g) => (
        <div key={g.label} className="card mb-4 overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-line)]">
            <h3 className="font-semibold">{g.label}</h3>
            <span className="chip pill-approved">{minutesToHhMm(g.totalMinutes)}</span>
          </div>
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-line)]">
                <th className="p-3 font-medium">Job title</th>
                <th className="p-3 font-medium print:hidden">Worker</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Time in</th>
                <th className="p-3 font-medium">Time out</th>
                <th className="p-3 font-medium">Break</th>
                <th className="p-3 font-medium">Total</th>
                {actions && <th className="p-3 font-medium text-right no-print">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {g.entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-3">{e.jobTitle || <span className="text-[var(--color-muted)]">—</span>}</td>
                  <td className="p-3 print:hidden">{e.workerName}</td>
                  <td className="p-3 whitespace-nowrap">{e.dateKey}</td>
                  <td className="p-3 whitespace-nowrap">{e.inMs ? formatAuTime(e.inMs) : "—"}</td>
                  <td className="p-3 whitespace-nowrap">{e.outMs ? formatAuTime(e.outMs) : "—"}</td>
                  <td className="p-3">{e.breakMinutes}m</td>
                  <td className="p-3 font-medium">{minutesToHhMm(e.totalMinutes)}</td>
                  {actions && (
                    <td className="p-3 no-print">
                      <div className="flex items-center gap-1 justify-end">
                        {e.source === "Clock-in" ? (
                          <>
                            {onEdit && (
                              <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => onEdit(e)} title="Edit (password)">
                                <IconPencil size={13} />
                              </button>
                            )}
                            {onDelete && (
                              <button className="btn-ghost px-2 py-1.5 text-xs text-[var(--color-danger)]" onClick={() => onDelete(e)} title="Delete (password)">
                                <IconTrash size={13} />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-[var(--color-muted)]">Timesheet</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

/* ============================== RECONCILE =============================== */

const STATE_LABEL: Record<ReconRow["state"], { text: string; cls: string }> = {
  matched: { text: "Matched", cls: "pill-approved" },
  "location-mismatch": { text: "Date only", cls: "pill-pending" },
  "shift-only": { text: "No timesheet", cls: "pill-on_hold" },
  "timesheet-only": { text: "No clock-in", cls: "pill-edited" },
};

function Reconcile() {
  const { data: shifts, loading: l1 } = useLiveCollection<Shift>("shifts", []);
  const { data: timesheets, loading: l2 } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const toast = useToast();
  const confirm = useConfirm();
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editTs, setEditTs] = useState<Timesheet | null>(null);
  const [dragTsId, setDragTsId] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<ReconRow | null>(null);
  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState(() => fortnightStartKey(new Date().toISOString().slice(0, 10)));

  const allRows = useMemo(() => buildReconciliation(shifts, timesheets), [shifts, timesheets]);
  const rows = useMemo(
    () => (period === ALL ? allRows : allRows.filter((r) => isWithinFortnight(r.dateKey, period))),
    [allRows, period]
  );

  // Site-grouped hours for the same period, for export (job title + site totals).
  const exportGroups = useMemo(() => {
    const entries = buildSiteEntries(shifts, timesheets, workers).filter(
      (e) => period === ALL || isWithinFortnight(e.dateKey, period)
    );
    return groupByLocation(entries);
  }, [shifts, timesheets, workers, period]);
  const exportTotal = exportGroups.reduce((s, g) => s + g.totalMinutes, 0);

  async function link(shiftId: string, timesheetId: string | null) {
    const res = await fetch("/api/admin/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shiftId, timesheetId }),
    });
    if (res.ok) toast.success(timesheetId ? "Linked — combined into one row" : "Unlinked into two rows");
    else toast.error("Could not update link");
  }

  async function approveRow(r: ReconRow) {
    const calls: Promise<Response>[] = [];
    if (r.shift)
      calls.push(fetch(`/api/admin/approvals/shift/${r.shift.id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }),
      }));
    if (r.timesheet)
      calls.push(fetch(`/api/admin/approvals/timesheet/${r.timesheet.id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }),
      }));
    const res = await Promise.all(calls);
    if (res.every((x) => x.ok)) toast.success("Approved");
    else toast.error("Some items could not be approved");
  }

  async function del(kind: "shift" | "timesheet", id: string, label: string) {
    const ok = await confirm({ title: `Delete this ${kind}?`, message: `${label} will be permanently removed. This cannot be undone.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/approvals/${kind}/${id}`, { method: "DELETE" });
    if (res.ok) toast.success(`${kind === "shift" ? "Shift" : "Timesheet"} deleted`);
    else toast.error("Could not delete");
  }

  if ((l1 || l2) && allRows.length === 0)
    return <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
        <select className="input max-w-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value={ALL}>All periods</option>
          {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
        </select>
        <span className="text-xs text-[var(--color-muted)]">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
        <div className="flex gap-2 ml-auto">
          <button className="btn-outline" disabled={exportGroups.length === 0}
            onClick={() => downloadHoursCsv(exportGroups, `yubi-reconcile-${new Date().toISOString().slice(0, 10)}.csv`)}>
            Export Excel
          </button>
          <button className="btn-primary" disabled={exportGroups.length === 0} onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-brand-50 text-brand-700 text-xs px-3 py-2 mb-3 no-print">
        Pair an unmatched clock-in with its timesheet: click <b>Link</b> and pick the match, or drag one “No clock-in” row onto a “No timesheet” row. Paired rows merge into one. Export shows hours grouped by site with each worker’s job title and a per-site total.
      </div>

      {/* Print-only hours report (Download PDF prints this) */}
      <div className="print-area hidden print:block">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Yubi Demolition — Hours by site</h2>
          <p className="text-sm">{period === ALL ? "All periods" : `Fortnight: ${fortnightLabel(period)}`}</p>
        </div>
        <GroupedHoursTables groups={exportGroups} />
        <div className="flex justify-end items-center gap-3 px-1 py-2 font-semibold">
          Grand total: <span className="text-brand-700">{minutesToHhMm(exportTotal)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<IconClipboard size={22} />} title="Nothing in this period" />
      ) : (
        <div className="card overflow-x-auto no-print">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-line)]">
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Worker</th>
                <th className="p-3 font-medium">Location</th>
                <th className="p-3 font-medium">Clock-in</th>
                <th className="p-3 font-medium">Timesheet</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = STATE_LABEL[r.state];
                const isDropTarget = r.state === "shift-only";
                const isDraggable = r.state === "timesheet-only";
                return (
                  <tr
                    key={r.key}
                    draggable={isDraggable}
                    onDragStart={() => isDraggable && setDragTsId(r.timesheet!.id)}
                    onDragOver={(e) => isDropTarget && dragTsId && e.preventDefault()}
                    onDrop={() => { if (isDropTarget && dragTsId && r.shift) { link(r.shift.id, dragTsId); setDragTsId(null); } }}
                    className={`border-b border-[var(--color-line)] last:border-0 ${isDraggable ? "cursor-grab" : ""} ${isDropTarget && dragTsId ? "bg-brand-50 outline-dashed outline-2 outline-brand-400" : ""}`}
                  >
                    <td className="p-3 whitespace-nowrap">{r.dateKey}</td>
                    <td className="p-3">{r.workerName}</td>
                    <td className="p-3 max-w-[180px] truncate">{r.shift?.siteName || r.timesheet?.siteLabel || "—"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.shift ? (
                        <>
                          <div className="font-medium">{minutesToHhMm(shiftWorkedMinutes(r.shift))}</div>
                          <div className="text-xs text-[var(--color-muted)]">{formatAuTime(r.shift.startedAt)}–{r.shift.endedAt ? formatAuTime(r.shift.endedAt) : "…"}</div>
                        </>
                      ) : (<span className="text-[var(--color-muted)]">—</span>)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.timesheet ? (
                        <>
                          <div className="font-medium">{minutesToHhMm(timesheetWorkedMinutes(r.timesheet))}</div>
                          <div className="text-xs text-[var(--color-muted)]">{formatAuTime(r.timesheet.startAt)}–{formatAuTime(r.timesheet.endAt)}</div>
                        </>
                      ) : (<span className="text-[var(--color-muted)]">—</span>)}
                    </td>
                    <td className="p-3">
                      <span className={`chip ${badge.cls}`}>
                        {r.state === "matched" ? <IconCheck size={12} /> : r.state === "location-mismatch" ? <IconWarning size={12} /> : null}
                        {badge.text}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        <button className="btn-success px-2 py-1.5 text-xs" onClick={() => approveRow(r)} title="Approve"><IconCheck size={13} /></button>
                        {(r.state === "shift-only" || r.state === "timesheet-only") && (
                          <button className="btn-outline px-2 py-1.5 text-xs" onClick={() => setLinkFor(r)} title="Link to its counterpart"><IconLink size={13} /> Link</button>
                        )}
                        {r.shift && (<button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => setEditShift(r.shift!)} title="Edit shift"><IconPencil size={13} /> Shift</button>)}
                        {r.timesheet && (<button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => setEditTs(r.timesheet!)} title="Edit timesheet"><IconPencil size={13} /> TS</button>)}
                        {r.shift && r.timesheet && r.shift.linkedTimesheetId && (<button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => link(r.shift!.id, null)} title="Unlink"><IconX size={13} /></button>)}
                        {r.shift && (<button className="btn-ghost px-2 py-1.5 text-xs text-[var(--color-danger)]" onClick={() => del("shift", r.shift!.id, `Shift · ${r.shift!.siteName}`)} title="Delete shift"><IconTrash size={13} /></button>)}
                        {r.timesheet && (<button className="btn-ghost px-2 py-1.5 text-xs text-[var(--color-danger)]" onClick={() => del("timesheet", r.timesheet!.id, `Timesheet · ${r.timesheet!.siteLabel}`)} title="Delete timesheet"><IconTrash size={13} /></button>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editShift && <EditShift shift={editShift} onClose={() => setEditShift(null)} />}
      {editTs && <EditTimesheet ts={editTs} onClose={() => setEditTs(null)} />}

      {linkFor && (
        <Modal open onClose={() => setLinkFor(null)} title={linkFor.state === "shift-only" ? "Link a timesheet to this shift" : "Link a clock-in to this timesheet"}>
          <div className="mb-3 text-sm text-[var(--color-muted)]">
            {linkFor.workerName} · {linkFor.dateKey} · {linkFor.shift?.siteName || linkFor.timesheet?.siteLabel}
          </div>
          {(() => {
            const wantTimesheet = linkFor.state === "shift-only";
            const candidates = allRows.filter((c) => (wantTimesheet ? c.state === "timesheet-only" : c.state === "shift-only"));
            candidates.sort((a, b) => {
              const aw = a.workerUid === linkFor.workerUid ? 0 : 1;
              const bw = b.workerUid === linkFor.workerUid ? 0 : 1;
              return aw - bw || b.dateKey.localeCompare(a.dateKey);
            });
            if (candidates.length === 0)
              return <p className="text-sm text-[var(--color-muted)] py-6 text-center">Nothing available to link.</p>;
            return (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {candidates.map((c) => {
                  const mins = wantTimesheet ? timesheetWorkedMinutes(c.timesheet!) : shiftWorkedMinutes(c.shift!);
                  const site = wantTimesheet ? c.timesheet!.siteLabel : c.shift!.siteName;
                  const sameWorker = c.workerUid === linkFor.workerUid;
                  return (
                    <button key={c.key}
                      onClick={() => {
                        const shiftId = wantTimesheet ? linkFor.shift!.id : c.shift!.id;
                        const tsId = wantTimesheet ? c.timesheet!.id : linkFor.timesheet!.id;
                        link(shiftId, tsId);
                        setLinkFor(null);
                      }}
                      className="w-full text-left rounded-xl border border-[var(--color-line)] hover:bg-[var(--color-canvas)] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{c.workerName}</span>
                        {sameWorker && <span className="chip pill-approved">same worker</span>}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">{c.dateKey} · {site} · {minutesToHhMm(mins)}</div>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

/* ===================== TIMESHEETS BY WORKER ===================== */

function TimesheetsByWorker() {
  const { data: timesheets, loading } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const toast = useToast();
  const confirm = useConfirm();
  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState(() => fortnightStartKey(new Date().toISOString().slice(0, 10)));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editTs, setEditTs] = useState<Timesheet | null>(null);

  const groups = useMemo(() => {
    const titleByUid = new Map(workers.filter((w) => w.uid).map((w) => [w.uid!, w.jobTitle || ""]));
    const inPeriod = timesheets.filter((t) => period === ALL || isWithinFortnight(auDateKey(t.startAt), period));
    const m = new Map<string, { key: string; name: string; jobTitle: string; items: Timesheet[] }>();
    for (const t of inPeriod) {
      const key = t.workerUid || t.workerName;
      if (!m.has(key)) m.set(key, { key, name: t.workerName, jobTitle: (t.workerUid && titleByUid.get(t.workerUid)) || "", items: [] });
      m.get(key)!.items.push(t);
    }
    return [...m.values()]
      .map((g) => ({
        ...g,
        items: g.items.sort((a, b) => b.startAt - a.startAt),
        total: g.items.reduce((s, t) => s + timesheetWorkedMinutes(t), 0),
        pending: g.items.filter((t) => t.status === "pending").length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timesheets, workers, period]);

  async function act(id: string, action: "approve" | "on_hold") {
    const r = await fetch(`/api/admin/approvals/timesheet/${id}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    if (r.ok) toast.success(action === "approve" ? "Approved" : "Put on hold");
    else toast.error("Action failed");
  }
  async function del(t: Timesheet) {
    const ok = await confirm({ title: "Delete timesheet?", message: `${t.workerName} · ${t.siteLabel} will be permanently removed.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const r = await fetch(`/api/admin/approvals/timesheet/${t.id}`, { method: "DELETE" });
    if (r.ok) toast.success("Timesheet deleted");
    else toast.error("Could not delete");
  }

  if (loading && timesheets.length === 0)
    return <div className="py-12 text-center text-[var(--color-muted)]"><Spinner /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <label className="label">Working period</label>
          <select className="input max-w-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value={ALL}>All periods</option>
            {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
          </select>
        </div>
        <span className="text-xs text-[var(--color-muted)] self-end pb-3">
          {groups.length} worker{groups.length === 1 ? "" : "s"}
        </span>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<IconClipboard size={22} />} title="No timesheets in this period" subtitle="Choose another working period." />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const open = openKey === g.key;
            return (
              <div key={g.key} className="card overflow-hidden">
                <button
                  onClick={() => setOpenKey(open ? null : g.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--color-canvas)]"
                >
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-sm shrink-0">
                    {g.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{g.name}</div>
                    <div className="text-xs text-[var(--color-muted)] truncate">
                      {g.jobTitle ? `${g.jobTitle} · ` : ""}{g.items.length} timesheet{g.items.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {g.pending > 0 && <span className="chip pill-pending">{g.pending} pending</span>}
                  <span className="font-semibold text-brand-700">{minutesToHhMm(g.total)}</span>
                  <span className={`transition ${open ? "rotate-180" : ""}`}><IconChevronDown size={18} /></span>
                </button>

                {open && (
                  <div className="border-t border-[var(--color-line)] overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-line)]">
                          <th className="p-3 font-medium">Date</th>
                          <th className="p-3 font-medium">Site</th>
                          <th className="p-3 font-medium">In → Out</th>
                          <th className="p-3 font-medium">Break</th>
                          <th className="p-3 font-medium">Total</th>
                          <th className="p-3 font-medium">Status</th>
                          <th className="p-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((t) => (
                          <tr key={t.id} className="border-b border-[var(--color-line)] last:border-0">
                            <td className="p-3 whitespace-nowrap">{auDateKey(t.startAt)}</td>
                            <td className="p-3 max-w-[160px] truncate">{t.siteLabel}</td>
                            <td className="p-3 whitespace-nowrap text-xs">{formatAuTime(t.startAt)} → {formatAuTime(t.endAt)}</td>
                            <td className="p-3">{(t.adminBreakMinutes ?? t.breakMinutes)}m</td>
                            <td className="p-3 font-medium">{minutesToHhMm(timesheetWorkedMinutes(t))}</td>
                            <td className="p-3"><StatusPill status={t.status} /></td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 justify-end flex-wrap">
                                {t.status !== "approved" && (
                                  <button className="btn-success px-2 py-1.5 text-xs" onClick={() => act(t.id, "approve")} title="Approve"><IconCheck size={13} /></button>
                                )}
                                <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => setEditTs(t)} title="Edit"><IconPencil size={13} /></button>
                                {t.status !== "on_hold" && (
                                  <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => act(t.id, "on_hold")} title="Hold"><IconPause size={13} /></button>
                                )}
                                <button className="btn-ghost px-2 py-1.5 text-xs text-[var(--color-danger)]" onClick={() => del(t)} title="Delete"><IconTrash size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editTs && <EditTimesheet ts={editTs} onClose={() => setEditTs(null)} />}
    </div>
  );
}

/* =============================== CLOCK-IN SHIFT (SITE EXPORT) ============================= */

function SiteExport() {
  const { data: shifts } = useLiveCollection<Shift>("shifts", []);
  const { data: timesheets } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const toast = useToast();
  const requirePassword = useRequirePassword();
  const [editShift, setEditShift] = useState<Shift | null>(null);

  const allEntries = useMemo(() => buildSiteEntries(shifts, timesheets, workers), [shifts, timesheets, workers]);
  const locations = useMemo(() => Array.from(new Set(allEntries.map((e) => e.location))).sort(), [allEntries]);

  const [loc, setLoc] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState(ALL);

  const filtered = useMemo(
    () => allEntries.filter((e) =>
      (loc === "all" || e.location === loc) &&
      (period === ALL || isWithinFortnight(e.dateKey, period)) &&
      (!from || e.dateKey >= from) &&
      (!to || e.dateKey <= to)
    ),
    [allEntries, loc, from, to, period]
  );
  const groups = useMemo(() => groupByLocation(filtered), [filtered]);
  const grandTotal = groups.reduce((s, g) => s + g.totalMinutes, 0);

  async function editEntry(e: ExportEntry) {
    const ok = await requirePassword({
      title: "Edit finalised shift",
      message: "Editing a finalised clock-in record is sensitive. Enter the password to continue.",
    });
    if (!ok) return;
    const shift = shifts.find((s) => s.id === e.id);
    if (shift) setEditShift(shift);
    else toast.error("Shift not found");
  }
  async function deleteEntry(e: ExportEntry) {
    const ok = await requirePassword({
      title: "Delete finalised shift",
      message: "Deleting a finalised clock-in record is sensitive. Enter the password to continue.",
    });
    if (!ok) return;
    const r = await fetch(`/api/admin/approvals/shift/${e.id}`, { method: "DELETE" });
    if (r.ok) toast.success("Shift deleted");
    else toast.error("Could not delete");
  }

  return (
    <div>
      <div className="card p-4 mb-4 no-print flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Working period</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value={ALL}>All periods</option>
            {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
          </select>
        </div>
        <div>
          <label className="label">Site</label>
          <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="all">All sites</option>
            {locations.map((l) => (<option key={l} value={l}>{l}</option>))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-2 ml-auto">
          <button className="btn-outline" onClick={() => downloadHoursCsv(groups, `yubi-hours-${new Date().toISOString().slice(0, 10)}.csv`)} disabled={groups.length === 0}>
            Export Excel
          </button>
          <button className="btn-primary" onClick={() => window.print()} disabled={groups.length === 0}>
            Download PDF
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--color-muted)] mb-3 no-print">
        Edit or delete a finalised clock-in here to tidy the export — each asks for the password.
      </p>

      <div className="print-area">
        <div className="hidden print:block mb-4">
          <h2 className="text-xl font-bold">Yubi Demolition — Hours by site</h2>
          <p className="text-sm">{period === ALL ? rangeLabel(from, to) : `Fortnight: ${fortnightLabel(period)}`}</p>
        </div>

        {groups.length === 0 ? (
          <EmptyState icon={<IconClipboard size={22} />} title="No records for this filter" />
        ) : (
          <GroupedHoursTables groups={groups} onEdit={editEntry} onDelete={deleteEntry} />
        )}

        {groups.length > 0 && (
          <div className="flex justify-end items-center gap-3 px-1 py-2 font-semibold">
            Grand total: <span className="text-brand-700">{minutesToHhMm(grandTotal)}</span>
          </div>
        )}
      </div>

      {editShift && <EditShift shift={editShift} onClose={() => setEditShift(null)} />}
    </div>
  );
}

function rangeLabel(from: string, to: string) {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "All dates";
}
