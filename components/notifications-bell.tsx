"use client";

import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/components/notifications-provider";
import { ensureAudio, isMuted, setMuted } from "@/lib/notif-sound";
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
  const { items, unread, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMutedState(isMuted()), []);

  useEffect(() => {
    if (!open) return;
    markAllRead();
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, markAllRead]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) ensureAudio();
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full grid place-items-center text-current hover:bg-black/10"
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
          <div className="px-4 py-3 border-b border-[var(--color-line)] flex items-center justify-between">
            <span className="font-semibold text-sm text-[var(--color-ink)]">Notifications</span>
            <button
              onClick={toggleMute}
              className="text-xs font-medium text-[var(--color-muted)] hover:text-brand-600"
              title={muted ? "Sound off" : "Sound on"}
            >
              {muted ? "🔕 Sound off" : "🔔 Sound on"}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                No notifications yet.
              </div>
            ) : (
              items.map((n) => {
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
