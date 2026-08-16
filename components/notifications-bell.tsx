"use client";

import { useEffect, useRef, useState } from "react";
import { orderBy, limit, useLiveCollection } from "@/lib/live";
import type { AppNotification } from "@/lib/types";
import {
  IconBell,
  IconPlay,
  IconStop,
  IconWarning,
  IconClipboard,
} from "@/components/icons";

function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ICON = {
  clock_in: { el: <IconPlay size={15} />, cls: "bg-success-soft text-[var(--color-success)]" },
  clock_out: { el: <IconStop size={15} />, cls: "bg-[var(--color-canvas)] text-[var(--color-ink-soft)]" },
  out_of_range: { el: <IconWarning size={15} />, cls: "bg-warn-soft text-warn" },
  timesheet: { el: <IconClipboard size={15} />, cls: "bg-brand-50 text-brand-600" },
} as const;

export default function NotificationsBell() {
  const { data } = useLiveCollection<AppNotification>("notifications", [
    orderBy("at", "desc"),
    limit(30),
  ]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const unread = data.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    // Mark all read when the panel is opened.
    fetch("/api/admin/notifications/read", { method: "POST" }).catch(() => {});
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full grid place-items-center text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]"
        aria-label="Notifications"
      >
        <IconBell size={19} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl border border-[var(--color-line)] shadow-xl z-50 overflow-hidden animate-in">
          <div className="px-4 py-3 border-b border-[var(--color-line)] font-semibold text-sm">
            Notifications
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                No notifications yet.
              </div>
            ) : (
              data.map((n) => {
                const icon = ICON[n.type] ?? ICON.timesheet;
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 border-b border-[var(--color-line)] last:border-0 ${
                      n.read ? "" : "bg-brand-50/40"
                    }`}
                  >
                    <span className={`shrink-0 w-8 h-8 rounded-full grid place-items-center ${icon.cls}`}>
                      {icon.el}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--color-ink)]">{n.message}</p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{ago(n.at)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
