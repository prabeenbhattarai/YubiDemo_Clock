"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useLiveCollection } from "@/lib/live";
import type { Timesheet, Worker } from "@/lib/types";
import { auDateKey, timesheetWorkedMinutes } from "@/lib/reconcile";
import { listFortnights, isWithinFortnight, fortnightStartKey, fortnightLabel } from "@/lib/fortnight";
import { Spinner, EmptyState } from "@/components/ui";
import { PrintWatermark, PrintDisclaimer } from "@/components/print-extras";
import { IconWallet, IconTrash } from "@/components/icons";

const ALL = "all";

/** One editable line in the pay run. */
interface PayRow {
  key: string;
  name: string;
  hours: number;
  rate: number;
  payment: string;
}

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A readable one-line payment detail from a worker's saved pay info. */
function formatPayment(w?: Worker): string {
  if (!w) return "";
  if (w.payType === "payid") return w.payId ? `PayID: ${w.payId}` : "PayID: —";
  if (w.payType === "bank") {
    const parts = [
      w.accountName,
      w.bsb ? `BSB ${w.bsb}` : null,
      w.accountNumber ? `Acct ${w.accountNumber}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Bank account: —";
  }
  return "";
}

export default function PayPage() {
  const { data: timesheets, loading: lt } = useLiveCollection<Timesheet>("timesheets", []);
  const { data: workers, loading: lw } = useLiveCollection<Worker>("workers", []);
  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState<string>(() => fortnightStartKey(auDateKey(Date.now())));

  // Timesheet minutes per worker for the chosen period.
  const base = useMemo<PayRow[]>(() => {
    const mins = new Map<string, number>();
    const add = (key: string, m: number) => mins.set(key, (mins.get(key) || 0) + m);
    for (const t of timesheets) {
      if (period !== ALL && !isWithinFortnight(auDateKey(t.startAt), period)) continue;
      add(t.workerUid || t.workerName || "—", timesheetWorkedMinutes(t));
    }
    const rows: PayRow[] = [];
    for (const [key, m] of mins) {
      if (m <= 0) continue;
      const w = workers.find((x) => x.uid && x.uid === key) || workers.find((x) => x.name === key);
      rows.push({
        key,
        name: w?.name || key,
        hours: round2(m / 60),
        rate: w?.payRate ?? 0,
        payment: formatPayment(w),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [timesheets, workers, period]);

  const loading = lt || lw;
  const periodText = period === ALL ? "All periods" : fortnightLabel(period);

  return (
    <div>
      <div className="mb-5 no-print">
        <h1 className="text-2xl font-bold">Pay run</h1>
        <p className="text-[var(--color-muted)] text-sm">
          Hours × pay rate per worker for a working period. Edit any value, then export.
          Hours come from submitted timesheets. Pay rates come from each
          worker&apos;s profile on the Workers page.
        </p>
      </div>

      <div className="card p-4 mb-4 no-print flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Working period</label>
          <select
            className="input max-w-xs"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value={ALL}>All periods</option>
            {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--color-muted)]"><Spinner /> Loading…</div>
      ) : (
        <PayRun key={period} base={base} periodText={periodText} />
      )}
    </div>
  );
}

function PayRun({ base, periodText }: { base: PayRow[]; periodText: string }) {
  const [rows, setRows] = useState<PayRow[]>(base);

  function update(i: number, patch: Partial<PayRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalHours = round2(rows.reduce((s, r) => s + (Number(r.hours) || 0), 0));
  const totalPay = round2(rows.reduce((s, r) => s + (Number(r.hours) || 0) * (Number(r.rate) || 0), 0));

  async function exportXlsx() {
    const mod = await import("xlsx-js-style");
    const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const b = { style: "thin", color: { rgb: "CBD5E1" } };
    const borders = { top: b, bottom: b, left: b, right: b };
    const head = { font: { bold: true, color: { rgb: "1E293B" } }, fill: { fgColor: { rgb: "E5E7EB" } }, border: borders, alignment: { horizontal: "center" } };
    const cell = { border: borders };
    const num = { border: borders, alignment: { horizontal: "right" } };
    const totalStyle = { font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } }, border: borders };
    const totalNum = { ...totalStyle, alignment: { horizontal: "right" } };

    const header = ["Worker", "Hours", "Rate ($/h)", "Pay ($)", "Payment detail"];
    const aoa: (string | number)[][] = [header];
    for (const r of rows) {
      aoa.push([r.name, round2(Number(r.hours) || 0), round2(Number(r.rate) || 0), round2((Number(r.hours) || 0) * (Number(r.rate) || 0)), r.payment]);
    }
    aoa.push(["Total", round2(totalHours), "", round2(totalPay), ""]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const lastRow = aoa.length - 1;
    for (let rr = 0; rr < aoa.length; rr++) {
      for (let c = 0; c < header.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: rr, c });
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        if (rr === 0) ws[ref].s = head;
        else if (rr === lastRow) ws[ref].s = c === 1 || c === 3 ? totalNum : totalStyle;
        else ws[ref].s = c === 1 || c === 2 || c === 3 ? num : cell;
      }
    }
    ws["!cols"] = [{ wch: 26 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pay run");
    XLSX.writeFile(wb, `yubi-pay-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (rows.length === 0) {
    return (
      <div className="card no-print">
        <EmptyState icon={<IconWallet size={22} />} title="No paid hours in this period" subtitle="Choose another working period." />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <div className="text-sm text-[var(--color-muted)]">
          {rows.length} worker{rows.length === 1 ? "" : "s"} · {totalHours} h · <span className="font-semibold text-brand-700">{money(totalPay)}</span>
        </div>
        <div className="flex gap-2 ml-auto">
          <button className="btn-outline" onClick={exportXlsx}>Export Excel</button>
          <button className="btn-primary" onClick={() => window.print()}>Download PDF</button>
        </div>
      </div>

      {/* Editable table (screen only) */}
      <div className="card overflow-x-auto no-print">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-line)]">
              <th className="p-3 font-medium">Worker</th>
              <th className="p-3 font-medium w-28">Hours</th>
              <th className="p-3 font-medium w-32">Rate ($/h)</th>
              <th className="p-3 font-medium w-28">Pay</th>
              <th className="p-3 font-medium">Payment detail</th>
              <th className="p-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pay = (Number(r.hours) || 0) * (Number(r.rate) || 0);
              return (
                <tr key={r.key} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-2">
                    <input className="input" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td className="p-2">
                    <input className="input text-right" type="number" min={0} step="0.25" value={r.hours}
                      onChange={(e) => update(i, { hours: Number(e.target.value) })} />
                  </td>
                  <td className="p-2">
                    <input className="input text-right" type="number" min={0} step="0.01" value={r.rate}
                      onChange={(e) => update(i, { rate: Number(e.target.value) })} />
                  </td>
                  <td className="p-3 font-semibold tabular-nums whitespace-nowrap">{money(pay)}</td>
                  <td className="p-2">
                    <input className="input" value={r.payment} placeholder="PayID / BSB + account"
                      onChange={(e) => update(i, { payment: e.target.value })} />
                  </td>
                  <td className="p-2 text-center">
                    <button className="btn-ghost px-2 py-1.5 text-[var(--color-danger)]" title="Remove from this run" onClick={() => remove(i)}>
                      <IconTrash size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-line)] font-semibold">
              <td className="p-3">Total</td>
              <td className="p-3 text-right tabular-nums">{totalHours}</td>
              <td className="p-3"></td>
              <td className="p-3 text-right tabular-nums text-brand-700">{money(totalPay)}</td>
              <td className="p-3" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Print / PDF layout */}
      <div className="print-area hidden print:block">
        <PrintWatermark />
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Yubi Demolition — Pay run</h2>
          <p style={{ fontSize: 12, margin: "4px 0 0", color: "#475569" }}>{periodText}</p>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Worker", "Hours", "Rate ($/h)", "Pay ($)", "Payment detail"].map((h) => (
                <th key={h} style={pHead}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pay = (Number(r.hours) || 0) * (Number(r.rate) || 0);
              return (
                <tr key={r.key} style={{ pageBreakInside: "avoid" }}>
                  <td style={pCell}>{r.name}</td>
                  <td style={pNum}>{round2(Number(r.hours) || 0)}</td>
                  <td style={pNum}>{money(Number(r.rate) || 0)}</td>
                  <td style={pNum}>{money(pay)}</td>
                  <td style={pCell}>{r.payment}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...pCell, fontWeight: 700 }}>Total</td>
              <td style={{ ...pNum, fontWeight: 700 }}>{totalHours}</td>
              <td style={pCell}></td>
              <td style={{ ...pNum, fontWeight: 700 }}>{money(totalPay)}</td>
              <td style={pCell}></td>
            </tr>
          </tbody>
        </table>
        <PrintDisclaimer />
      </div>
    </>
  );
}

const pCell: CSSProperties = { border: "1px solid #cbd5e1", padding: "6px 8px", textAlign: "left", fontSize: 12, verticalAlign: "top" };
const pNum: CSSProperties = { ...pCell, textAlign: "right", whiteSpace: "nowrap" };
const pHead: CSSProperties = { ...pCell, background: "#e5e7eb", fontWeight: 700, textAlign: "center" };
