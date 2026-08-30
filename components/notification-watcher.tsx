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
  // Baseline at mount time: only notifications that arrive AFTER the panel is
  // open should pop (existing ones are history). Works even from an empty collection.
  const seenAt = useRef<number>(Date.now());

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
    if (newest > seenAt.current) {
      const fresh = data.filter((n) => n.at > seenAt.current);
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
