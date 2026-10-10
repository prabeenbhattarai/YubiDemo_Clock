"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveCollection } from "@/lib/live";
import type { Site, Worker } from "@/lib/types";
import { IconSearch, IconUsers, IconMapPin } from "@/components/icons";

/**
 * Compact search: a small icon button (sits next to the bell). Clicking it — or
 * pressing ⌘K / Ctrl+K — opens a search popup over the page.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const { data: sites } = useLiveCollection<Site>("sites", []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K to open, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQ("");
  }, [open]);

  const term = q.trim().toLowerCase();
  const workerHits = useMemo(
    () =>
      term
        ? workers.filter((w) => w.name.toLowerCase().includes(term) || w.email.toLowerCase().includes(term)).slice(0, 6)
        : [],
    [workers, term]
  );
  const siteHits = useMemo(
    () =>
      term
        ? sites.filter((s) => s.name.toLowerCase().includes(term) || (s.address || "").toLowerCase().includes(term)).slice(0, 6)
        : [],
    [sites, term]
  );
  const hasHits = workerHits.length > 0 || siteHits.length > 0;

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
        aria-label="Search"
        className="w-9 h-9 grid place-items-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] transition"
      >
        <IconSearch size={19} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-xl bg-white rounded-2xl border border-[var(--color-line)] shadow-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--color-line)]">
              <IconSearch size={20} className="text-[var(--color-muted)]" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && term) go(`/admin/workers?q=${encodeURIComponent(q.trim())}`);
                }}
                placeholder="Search workers, sites…"
                className="flex-1 bg-transparent outline-none text-base text-[var(--color-ink)]"
              />
              <kbd className="text-[11px] text-[var(--color-muted)] border border-[var(--color-line)] rounded px-1.5 py-0.5">Esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {!term ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">Type to search workers and sites.</div>
              ) : !hasHits ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">No matches for &ldquo;{q.trim()}&rdquo;</div>
              ) : (
                <div className="py-1">
                  {workerHits.length > 0 && (
                    <>
                      <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Workers</div>
                      {workerHits.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => go(`/admin/workers?q=${encodeURIComponent(w.name)}`)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-canvas)] text-left"
                        >
                          <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center shrink-0"><IconUsers size={16} /></span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{w.name}</span>
                            <span className="block text-xs text-[var(--color-muted)] truncate">{w.email}</span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {siteHits.length > 0 && (
                    <>
                      <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Sites</div>
                      {siteHits.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => go(`/admin/sites?q=${encodeURIComponent(s.name)}`)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-canvas)] text-left"
                        >
                          <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center shrink-0"><IconMapPin size={16} /></span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{s.name}</span>
                            <span className="block text-xs text-[var(--color-muted)] truncate">{s.address}</span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
