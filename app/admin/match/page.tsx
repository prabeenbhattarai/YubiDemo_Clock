"use client";

import { useMemo, useState } from "react";
import { useLiveCollection } from "@/lib/live";
import type { Shift, Site, Timesheet } from "@/lib/types";
import { formatAuTime, formatAuDateTime, minutesToHhMm, shiftWorkedMinutes } from "@/lib/time";
import {
  buildReconciliation,
  timesheetWorkedMinutes,
  type ReconRow,
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
import {
  IconClipboard,
  IconCheck,
  IconWarning,
  IconLink,
  IconPencil,
  IconTrash,
  IconX,
  IconMapPin,
} from "@/components/icons";
import { EditShift, EditTimesheet } from "@/app/admin/approvals/page";
import { SITE_ALL, belongsToSite } from "@/lib/site-filter";

const ALL = "all";

/** A reconciliation row belongs to a site if its shift or timesheet does. */
function rowMatchesSite(r: ReconRow, siteId: string, sites: Site[]): boolean {
  if (siteId === SITE_ALL) return true;
  if (r.shift && belongsToSite(r.shift, siteId, sites)) return true;
  if (r.timesheet && belongsToSite(r.timesheet, siteId, sites)) return true;
  return false;
}

const STATE_LABEL: Record<ReconRow["state"], { text: string; cls: string }> = {
  matched: { text: "Matched", cls: "pill-approved" },
  "location-mismatch": { text: "Date only", cls: "pill-pending" },
  "shift-only": { text: "No timesheet", cls: "pill-on_hold" },
  "timesheet-only": { text: "No clock-in", cls: "pill-edited" },
};

function tsBreak(t: Timesheet) {
  return t.adminBreakMinutes ?? t.breakMinutes ?? 0;
}
function shiftBreak(s: Shift) {
  return s.breakMinutes ?? 0;
}

const DIFF_THRESHOLD = 15; // minutes; beyond this the row is flagged

/** Timesheet total − clock-in total, in minutes; null when a side is missing. */
function rowDiff(r: ReconRow): number | null {
  if (!r.timesheet || !r.shift) return null;
  return timesheetWorkedMinutes(r.timesheet) - shiftWorkedMinutes(r.shift);
}
function fmtDiff(m: number): string {
  if (m === 0) return "0m";
  return `${m > 0 ? "+" : "−"}${minutesToHhMm(Math.abs(m))}`;
}

export default function MatchPage() {
  const { data: shifts, loading: l1 } = useLiveCollection<Shift>("shifts", []);
  const { data: timesheets, loading: l2 } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: sites } = useLiveCollection<Site>("sites", []);
  const toast = useToast();
  const confirm = useConfirm();

  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState(() => fortnightStartKey(new Date().toISOString().slice(0, 10)));
  const [siteId, setSiteId] = useState<string | null>(null); // null → choose first
  const [worker, setWorker] = useState("all");
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [detail, setDetail] = useState<ReconRow | null>(null);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editTs, setEditTs] = useState<Timesheet | null>(null);
  const [linkFor, setLinkFor] = useState<ReconRow | null>(null);

  const activeSites = useMemo(() => sites.filter((s) => s.active !== false), [sites]);
  const allRows = useMemo(() => buildReconciliation(shifts, timesheets, sites), [shifts, timesheets, sites]);

  // Scoped by site + period; worker/unmatched filters apply on top.
  const scoped = useMemo(
    () =>
      allRows
        .filter((r) => period === ALL || isWithinFortnight(r.dateKey, period))
        .filter((r) => siteId == null || rowMatchesSite(r, siteId, sites)),
    [allRows, period, siteId, sites]
  );
  const workerNames = useMemo(
    () => Array.from(new Set(scoped.map((r) => r.workerName))).sort((a, b) => a.localeCompare(b)),
    [scoped]
  );
  const rows = useMemo(
    () =>
      scoped
        .filter((r) => worker === "all" || r.workerName === worker)
        .filter((r) => !unmatchedOnly || r.state !== "matched"),
    [scoped, worker, unmatchedOnly]
  );

  const stats = useMemo(() => {
    const c = { matched: 0, "location-mismatch": 0, "shift-only": 0, "timesheet-only": 0 } as Record<ReconRow["state"], number>;
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);

  async function link(shiftId: string, timesheetId: string | null) {
    const res = await fetch("/api/admin/reconcile", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ shiftId, timesheetId }),
    });
    if (res.ok) toast.success(timesheetId ? "Matched" : "Unmatched");
    else toast.error("Could not update match");
  }

  async function del(kind: "shift" | "timesheet", id: string, label: string) {
    const ok = await confirm({ title: `Delete this ${kind}?`, message: `${label} will be permanently removed.`, confirmLabel: "Delete", danger: true });
    if (!ok) return false;
    const res = await fetch(`/api/admin/approvals/${kind}/${id}`, { method: "DELETE" });
    if (res.ok) toast.success(`${kind === "shift" ? "Shift" : "Timesheet"} deleted`);
    else toast.error("Could not delete");
    return res.ok;
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const hrs = (m: number) => (m / 60).toFixed(2);
    const head = ["Worker", "Date", "Status",
      "TS In", "TS Out", "TS Break (min)", "TS Hours",
      "Shift In", "Shift Out", "Shift Break (min)", "Shift Hours", "Diff (hrs)"];
    const lines = [head.map(esc).join(",")];
    for (const r of rows) {
      const t = r.timesheet, s = r.shift;
      const d = rowDiff(r);
      lines.push([
        r.workerName, r.dateKey, STATE_LABEL[r.state].text,
        t ? formatAuTime(t.startAt) : "", t ? formatAuTime(t.endAt) : "", t ? tsBreak(t) : "", t ? hrs(timesheetWorkedMinutes(t)) : "",
        s ? formatAuTime(s.startedAt) : "", s?.endedAt ? formatAuTime(s.endedAt) : "", s ? shiftBreak(s) : "", s ? hrs(shiftWorkedMinutes(s)) : "",
        d == null ? "" : (d / 60).toFixed(2),
      ].map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yubi-match-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if ((l1 || l2) && allRows.length === 0)
    return <div className="py-16 text-center text-[var(--color-muted)]"><Spinner /></div>;

  // ---- Step 1: choose a site/project before showing any details ----
  if (siteId === null) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Match timesheets &amp; clock-ins</h1>
        <p className="text-[var(--color-muted)] text-sm mb-5">Choose a site/project to compare its timesheets against clock-in shifts.</p>
        <div className="card p-4 max-w-lg">
          <h2 className="font-semibold mb-1">Which site / project?</h2>
          <p className="text-xs text-[var(--color-muted)] mb-3">Pick one site, or compare across all sites.</p>
          <div className="space-y-2">
            <button
              onClick={() => setSiteId(SITE_ALL)}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-3 text-left hover:bg-[var(--color-canvas)]"
            >
              <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center shrink-0"><IconLink size={18} /></span>
              <span className="min-w-0">
                <span className="block font-medium">All sites</span>
                <span className="block text-xs text-[var(--color-muted)]">Everything across every site/project</span>
              </span>
            </button>
            {activeSites.map((s) => (
              <button
                key={s.id}
                onClick={() => setSiteId(s.id)}
                className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-3 text-left hover:bg-[var(--color-canvas)]"
              >
                <span className="w-9 h-9 rounded-full bg-ocean-50 text-ocean-700 grid place-items-center shrink-0"><IconMapPin size={18} /></span>
                <span className="min-w-0">
                  <span className="block font-medium truncate">{s.name}</span>
                  {s.address && <span className="block text-xs text-[var(--color-muted)] truncate">{s.address}</span>}
                </span>
              </button>
            ))}
            {activeSites.length === 0 && (
              <p className="text-sm text-[var(--color-muted)]">No saved sites yet — use “All sites”.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const siteName = siteId === SITE_ALL ? "All sites" : sites.find((s) => s.id === siteId)?.name ?? "Site";

  return (
    <div>
      <div className="flex items-start justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold">Match timesheets &amp; clock-ins</h1>
          <p className="text-[var(--color-muted)] text-sm mb-4">
            <span className="font-medium text-[var(--color-ink)]">{siteName}</span> · timesheet on the left, its clock-in shift on the right — confirm, fix, or match.
          </p>
        </div>
        <button className="btn-outline shrink-0" onClick={() => setSiteId(null)}>Change site</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 no-print">
        <StatCard label="Matched" value={stats.matched} tone="approved" icon={<IconCheck size={16} />} />
        <StatCard label="Date only" value={stats["location-mismatch"]} tone="pending" icon={<IconWarning size={16} />} />
        <StatCard label="No timesheet" value={stats["shift-only"]} tone="hold" />
        <StatCard label="No clock-in" value={stats["timesheet-only"]} tone="edited" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
        <select className="input max-w-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value={ALL}>All periods</option>
          {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
        </select>
        <select className="input max-w-xs" value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="all">All workers</option>
          {workerNames.map((w) => (<option key={w} value={w}>{w}</option>))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" className="accent-brand-600 w-4 h-4" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} />
          Unmatched only
        </label>
        <span className="text-xs text-[var(--color-muted)]">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
        <div className="flex gap-2 ml-auto">
          <button className="btn-outline" onClick={exportCsv} disabled={rows.length === 0}>Export Excel</button>
          <button className="btn-primary" onClick={() => window.print()} disabled={rows.length === 0}>Download PDF</button>
        </div>
      </div>

      <div className="print-area">
        <div className="hidden print:block mb-3">
          <h2 className="text-xl font-bold">Yubi Demolition — Timesheet vs Clock-in</h2>
          <p className="text-sm">{siteName} · {period === ALL ? "All periods" : `Fortnight: ${fortnightLabel(period)}`}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<IconClipboard size={22} />} title="Nothing in this period" subtitle="Pick another working period." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="p-3 font-medium">Worker</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium border-l border-[var(--color-line)] bg-brand-50/40">Timesheet in</th>
                  <th className="p-3 font-medium bg-brand-50/40">Out</th>
                  <th className="p-3 font-medium bg-brand-50/40">Break</th>
                  <th className="p-3 font-medium bg-brand-50/40">Total</th>
                  <th className="p-3 font-medium border-l border-[var(--color-line)]">Clock-in in</th>
                  <th className="p-3 font-medium">Out</th>
                  <th className="p-3 font-medium">Break</th>
                  <th className="p-3 font-medium">Total</th>
                  <th className="p-3 font-medium">Diff</th>
                  <th className="p-3 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const t = r.timesheet, s = r.shift;
                  const badge = STATE_LABEL[r.state];
                  const diff = rowDiff(r);
                  const bigDiff = diff != null && Math.abs(diff) > DIFF_THRESHOLD;
                  return (
                    <tr
                      key={r.key}
                      onClick={() => setDetail(r)}
                      className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-canvas)] cursor-pointer"
                    >
                      <td className="p-3 font-medium">{r.workerName}</td>
                      <td className="p-3 whitespace-nowrap">{r.dateKey}</td>
                      {/* Timesheet block */}
                      <td className="p-3 whitespace-nowrap border-l border-[var(--color-line)] bg-brand-50/30">{t ? formatAuTime(t.startAt) : "—"}</td>
                      <td className="p-3 whitespace-nowrap bg-brand-50/30">{t ? formatAuTime(t.endAt) : "—"}</td>
                      <td className="p-3 bg-brand-50/30">{t ? `${tsBreak(t)}m` : "—"}</td>
                      <td className="p-3 font-medium bg-brand-50/30">{t ? minutesToHhMm(timesheetWorkedMinutes(t)) : "—"}</td>
                      {/* Clock-in block */}
                      <td className="p-3 whitespace-nowrap border-l border-[var(--color-line)]">{s ? formatAuTime(s.startedAt) : "—"}</td>
                      <td className="p-3 whitespace-nowrap">{s?.endedAt ? formatAuTime(s.endedAt) : "—"}</td>
                      <td className="p-3">{s ? `${shiftBreak(s)}m` : "—"}</td>
                      <td className="p-3 font-medium">{s ? minutesToHhMm(shiftWorkedMinutes(s)) : "—"}</td>
                      {/* Discrepancy */}
                      <td className="p-3 whitespace-nowrap">
                        {diff == null ? (
                          <span className="text-[var(--color-muted)]">—</span>
                        ) : (
                          <span className={`font-medium tabular-nums ${bigDiff ? "text-[var(--color-danger)]" : diff === 0 ? "text-[var(--color-muted)]" : "text-[var(--color-ink-soft)]"}`}>
                            {fmtDiff(diff)}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`chip ${badge.cls}`}>
                          {r.state === "matched" ? <IconCheck size={12} /> : r.state === "location-mismatch" ? <IconWarning size={12} /> : null}
                          {badge.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail popup */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`${detail.workerName} · ${detail.dateKey}`}>
          <div className="grid sm:grid-cols-2 gap-3">
            <RecordPanel title="Timesheet" tone="brand" empty={!detail.timesheet}>
              {detail.timesheet && (
                <>
                  <Row label="Site" value={detail.timesheet.siteLabel} />
                  <Row label="Time in" value={formatAuDateTime(detail.timesheet.startAt)} />
                  <Row label="Time out" value={formatAuDateTime(detail.timesheet.endAt)} />
                  <Row label="Break" value={`${tsBreak(detail.timesheet)} min`} />
                  <Row label="Total" value={minutesToHhMm(timesheetWorkedMinutes(detail.timesheet))} strong />
                  <Row label="Status" value={<StatusPill status={detail.timesheet.status} />} />
                </>
              )}
            </RecordPanel>
            <RecordPanel title="Clock-in shift" empty={!detail.shift}>
              {detail.shift && (
                <>
                  <Row label="Site" value={detail.shift.siteName} />
                  <Row label="Time in" value={formatAuDateTime(detail.shift.startedAt)} />
                  <Row label="Time out" value={detail.shift.endedAt ? formatAuDateTime(detail.shift.endedAt) : "—"} />
                  <Row label="Break" value={`${shiftBreak(detail.shift)} min`} />
                  <Row label="Total" value={minutesToHhMm(shiftWorkedMinutes(detail.shift))} strong />
                  <Row label="Status" value={<StatusPill status={detail.shift.approvalStatus} />} />
                </>
              )}
            </RecordPanel>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {detail.timesheet && (
              <button className="btn-outline px-3 py-2 text-xs" onClick={() => { setEditTs(detail.timesheet!); setDetail(null); }}>
                <IconPencil size={14} /> Edit timesheet
              </button>
            )}
            {detail.shift && (
              <button className="btn-outline px-3 py-2 text-xs" onClick={() => { setEditShift(detail.shift!); setDetail(null); }}>
                <IconPencil size={14} /> Edit shift
              </button>
            )}
            {(detail.state === "shift-only" || detail.state === "timesheet-only") && (
              <button className="btn-outline px-3 py-2 text-xs" onClick={() => { setLinkFor(detail); setDetail(null); }}>
                <IconLink size={14} /> Find match
              </button>
            )}
            {detail.shift && detail.timesheet && detail.shift.linkedTimesheetId && (
              <button className="btn-ghost px-3 py-2 text-xs" onClick={() => { link(detail.shift!.id, null); setDetail(null); }}>
                <IconX size={14} /> Unmatch
              </button>
            )}
            <div className="ml-auto flex gap-2">
              {detail.timesheet && (
                <button className="btn-ghost px-3 py-2 text-xs text-[var(--color-danger)]"
                  onClick={async () => { if (await del("timesheet", detail.timesheet!.id, `Timesheet · ${detail.timesheet!.siteLabel}`)) setDetail(null); }}>
                  <IconTrash size={14} /> Delete TS
                </button>
              )}
              {detail.shift && (
                <button className="btn-ghost px-3 py-2 text-xs text-[var(--color-danger)]"
                  onClick={async () => { if (await del("shift", detail.shift!.id, `Shift · ${detail.shift!.siteName}`)) setDetail(null); }}>
                  <IconTrash size={14} /> Delete shift
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {editShift && <EditShift shift={editShift} onClose={() => setEditShift(null)} />}
      {editTs && <EditTimesheet ts={editTs} onClose={() => setEditTs(null)} />}

      {/* Match picker */}
      {linkFor && (
        <Modal open onClose={() => setLinkFor(null)} title={linkFor.state === "shift-only" ? "Match a timesheet to this shift" : "Match a clock-in to this timesheet"}>
          <div className="mb-3 text-sm text-[var(--color-muted)]">
            {linkFor.workerName} · {linkFor.dateKey} · {linkFor.shift?.siteName || linkFor.timesheet?.siteLabel}
          </div>
          {(() => {
            const wantTimesheet = linkFor.state === "shift-only";
            const candidates = allRows
              .filter((c) => (wantTimesheet ? c.state === "timesheet-only" : c.state === "shift-only"))
              .sort((a, b) => {
                const aw = a.workerUid === linkFor.workerUid ? 0 : 1;
                const bw = b.workerUid === linkFor.workerUid ? 0 : 1;
                return aw - bw || b.dateKey.localeCompare(a.dateKey);
              });
            if (candidates.length === 0)
              return <p className="text-sm text-[var(--color-muted)] py-6 text-center">Nothing available to match.</p>;
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

const STAT_TONE: Record<string, string> = {
  approved: "text-teal-600 bg-[#e6faf3] border-teal-100",
  pending: "text-warn bg-warn-soft border-amber-100",
  hold: "text-brand-700 bg-brand-50 border-brand-100",
  edited: "text-ocean-700 bg-ocean-50 border-ocean-100",
};

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="card p-4 flex items-center justify-between">
      <div>
        <div className="text-xs text-[var(--color-muted)] font-medium">{label}</div>
        <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5">{value}</div>
      </div>
      <span className={`w-9 h-9 rounded-full grid place-items-center border ${STAT_TONE[tone] || STAT_TONE.hold}`}>
        {icon ?? <IconLink size={16} />}
      </span>
    </div>
  );
}

function RecordPanel({ title, tone, empty, children }: { title: string; tone?: "brand"; empty?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "brand" ? "border-brand-200 bg-brand-50/40" : "border-[var(--color-line)]"}`}>
      <div className="font-semibold text-sm mb-2">{title}</div>
      {empty ? <p className="text-sm text-[var(--color-muted)] py-4 text-center">Not submitted / not clocked in.</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className={`text-right ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
