"use client";

import { useMemo, useState } from "react";
import { useLiveCollection } from "@/lib/live";
import type { Shift, Site, Timesheet, Worker } from "@/lib/types";
import { formatAuTime, minutesToHhMm } from "@/lib/time";
import {
  buildSiteEntries,
  groupByLocation,
  timesheetWorkedMinutes,
  auDateKey,
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
  IconCheck,
  IconTrash,
  IconPause,
  IconChevronDown,
} from "@/components/icons";
import { EditShift, EditTimesheet } from "@/app/admin/approvals/page";
import PlaceSearch from "@/components/place-search";

const ALL = "all";
type Tab = "timesheets" | "shifts";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("timesheets");
  return (
    <PasswordProvider>
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-[var(--color-muted)] text-sm mb-5">
          Review and export hours — timesheets and clock-in shifts are kept separate.
        </p>

        <div className="flex gap-2 mb-5 no-print">
          <TabBtn active={tab === "timesheets"} onClick={() => setTab("timesheets")}>Timesheets</TabBtn>
          <TabBtn active={tab === "shifts"} onClick={() => setTab("shifts")}>Clock-in shift</TabBtn>
        </div>

        {tab === "timesheets" ? <TimesheetsReport /> : <ShiftsReport />}
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function csvDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${String(y).slice(2)}`;
}
function csvClock(ms?: number): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(ms))
    .toUpperCase()
    .replace(/\s/g, " ");
}
function csvHrs(min: number): string {
  return String(Math.round((min / 60) * 100) / 100);
}
const STATUS_TEXT: Record<string, string> = {
  approved: "Approved",
  declined: "Not Approved",
  pending: "Pending",
  on_hold: "On hold",
  edited: "Edited",
  active: "Active",
};

/**
 * Grouped-by-site worklog CSV, matching the client's spreadsheet layout:
 *   Site: <name>
 *   S.N, Date, Time, Total Hours, Status
 *   1, 11-Aug-26, 6:00 AM – 5:30 PM, 11, Approved
 *   ...
 *   , , Total, <site total>,
 */
function downloadHoursCsv(
  groups: { label: string; entries: ExportEntry[]; totalMinutes: number }[],
  filename: string
) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(esc(`Site: ${g.label}`));
    lines.push(["S.N", "Date", "Time", "Total Hours", "Status"].map(esc).join(","));
    g.entries.forEach((e, i) => {
      const time = e.inMs || e.outMs ? `${csvClock(e.inMs)} – ${csvClock(e.outMs)}` : "";
      lines.push(
        [i + 1, csvDate(e.dateKey), time, csvHrs(e.totalMinutes), STATUS_TEXT[e.status ?? ""] ?? ""]
          .map(esc)
          .join(",")
      );
    });
    lines.push(["", "", "Total", csvHrs(g.totalMinutes), ""].map(esc).join(","));
    lines.push("");
  }
  const grand = groups.reduce((s, g) => s + g.totalMinutes, 0);
  lines.push(["", "", "GRAND TOTAL", csvHrs(grand), ""].map(esc).join(","));

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

/** Working-period + site + date filters, plus Export Excel / Download PDF. */
function ExportToolbar({
  period, setPeriod, loc, setLoc, from, setFrom, to, setTo, locations, onCsv, disabled,
}: {
  period: string; setPeriod: (v: string) => void;
  loc: string; setLoc: (v: string) => void;
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  locations: string[]; onCsv: () => void; disabled: boolean;
}) {
  const periods = useMemo(() => listFortnights(), []);
  return (
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
        <button className="btn-outline" onClick={onCsv} disabled={disabled}>Export Excel</button>
        <button className="btn-primary" onClick={() => window.print()} disabled={disabled}>Download PDF</button>
      </div>
    </div>
  );
}

function rangeLabel(from: string, to: string) {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "All dates";
}

/* ===================== TIMESHEETS (only timesheets) ===================== */

function TimesheetsReport() {
  const { data: timesheets, loading } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const toast = useToast();
  const confirm = useConfirm();
  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState(() => fortnightStartKey(new Date().toISOString().slice(0, 10)));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editTs, setEditTs] = useState<Timesheet | null>(null);
  const [adding, setAdding] = useState(false);

  // Only timesheets (no clock-in shifts) — completely separate export.
  const entries = useMemo(
    () => buildSiteEntries([], timesheets, workers).filter((e) => period === ALL || isWithinFortnight(e.dateKey, period)),
    [timesheets, workers, period]
  );
  const exportGroups = useMemo(() => groupByLocation(entries), [entries]);
  const exportTotal = exportGroups.reduce((s, g) => s + g.totalMinutes, 0);

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
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
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
        <div className="flex gap-2 ml-auto self-end pb-1">
          <button className="btn-primary" onClick={() => setAdding(true)}>+ Add timesheet</button>
          <button className="btn-outline" disabled={exportGroups.length === 0}
            onClick={() => downloadHoursCsv(exportGroups, `yubi-timesheets-${new Date().toISOString().slice(0, 10)}.csv`)}>
            Export Excel
          </button>
          <button className="btn-outline" disabled={exportGroups.length === 0} onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      </div>

      {adding && <AddTimesheetModal onClose={() => setAdding(false)} />}

      {/* Print-only timesheet hours report */}
      <div className="print-area hidden print:block">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Yubi Demolition — Timesheet hours by site</h2>
          <p className="text-sm">{period === ALL ? "All periods" : `Fortnight: ${fortnightLabel(period)}`}</p>
        </div>
        <GroupedHoursTables groups={exportGroups} />
        <div className="flex justify-end items-center gap-3 px-1 py-2 font-semibold">
          Grand total: <span className="text-brand-700">{minutesToHhMm(exportTotal)}</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<IconClipboard size={22} />} title="No timesheets in this period" subtitle="Choose another working period." />
      ) : (
        <div className="space-y-3 no-print">
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

/* ===================== CLOCK-IN SHIFT (only clock-ins) ===================== */

function ShiftsReport() {
  const { data: shifts } = useLiveCollection<Shift>("shifts", []);
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const toast = useToast();
  const requirePassword = useRequirePassword();
  const [editShift, setEditShift] = useState<Shift | null>(null);

  // Only completed clock-in shifts (no timesheets).
  const allEntries = useMemo(() => buildSiteEntries(shifts, [], workers), [shifts, workers]);
  const locations = useMemo(() => Array.from(new Set(allEntries.map((e) => e.location))).sort(), [allEntries]);

  const [loc, setLoc] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
      <ExportToolbar
        period={period} setPeriod={setPeriod}
        loc={loc} setLoc={setLoc}
        from={from} setFrom={setFrom} to={to} setTo={setTo}
        locations={locations}
        disabled={groups.length === 0}
        onCsv={() => downloadHoursCsv(groups, `yubi-clockin-shifts-${new Date().toISOString().slice(0, 10)}.csv`)}
      />

      <p className="text-xs text-[var(--color-muted)] mb-3 no-print">
        Clock-in shifts only. Edit or delete a finalised clock-in to tidy the export — each asks for the password.
      </p>

      <div className="print-area">
        <div className="hidden print:block mb-4">
          <h2 className="text-xl font-bold">Yubi Demolition — Clock-in shift hours by site</h2>
          <p className="text-sm">{period === ALL ? rangeLabel(from, to) : `Fortnight: ${fortnightLabel(period)}`}</p>
        </div>

        {groups.length === 0 ? (
          <EmptyState icon={<IconClipboard size={22} />} title="No clock-in shifts for this filter" />
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

/* ===================== admin: add casual timesheet ===================== */

function AddTimesheetModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { data: sites } = useLiveCollection<Site>("sites", []);
  const [name, setName] = useState("");
  const [loc, setLoc] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("15:30");
  const [brk, setBrk] = useState("30");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function epoch(dateStr: string, hhmm: string, plusDay = 0): number {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    return new Date(y, m - 1, d + plusDay, h, mi, 0, 0).getTime();
  }

  async function save() {
    setErr("");
    if (!loc.trim()) return setErr("Enter a location.");
    if (!date || !start || !end) return setErr("Date, start and end are required.");
    const startAt = epoch(date, start);
    let endAt = epoch(date, end);
    if (endAt <= startAt) endAt = epoch(date, end, 1); // overnight
    setSaving(true);
    const res = await fetch("/api/admin/timesheets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workerName: name,
        siteLabel: loc,
        placeAddress: loc,
        location: lat != null && lng != null ? { lat, lng } : null,
        startAt,
        endAt,
        breakMinutes: Number(brk) || 0,
        breakPaid: false,
        periodStart: fortnightStartKey(auDateKey(startAt)),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Timesheet added", name.trim() || "Casual");
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Could not add timesheet");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add timesheet (casual)"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : "Add timesheet"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Name (optional)</label>
          <input className="input" placeholder="Leave blank for “Casual”" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Location / site</label>
          {sites.length > 0 && (
            <select
              className="input mb-2"
              value=""
              onChange={(e) => {
                const site = sites.find((x) => x.id === e.target.value);
                if (site) { setLoc(site.name); setLat(site.location?.lat ?? null); setLng(site.location?.lng ?? null); }
              }}
            >
              <option value="">Pick a saved site…</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          )}
          <PlaceSearch
            defaultValue={loc}
            placeholder={sites.length ? "…or type an address" : "Search a place or address…"}
            onChange={(p) => {
              setLoc(p.address);
              if ("lat" in p) { setLat(p.lat); setLng(p.lng); } else { setLat(null); setLng(null); }
            }}
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">Start</label>
            <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <label className="label">Break (min)</label>
            <input type="number" min={0} step={5} className="input" value={brk} onChange={(e) => setBrk(e.target.value)} />
          </div>
        </div>
        {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
      </div>
    </Modal>
  );
}
