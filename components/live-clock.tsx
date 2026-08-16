"use client";

import { useEffect, useState } from "react";
import { auParts, greeting } from "@/lib/time";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function LiveClock({ name }: { name?: string }) {
  const now = useNow(1000);
  const { time, dateLong, hour } = auParts(now);
  return (
    <div>
      <p className="text-brand-100 font-medium">
        {greeting(hour)}
        {name ? `, ${name.split(" ")[0]}` : ""}
      </p>
      <p className="text-5xl font-bold tracking-tight mt-1 tabular-nums">{time}</p>
      <p className="text-brand-200 text-sm mt-1">
        {dateLong} · Australian time
      </p>
    </div>
  );
}
