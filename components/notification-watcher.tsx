"use client";

import { useEffect, useRef } from "react";
import { orderBy, limit, useLiveCollection } from "@/lib/live";
import type { AppNotification } from "@/lib/types";
import { useToast } from "@/components/toast";
import { ensureAudio, playChime, isMuted } from "@/lib/notif-sound";

/**
 * Always-mounted (desktop AND mobile) engine that watches the notifications
 * collection and, on a newly-arrived notification, plays a chime + shows a
 * toast popup. Renders nothing. Kept separate from the bell UI so it fires
 * regardless of which header (mobile/desktop) is visible.
 */
export default function NotificationWatcher() {
  const { data } = useLiveCollection<AppNotification>("notifications", [
    orderBy("at", "desc"),
    limit(10),
  ]);
  const toast = useToast();
  const seenAt = useRef<number | null>(null);

  // Unlock/resume audio on any user interaction (autoplay policy).
  useEffect(() => {
    const unlock = () => ensureAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (data.length === 0) return;
    const newest = data[0].at;
    if (seenAt.current === null) {
      seenAt.current = newest; // first load — don't announce history
      return;
    }
    if (newest > seenAt.current) {
      const fresh = data.filter((n) => n.at > (seenAt.current as number));
      seenAt.current = newest;
      if (!isMuted()) playChime();
      toast.info(
        fresh.length > 1 ? `${fresh.length} new notifications` : "New notification",
        fresh[0]?.message
      );
    }
  }, [data, toast]);

  return null;
}
