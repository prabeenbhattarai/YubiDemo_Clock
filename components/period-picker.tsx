"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck } from "@/components/icons";

const ALL = "all";

/**
 * A polished working-period dropdown. The period that contains today is marked
 * in green ("Current") so it's easy to tell apart from past/future fortnights.
 */
export default function PeriodPicker({
  periods,
  value,
  currentKey,
  onChange,
  align = "right",
}: {
  periods: { startKey: string; label: string }[];
  value: string;
  currentKey: string;
  onChange: (v: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selectedLabel = value === ALL ? "All time" : periods.find((p) => p.startKey === value)?.label ?? "Select period";
  const selectedIsCurrent = value === currentKey;

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm font-medium hover:bg-[var(--color-canvas)] transition"
      >
        {selectedIsCurrent && <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />}
        <span className="whitespace-nowrap">{selectedLabel}</span>
        <IconChevronDown size={16} className={`text-[var(--color-muted)] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} mt-2 w-64 max-h-80 overflow-y-auto bg-white rounded-xl border border-[var(--color-line)] shadow-xl z-50 py-1`}
        >
          <Option label="All time" selected={value === ALL} onClick={() => pick(ALL)} />
          {periods.map((p) => (
            <Option
              key={p.startKey}
              label={p.label}
              current={p.startKey === currentKey}
              selected={p.startKey === value}
              onClick={() => pick(p.startKey)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  current,
  selected,
  onClick,
}: {
  label: string;
  current?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
        current ? "bg-[var(--color-success-soft)]" : "hover:bg-[var(--color-canvas)]"
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${current ? "bg-[var(--color-success)]" : "bg-transparent"}`} />
      <span className={`flex-1 truncate ${current ? "font-semibold text-[var(--color-success)]" : ""}`}>{label}</span>
      {current && (
        <span className="chip" style={{ background: "#fff", color: "var(--color-success)", border: "1px solid var(--color-success)" }}>
          Current
        </span>
      )}
      {selected && <IconCheck size={15} className="text-brand-600 shrink-0" />}
    </button>
  );
}
