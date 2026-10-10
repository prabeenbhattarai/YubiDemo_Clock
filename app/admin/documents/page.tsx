"use client";

import { useEffect, useMemo, useState } from "react";
import type { PayDocument } from "@/lib/types";
import { formatAuDateTime } from "@/lib/time";
import { Spinner, EmptyState } from "@/components/ui";
import Modal from "@/components/modal";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconFolder, IconWallet, IconTrash, IconChevronDown } from "@/components/icons";
import { money, payTotals, downloadPayXlsx, PayPrintArea } from "@/components/pay-doc";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<PayDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PayDocument | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/documents");
    const d = await res.json().catch(() => ({}));
    setDocs(res.ok ? (d.documents ?? []) : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // Group by site → "timesheet" subfolder.
  const tree = useMemo(() => {
    const bySite = new Map<string, PayDocument[]>();
    for (const doc of docs) {
      const k = doc.siteName || "—";
      const list = bySite.get(k);
      if (list) list.push(doc);
      else bySite.set(k, [doc]);
    }
    return [...bySite.entries()]
      .map(([siteName, list]) => ({ siteName, docs: list }))
      .sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [docs]);

  async function del(doc: PayDocument) {
    const ok = await confirm({
      title: "Delete document?",
      message: `${doc.siteName} · ${doc.periodLabel} will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Document deleted");
      setPreview(null);
      load();
    } else {
      toast.error("Could not delete");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5 no-print">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-[var(--color-muted)] text-sm">
            Finalized pay runs, filed by site. Open one to preview, export, or delete.
          </p>
        </div>
        <button className="btn-outline shrink-0" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--color-muted)]"><Spinner /> Loading…</div>
      ) : docs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconFolder size={22} />}
            title="No documents yet"
            subtitle="Finalize a pay run (Pay page) to archive it here."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map((site) => (
            <SiteFolder key={site.siteName} siteName={site.siteName} docs={site.docs} onOpen={setPreview} />
          ))}
        </div>
      )}

      {preview && (
        <Modal
          open
          onClose={() => setPreview(null)}
          title={`finalize_timesheet_pay — ${preview.periodLabel}`}
          widthClass="sm:max-w-3xl"
          footer={
            <>
              <button className="btn-ghost text-[var(--color-danger)] mr-auto" onClick={() => del(preview)}>
                <IconTrash size={15} /> Delete
              </button>
              <button
                className="btn-outline"
                onClick={() => downloadPayXlsx(preview.rows, `yubi-pay-${preview.siteName}-${preview.periodStart}.xlsx`)}
              >
                Export Excel
              </button>
              <button className="btn-primary" onClick={() => window.print()}>Download PDF</button>
            </>
          }
        >
          <PayPreview doc={preview} />
        </Modal>
      )}

      {/* Page-level print area so Download PDF prints cleanly (not nested in the modal). */}
      {preview && <PayPrintArea rows={preview.rows} subtitle={`${preview.siteName} · ${preview.periodLabel}`} />}
    </div>
  );
}

function SiteFolder({
  siteName,
  docs,
  onOpen,
}: {
  siteName: string;
  docs: PayDocument[];
  onOpen: (d: PayDocument) => void;
}) {
  const [open, setOpen] = useState(true);
  const [subOpen, setSubOpen] = useState(true);
  return (
    <div className="card no-print">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-canvas)]"
      >
        <IconFolder size={18} className="text-brand-600" />
        <span className="font-semibold flex-1 truncate">{siteName}</span>
        <span className="text-xs text-[var(--color-muted)]">{docs.length} file{docs.length === 1 ? "" : "s"}</span>
        <span className={`transition ${open ? "rotate-180" : ""}`}><IconChevronDown size={16} /></span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-line)] pl-4">
          <button
            onClick={() => setSubOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-muted)] hover:bg-[var(--color-canvas)]"
          >
            <IconFolder size={15} />
            <span className="flex-1 font-medium">timesheet</span>
            <span className={`transition ${subOpen ? "rotate-180" : ""}`}><IconChevronDown size={14} /></span>
          </button>

          {subOpen && (
            <div className="pl-5 pb-2">
              {docs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onOpen(d)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-[var(--color-canvas)]"
                >
                  <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 grid place-items-center shrink-0">
                    <IconWallet size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">finalize_timesheet_pay — {d.periodLabel}</span>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {d.rows.length} worker{d.rows.length === 1 ? "" : "s"} · {d.totalHours} h · {money(d.totalPay)} · finalized {formatAuDateTime(d.finalizedAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PayPreview({ doc }: { doc: PayDocument }) {
  const { hours, pay } = payTotals(doc.rows);
  return (
    <div>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        {doc.siteName} · {doc.periodLabel}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-line)]">
              <th className="p-2 font-medium">Worker</th>
              <th className="p-2 font-medium text-right">Hours</th>
              <th className="p-2 font-medium text-right">Rate ($/h)</th>
              <th className="p-2 font-medium text-right">Pay</th>
              <th className="p-2 font-medium">Payment detail</th>
            </tr>
          </thead>
          <tbody>
            {doc.rows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--color-line)] last:border-0">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{r.hours}</td>
                <td className="p-2 text-right tabular-nums">{money(r.rate)}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{money(r.hours * r.rate)}</td>
                <td className="p-2 text-[var(--color-muted)]">{r.payment}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-line)] font-semibold">
              <td className="p-2">Total</td>
              <td className="p-2 text-right tabular-nums">{hours}</td>
              <td className="p-2"></td>
              <td className="p-2 text-right tabular-nums text-brand-700">{money(pay)}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
