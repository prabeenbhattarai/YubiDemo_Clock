"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";
import { IconCamera } from "./icons";

/**
 * Live-camera capture. Uses getUserMedia (no file picker — a fresh photo is
 * forced), draws a frame to canvas and compresses to a small JPEG data URL.
 */
export default function CameraCapture({
  onCapture,
  photo,
  onClear,
}: {
  onCapture: (dataUrl: string) => void;
  photo?: string | null;
  onClear?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (photo) return; // already captured
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStarting(false);
      } catch {
        setError("Camera access is required. Enable camera permission and retry.");
        setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 720 / (video.videoHeight || 720));
    canvas.width = (video.videoWidth || 960) * scale;
    canvas.height = (video.videoHeight || 720) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    stopStream();
    onCapture(dataUrl);
  }

  if (photo) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-[var(--color-line)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="Captured" className="w-full aspect-[4/3] object-cover" />
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full"
          >
            Retake
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--color-line)] bg-black">
      <div className="relative aspect-[4/3]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {starting && (
          <div className="absolute inset-0 grid place-items-center text-white">
            <span className="flex items-center gap-2 text-sm">
              <Spinner /> Starting camera…
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center text-center text-white text-sm px-6">
            {error}
          </div>
        )}
      </div>
      {!error && (
        <button
          type="button"
          onClick={capture}
          disabled={starting}
          className="w-full py-3 bg-white text-ink font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <IconCamera size={18} /> Take photo
        </button>
      )}
    </div>
  );
}
