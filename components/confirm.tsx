"use client";

import { createContext, useContext, useRef, useState } from "react";
import { IconWarning } from "./icons";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) return async () => window.confirm("Are you sure?");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm: ConfirmFn = (o) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(o);
    });

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => close(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 animate-in">
            <div className="flex items-start gap-4">
              <span
                className={`shrink-0 w-11 h-11 rounded-full grid place-items-center ${
                  opts.danger ? "bg-danger-soft text-[var(--color-danger)]" : "bg-brand-50 text-brand-600"
                }`}
              >
                <IconWarning size={22} />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">{opts.title}</h3>
                {opts.message && (
                  <p className="text-sm text-[var(--color-muted)] mt-1">{opts.message}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn-outline" onClick={() => close(false)}>
                {opts.cancelLabel || "Cancel"}
              </button>
              <button
                className={opts.danger ? "btn-danger" : "btn-primary"}
                onClick={() => close(true)}
              >
                {opts.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
