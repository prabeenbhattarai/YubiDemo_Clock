"use client";

import { useEffect, useMemo, useState } from "react";
import { orderBy, useLiveCollection } from "@/lib/live";
import type { Site, Worker } from "@/lib/types";
import { Spinner, EmptyState, Field } from "@/components/ui";
import Modal from "@/components/modal";
import { Toggle } from "../sites/page";
import { IconUsers, IconX } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";

export default function WorkersPage() {
  const { data: allWorkers, loading } = useLiveCollection<Worker>("workers", [orderBy("name")]);
  const { data: sites } = useLiveCollection<Site>("sites", [orderBy("name")]);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get("q") || "");
  }, []);

  const workers = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return allWorkers;
    return allWorkers.filter(
      (w) => w.name.toLowerCase().includes(t) || w.email.toLowerCase().includes(t)
    );
  }, [allWorkers, q]);

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "—";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workers</h1>
          <p className="text-[var(--color-muted)] text-sm">
            Register workers and assign them to sites.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + Add worker
        </button>
      </div>

      {q && (
        <button
          onClick={() => setQ("")}
          className="chip bg-brand-50 text-brand-700 mb-4"
        >
          Filtered: “{q}” <IconX size={13} />
        </button>
      )}

      {loading ? (
        <div className="py-16 text-center text-[var(--color-muted)]">
          <Spinner /> Loading…
        </div>
      ) : workers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconUsers size={22} />}
            title="No workers yet"
            subtitle="Add a worker — they'll sign in with the email you register."
          />
        </div>
      ) : (
        <div className="card divide-y divide-[var(--color-line)]">
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => setEditing(w)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--color-canvas)] transition"
            >
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold shrink-0">
                {w.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{w.name}</div>
                <div className="text-sm text-[var(--color-muted)] truncate">{w.email}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-[var(--color-muted)]">
                  {w.assignedSiteIds?.length || 0} site
                  {(w.assignedSiteIds?.length || 0) === 1 ? "" : "s"}
                </div>
                {w.active === false && <span className="chip pill-declined mt-1">Inactive</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <WorkerForm
          worker={editing}
          sites={sites}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {!loading && workers.length > 0 && (
        <p className="text-xs text-[var(--color-muted)] mt-4">
          Tap a worker to edit assignments, or their sites: {sites.length} available.
          {sites.length === 0 && " Add sites first to assign them."}
        </p>
      )}
      {/* keep siteName referenced for future inline display */}
      <span className="hidden">{siteName("")}</span>
    </div>
  );
}

function WorkerForm({
  worker,
  sites,
  onClose,
}: {
  worker: Worker | null;
  sites: Site[];
  onClose: () => void;
}) {
  const isEdit = !!worker;
  const [name, setName] = useState(worker?.name ?? "");
  const [jobTitle, setJobTitle] = useState(worker?.jobTitle ?? "");
  const [email, setEmail] = useState(worker?.email ?? "");
  const [assigned, setAssigned] = useState<string[]>(worker?.assignedSiteIds ?? []);
  const [active, setActive] = useState(worker?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  function toggleSite(id: string) {
    setAssigned((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    setError("");
    if (!name.trim()) return setError("Name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email.");
    setSaving(true);
    const body = { name, jobTitle, email, assignedSiteIds: assigned, active };
    const res = await fetch(
      isEdit ? `/api/admin/workers/${worker!.id}` : "/api/admin/workers",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      toast.error("Couldn't save worker", data.error);
      return;
    }
    toast.success(isEdit ? "Worker updated" : "Worker added", name);
    onClose();
  }

  async function remove() {
    if (!worker) return;
    const ok = await confirm({
      title: `Remove ${worker.name}?`,
      message: "They will no longer be able to sign in. Their records are kept.",
      confirmLabel: "Remove worker",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    const res = await fetch(`/api/admin/workers/${worker.id}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) toast.success("Worker removed", worker.name);
    else toast.error("Couldn't remove worker");
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit worker" : "Add worker"}
      footer={
        <>
          {isEdit && (
            <button className="btn-ghost text-[var(--color-danger)] mr-auto" onClick={remove}>
              Remove
            </button>
          )}
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : isEdit ? "Save" : "Add worker"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name">
          <input
            className="input"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Job title" hint="Optional — appears on hour exports.">
          <input
            className="input"
            placeholder="e.g. Labourer, Machine operator"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </Field>
        <Field label="Email" hint="They sign in with this email via a one-time code.">
          <input
            className="input"
            type="email"
            placeholder="jane@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Assigned sites">
          {sites.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No sites yet — add sites first.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {sites.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${
                    assigned.includes(s.id)
                      ? "border-brand-500 bg-brand-50"
                      : "border-[var(--color-line)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-brand-600 w-4 h-4"
                    checked={assigned.includes(s.id)}
                    onChange={() => toggleSite(s.id)}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-[var(--color-muted)] truncate">
                      {s.address}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Field>

        <label className="flex items-center justify-between py-2 border-t border-[var(--color-line)]">
          <span className="text-sm font-medium">Active</span>
          <Toggle checked={active} onChange={setActive} />
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
