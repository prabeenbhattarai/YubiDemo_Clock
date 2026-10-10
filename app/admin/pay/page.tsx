"use client";

import { useMemo, useState } from "react";
import { useLiveCollection } from "@/lib/live";
import type { Site, Timesheet, Worker } from "@/lib/types";
import { auDateKey, timesheetWorkedMinutes } from "@/lib/reconcile";
import { listFortnights, isWithinFortnight, fortnightStartKey, fortnightLabel } from "@/lib/fortnight";
import { SITE_ALL, belongsToSite } from "@/lib/site-filter";
import { Spinner, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IconWallet, IconTrash } from "@/components/icons";
import {
  type PayRow,
  money,
  round2,
  payTotals,
  downloadPayXlsx,
  PayPrintArea,
} from "@/components/pay-doc";

const ALL = "all";

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
  const { data: sites, loading: lsite } = useLiveCollection<Site>("sites", []);
  const periods = useMemo(() => listFortnights(), []);
  const [period, setPeriod] = useState<string>(() => fortnightStartKey(auDateKey(Date.now())));
  const [siteId, setSiteId] = useState<string>(SITE_ALL);
  const activeSites = useMemo(() => sites.filter((s) => s.active !== false), [sites]);

  // Timesheet minutes per worker, scoped to the chosen site + period.
  const base = useMemo<PayRow[]>(() => {
    const mins = new Map<string, number>();
    const add = (key: string, m: number) => mins.set(key, (mins.get(key) || 0) + m);
    for (const t of timesheets) {
      if (!belongsToSite(t, siteId, sites)) continue;
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
  }, [timesheets, workers, sites, siteId, period]);

  const loading = lt || lw || lsite;
  const periodText = period === ALL ? "All periods" : fortnightLabel(period);
  const siteName = siteId === SITE_ALL ? "All sites" : sites.find((s) => s.id === siteId)?.name ?? "Site";
  const canFinalize = siteId !== SITE_ALL && period !== ALL;

  return (
    <div>
      <div className="mb-5 no-print">
        <h1 className="text-2xl font-bold">Pay run</h1>
        <p className="text-[var(--color-muted)] text-sm">
          Timesheet hours × pay rate per worker. Pick a site and working period, edit any
          value, then export — or Finalize to archive a locked copy under Documents.
        </p>
      </div>

      <div className="card p-4 mb-4 no-print flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Site / project</label>
          <select className="input max-w-xs" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value={SITE_ALL}>All sites</option>
            {activeSites.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </div>
        <div>
          <label className="label">Working period</label>
          <select className="input max-w-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value={ALL}>All periods</option>
            {periods.map((p) => (<option key={p.startKey} value={p.startKey}>{p.label}</option>))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--color-muted)]"><Spinner /> Loading…</div>
      ) : (
        <PayRun
          key={`${siteId}|${period}`}
          base={base}
          periodText={`${siteName} · ${periodText}`}
          siteId={siteId}
          siteName={siteName}
          periodStart={period}
          periodLabel={periodText}
          canFinalize={canFinalize}
        />
      )}
    </div>
  );
}

function PayRun({
  base,
  periodText,
  siteId,
  siteName,
  periodStart,
  periodLabel,
  canFinalize,
}: {
  base: PayRow[];
  periodText: string;
  siteId: string;
  siteName: string;
  periodStart: string;
  periodLabel: string;
  canFinalize: boolean;
}) {
  const [rows, setRows] = useState<PayRow[]>(base);
  const [finalizing, setFinalizing] = useState(false);
  const toast = useToast();

  function update(i: number, patch: Partial<PayRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const { hours: totalHours, pay: totalPay } = payTotals(rows);

  async function finalize() {
    setFinalizing(true);
    const res = await fetch("/api/admin/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteId,
        siteName,
        periodStart,
        periodLabel,
        rows: rows.map((r) => ({
          name: r.name,
          hours: Number(r.hours) || 0,
          rate: Number(r.rate) || 0,
          payment: r.payment,
        })),
      }),
    });
    setFinalizing(false);
    if (res.ok) toast.success("Finalized", "Saved to Documents");
    else {
      const d = await res.json().catch(() => ({}));
      toast.error("Could not finalize", d.error);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="card no-print">
        <EmptyState icon={<IconWallet size={22} />} title="No timesheet hours here" subtitle="Try another site or working period." />
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
          <button
            className="btn-success"
            onClick={finalize}
            disabled={!canFinalize || finalizing}
            title={canFinalize ? "Save a locked copy under Documents" : "Choose a specific site and working period to finalize"}
          >
            {finalizing ? <Spinner /> : "Finalize"}
          </button>
          <button className="btn-outline" onClick={() => downloadPayXlsx(rows, `yubi-pay-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
            Export Excel
          </button>
          <button className="btn-outline" onClick={() => window.print()}>Download PDF</button>
        </div>
      </div>
      {!canFinalize && (
        <p className="text-xs text-[var(--color-muted)] mb-3 no-print">
          Pick a specific site and working period to enable Finalize.
        </p>
      )}

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

      <PayPrintArea rows={rows} subtitle={periodText} />
    </>
  );
}
