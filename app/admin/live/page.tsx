"use client";

import { useState } from "react";
import { useLiveCollection, orderBy } from "@/lib/live";
import type { Shift, Site } from "@/lib/types";
import { elapsed, formatAuDateTime } from "@/lib/time";
import { useNow } from "@/components/live-clock";
import { EmptyState, Spinner } from "@/components/ui";
import Modal from "@/components/modal";
import ShiftMap from "@/components/shift-map";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconStop, IconTrash, IconMapPin } from "@/components/icons";

export default function OnShiftPage() {
  const { data: shifts, loading } = useLiveCollection<Shift>("shifts", [orderBy("startedAt", "desc")]);
  const { data: sites } = useLiveCollection<Site>("sites", []);
  const active = shifts.filter((s) => s.status === "active");
  const now = useNow(1000);
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [mapShift, setMapShift] = useState<Shift | null>(null);

  async function endShift(s: Shift) {
    const ok = await confirm({
      title: "End this shift?",
      message: `Clock ${s.workerName} out of ${s.siteName} now? Use this when a worker forgot to sign out.`,
      confirmLabel: "End shift",
    });
    if (!ok) return;
    setBusy(s.id);
    const res = await fetch(`/api/admin/shifts/${s.id}/end`, { method: "POST" });
    setBusy(null);
    if (res.ok) toast.success("Shift ended", `${s.workerName} clocked out.`);
    else toast.error("Could not end shift");
  }

  async function del(s: Shift) {
    const ok = await confirm({
      title: "Delete this shift?",
      message: `Permanently delete ${s.workerName}'s active shift at ${s.siteName}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(s.id);
    const res = await fetch(`/api/admin/approvals/shift/${s.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) toast.success("Shift deleted");
    else toast.error("Could not delete shift");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">On shift now</h1>
        <span className="chip pill-active">{active.length} active</span>
      </div>
      <p className="text-[var(--color-muted)] text-sm mb-5">
        Live headcount. End a shift for anyone who forgot to sign out, or delete a bad record.
      </p>

      {loading ? (
        <div className="py-16 text-center text-[var(--color-muted)]"><Spinner /></div>
      ) : active.length === 0 ? (
        <EmptyState icon={<IconMapPin size={22} />} title="Nobody is on shift" subtitle="Active clock-ins will appear here in real time." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {active.map((s) => {
            const inside = s.currentlyInside !== false;
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.workerName}</div>
                    <div className="text-sm text-[var(--color-muted)] truncate">{s.siteName}</div>
                  </div>
                  <span className={`chip ${inside ? "pill-active" : "pill-declined"}`}>
                    {inside ? "On site" : "Off site"}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-3">
                  <div>
                    <div className="text-2xl font-bold tabular-nums text-brand-700">{elapsed(s.startedAt, now)}</div>
                    <div className="text-xs text-[var(--color-muted)]">since {formatAuDateTime(s.startedAt)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <button className="btn-primary flex-1" disabled={busy === s.id} onClick={() => endShift(s)}>
                    <IconStop size={16} /> End shift
                  </button>
                  {(s.track?.length ?? 0) > 0 && (
                    <button className="btn-outline" onClick={() => setMapShift(s)} title="Live route">
                      <IconMapPin size={16} />
                    </button>
                  )}
                  <button className="btn-outline text-[var(--color-danger)]" disabled={busy === s.id} onClick={() => del(s)} title="Delete">
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mapShift && (
        <Modal open onClose={() => setMapShift(null)} title={`${mapShift.workerName} · live route`}>
          <div className="mb-3 text-sm text-[var(--color-muted)]">On shift · {mapShift.siteName}</div>
          <ShiftMap shift={mapShift} site={sites.find((x) => x.id === mapShift.siteId) ?? null} />
        </Modal>
      )}
    </div>
  );
}
