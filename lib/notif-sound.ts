"use client";

// Notification chime via Web Audio (no asset file). Browsers block audio until
// a user gesture, so callers should invoke ensureAudio() on first interaction.

let audioCtx: AudioContext | null = null;

export function ensureAudio() {
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}

function tone(freq: number, start: number, dur: number) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);
  const t = audioCtx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playChime() {
  ensureAudio();
  if (!audioCtx) return;
  tone(880, 0, 0.32); // A5
  tone(1174.7, 0.13, 0.42); // D6
}

export const MUTE_KEY = "yubi_notif_muted";
export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setMuted(m: boolean) {
  try {
    if (m) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* ignore */
  }
}
