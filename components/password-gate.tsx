"use client";

import { createContext, useContext, useRef, useState } from "react";
import { IconWarning } from "./icons";

type RequireFn = (opts?: { title?: string; message?: string }) => Promise<boolean>;
const Ctx = createContext<RequireFn | null>(null);

export function useRequirePassword(): RequireFn {
  const c = useContext(Ctx);
  if (!c) return async () => false;
  return c;
}

/** Provider that gates sensitive actions behind a server-verified password. */
export function PasswordProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<{ title?: string; message?: string }>({});
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const require: RequireFn = (o) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(o ?? {});
      setPw("");
      setErr("");
      setOpen(true);
    });

  function close(v: boolean) {
    resolver.current?.(v);
    resolver.current = null;
    setOpen(false);
  }

  async function submit() {
    if (!pw) return setErr("Enter the password.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (r.ok) close(true);
      else setErr("Incorrect password.");
    } catch {
      setErr("Could not verify — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider value={require}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => close(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start gap-4">
              <span className="shrink-0 w-11 h-11 rounded-full grid place-items-center bg-danger-soft text-[var(--color-danger)]">
                <IconWarning size={22} />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">{opts.title || "Confirm password"}</h3>
                <p className="text-sm text-[var(--color-muted)] mt-1">
                  {opts.message || "This is a sensitive action. Enter the password to continue."}
                </p>
              </div>
            </div>
            <input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Password"
              className="input mt-4"
            />
            {err && <p className="text-sm text-[var(--color-danger)] mt-2">{err}</p>}
            <div className="flex gap-3 justify-end mt-5">
              <button className="btn-outline" onClick={() => close(false)}>Cancel</button>
              <button className="btn-danger" onClick={submit} disabled={busy}>
                {busy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
