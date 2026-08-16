"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveCollection } from "@/lib/live";
import type { Site, Worker } from "@/lib/types";
import { IconSearch, IconUsers, IconMapPin } from "@/components/icons";

export default function GlobalSearch() {
  const router = useRouter();
  const { data: workers } = useLiveCollection<Worker>("workers", []);
  const { data: sites } = useLiveCollection<Site>("sites", []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const term = q.trim().toLowerCase();
  const workerHits = useMemo(
    () =>
      term
        ? workers
            .filter(
              (w) =>
                w.name.toLowerCase().includes(term) ||
                w.email.toLowerCase().includes(term)
            )
            .slice(0, 5)
        : [],
    [workers, term]
  );
  const siteHits = useMemo(
    () =>
      term
        ? sites
            .filter(
              (s) =>
                s.name.toLowerCase().includes(term) ||
                (s.address || "").toLowerCase().includes(term)
            )
            .slice(0, 5)
        : [],
    [sites, term]
  );
  const hasHits = workerHits.length > 0 || siteHits.length > 0;

  function go(path: string) {
    setOpen(false);
    setQ("");
    router.push(path);
  }

  return (
    <div className="relative flex-1 max-w-md" ref={boxRef}>
      <div className="flex items-center gap-2 bg-[var(--color-canvas)] rounded-xl px-3 h-10 text-[var(--color-muted)]">
        <IconSearch size={18} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && term) {
              go(`/admin/workers?q=${encodeURIComponent(q.trim())}`);
            }
          }}
          className="bg-transparent outline-none text-sm w-full text-[var(--color-ink)]"
          placeholder="Search workers, sites…"
        />
      </div>

      {open && term && (
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-[var(--color-line)] shadow-xl z-50 overflow-hidden animate-in">
          {!hasHits ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
              No matches for &ldquo;{q.trim()}&rdquo;
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {workerHits.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                    Workers
                  </div>
                  {workerHits.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => go(`/admin/workers?q=${encodeURIComponent(w.name)}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-canvas)] text-left"
                    >
                      <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center">
                        <IconUsers size={15} />
                      </span>
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
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                    Sites
                  </div>
                  {siteHits.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => go(`/admin/sites?q=${encodeURIComponent(s.name)}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-canvas)] text-left"
                    >
                      <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center">
                        <IconMapPin size={15} />
                      </span>
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
      )}
    </div>
  );
}
