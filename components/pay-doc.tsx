"use client";

import type { CSSProperties } from "react";
import { PrintWatermark, PrintDisclaimer } from "@/components/print-extras";

/** One pay line. The editable Pay page adds a `key`; snapshots omit it. */
export interface PayRow {
  key?: string;
  name: string;
  hours: number;
  rate: number;
  payment: string;
}

export const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function payTotals(rows: PayRow[]): { hours: number; pay: number } {
  const hours = round2(rows.reduce((s, r) => s + (Number(r.hours) || 0), 0));
  const pay = round2(rows.reduce((s, r) => s + (Number(r.hours) || 0) * (Number(r.rate) || 0), 0));
  return { hours, pay };
}

/** Download the pay rows as a styled .xlsx. */
export async function downloadPayXlsx(rows: PayRow[], filename: string) {
  const mod = await import("xlsx-js-style");
  const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const b = { style: "thin", color: { rgb: "CBD5E1" } };
  const borders = { top: b, bottom: b, left: b, right: b };
  const head = { font: { bold: true, color: { rgb: "1E293B" } }, fill: { fgColor: { rgb: "E5E7EB" } }, border: borders, alignment: { horizontal: "center" } };
  const cell = { border: borders };
  const num = { border: borders, alignment: { horizontal: "right" } };
  const totalStyle = { font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } }, border: borders };
  const totalNum = { ...totalStyle, alignment: { horizontal: "right" } };

  const { hours, pay } = payTotals(rows);
  const header = ["Worker", "Hours", "Rate ($/h)", "Pay ($)", "Payment detail"];
  const aoa: (string | number)[][] = [header];
  for (const r of rows) {
    aoa.push([r.name, round2(Number(r.hours) || 0), round2(Number(r.rate) || 0), round2((Number(r.hours) || 0) * (Number(r.rate) || 0)), r.payment]);
  }
  aoa.push(["Total", hours, "", pay, ""]);

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
  XLSX.writeFile(wb, filename);
}

const pCell: CSSProperties = { border: "1px solid #cbd5e1", padding: "6px 8px", textAlign: "left", fontSize: 12, verticalAlign: "top" };
const pNum: CSSProperties = { ...pCell, textAlign: "right", whiteSpace: "nowrap" };
const pHead: CSSProperties = { ...pCell, background: "#e5e7eb", fontWeight: 700, textAlign: "center" };

/** Print-only (PDF) layout for a pay run, with logo watermark + disclaimer. */
export function PayPrintArea({ rows, subtitle }: { rows: PayRow[]; subtitle: string }) {
  const { hours, pay } = payTotals(rows);
  return (
    <div className="print-area hidden print:block">
      <PrintWatermark />
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Yubi Demolition — Pay run</h2>
        <p style={{ fontSize: 12, margin: "4px 0 0", color: "#475569" }}>{subtitle}</p>
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
          {rows.map((r, i) => {
            const rowPay = (Number(r.hours) || 0) * (Number(r.rate) || 0);
            return (
              <tr key={(r.key ?? r.name) + i} style={{ pageBreakInside: "avoid" }}>
                <td style={pCell}>{r.name}</td>
                <td style={pNum}>{round2(Number(r.hours) || 0)}</td>
                <td style={pNum}>{money(Number(r.rate) || 0)}</td>
                <td style={pNum}>{money(rowPay)}</td>
                <td style={pCell}>{r.payment}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...pCell, fontWeight: 700 }}>Total</td>
            <td style={{ ...pNum, fontWeight: 700 }}>{hours}</td>
            <td style={pCell}></td>
            <td style={{ ...pNum, fontWeight: 700 }}>{money(pay)}</td>
            <td style={pCell}></td>
          </tr>
        </tbody>
      </table>
      <PrintDisclaimer />
    </div>
  );
}
