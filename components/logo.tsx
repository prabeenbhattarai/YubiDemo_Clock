"use client";

import { useState } from "react";

/**
 * Yubi Demolition logo. Renders /logo.png (place your logo file there).
 * Falls back to a styled wordmark if the image is missing, so the UI never
 * shows a broken image.
 */
export default function Logo({
  className = "",
  height = 40,
  variant = "full",
}: {
  className?: string;
  height?: number;
  /** "full" = logo image; "word" = text wordmark only. */
  variant?: "full" | "word";
}) {
  const [failed, setFailed] = useState(false);

  if (variant === "word" || failed) {
    return (
      <span
        className={`font-extrabold tracking-tight leading-none ${className}`}
        style={{ fontSize: height * 0.5 }}
      >
        YUBI <span className="text-[#5a2a2a]">DEMOLITION</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Yubi Demolition"
      style={{ height }}
      className={`w-auto object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
