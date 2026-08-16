import type { ApprovalStatus, ShiftStatus } from "@/lib/types";

const LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  on_hold: "On hold",
  edited: "Edited",
  active: "On shift",
  completed: "Completed",
};

export function StatusPill({
  status,
}: {
  status: ApprovalStatus | ShiftStatus | string;
}) {
  return (
    <span className={`chip pill-${status}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {LABELS[status] ?? status}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--color-muted)] mt-1">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-[var(--color-canvas)] text-[var(--color-muted)] grid place-items-center mx-auto mb-3">
          {icon}
        </div>
      )}
      <p className="font-semibold text-[var(--color-ink)]">{title}</p>
      {subtitle && (
        <p className="text-sm text-[var(--color-muted)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}

/** Full-width skeleton block for loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
