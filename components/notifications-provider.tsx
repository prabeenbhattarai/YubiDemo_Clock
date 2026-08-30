"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AppNotification } from "@/lib/types";
import { useToast } from "@/components/toast";
import { ensureAudio, playChime, isMuted, setMuted } from "@/lib/notif-sound";

interface Ctx {
  items: AppNotification[];
  unread: number;
  markAllRead: () => void;
  refresh: () => void;
}
const NotifCtx = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  const c = useContext(NotifCtx);
  if (!c) return { items: [], unread: 0, markAllRead: () => {}, refresh: () => {} };
  return c;
}

const POLL_MS = 8000;
const PROMPT_KEY = "yubi_sound_prompted";

/**
 * Polls the server for notifications (Admin SDK, so it does not depend on
 * client Firestore rules or custom-claim propagation) and, on a newly-arrived
 * one, plays a chime + shows a toast. Also renders the one-time sound prompt.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const toast = useToast();
  const seenAt = useRef<number>(Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      const list: AppNotification[] = Array.isArray(d.notifications) ? d.notifications : [];
      setItems(list);
      if (list.length) {
        const newest = list[0].at;
        if (newest > seenAt.current) {
          const fresh = list.filter((n) => n.at > seenAt.current);
          seenAt.current = newest;
          if (!isMuted()) playChime();
          toast.info(
            fresh.length > 1 ? `${fresh.length} new notifications` : "New notification",
            fresh[0]?.message
          );
        }
      }
    } catch {
      /* ignore transient errors */
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/admin/notifications/read", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <NotifCtx.Provider value={{ items, unread, markAllRead, refresh }}>
      {children}
      <SoundPrompt />
    </NotifCtx.Provider>
  );
}

/** One-time prompt asking to enable notification sounds (also unlocks audio). */
function SoundPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(PROMPT_KEY) !== "1") setShow(true);
    } catch {
      /* ignore */
    }
  }, []);
  if (!show) return null;

  function done() {
    try {
      localStorage.setItem(PROMPT_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }
  function enable() {
    ensureAudio();
    setMuted(false);
    playChime(); // confirmation beep + unlocks audio via this user gesture
    done();
  }

  return (
    <div className="fixed bottom-4 inset-x-4 z-[120] mx-auto max-w-sm rounded-2xl bg-ink text-white shadow-xl p-4 flex items-center gap-3 animate-in">
      <span className="text-2xl">🔔</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">Enable notification sounds?</div>
        <div className="text-xs text-slate-300">Play a sound when a worker clocks in/out or submits a timesheet.</div>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={enable} className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5">
          Enable
        </button>
        <button onClick={done} className="text-slate-300 text-xs px-3 py-1">
          Not now
        </button>
      </div>
    </div>
  );
}
