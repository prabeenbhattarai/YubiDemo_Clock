"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { IconCheck, IconWarning, IconInfo, IconX } from "./icons";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // No-op fallback so components never crash if provider is missing.
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, title: string, description?: string) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, type, title, description }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove]
  );

  const api: ToastApi = {
    success: (t, d) => push("success", t, d),
    error: (t, d) => push("error", t, d),
    info: (t, d) => push("info", t, d),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed z-[100] top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 3900);
    return () => clearTimeout(t);
  }, []);

  const styles = {
    success: { bar: "bg-[var(--color-success)]", icon: <IconCheck size={16} />, ring: "text-[var(--color-success)]" },
    error: { bar: "bg-[var(--color-danger)]", icon: <IconWarning size={16} />, ring: "text-[var(--color-danger)]" },
    info: { bar: "bg-ocean-500", icon: <IconInfo size={16} />, ring: "text-ocean-600" },
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden bg-white rounded-xl border border-[var(--color-line)] shadow-lg flex gap-3 p-3.5 pr-9 ${
        leaving ? "toast-out" : "toast-in"
      }`}
      role="status"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar}`} />
      <span className={`shrink-0 mt-0.5 ${styles.ring}`}>{styles.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--color-ink)]">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="absolute right-2 top-2 text-[var(--color-muted)] hover:text-[var(--color-ink)] p-1"
        aria-label="Dismiss"
      >
        <IconX size={15} />
      </button>
    </div>
  );
}
