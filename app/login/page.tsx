"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithGoogle } from "@/lib/client-auth";
import { Spinner } from "@/components/ui";
import Logo from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function google() {
    setError("");
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      router.replace(user.role === "admin" ? "/admin" : "/worker");
    } catch (err) {
      const msg = (err as Error).message || "Sign-in failed.";
      // Popup closed by the user isn't an error worth shouting about.
      if (!/popup|cancel|closed/i.test(msg)) setError(msg);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-brand-700 to-brand-900">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-8 text-white">
          <p className="text-brand-200 text-sm">Clock-in &amp; timesheets</p>
        </div>

        <div className="card p-6">
          <div className="flex justify-center mb-4">
            <Logo height={96} />
          </div>
          <h2 className="font-semibold text-lg text-center">Sign in</h2>
          <p className="text-sm text-[var(--color-muted)] text-center mt-1 mb-5">
            Use the Google account your administrator registered.
          </p>

          <button
            onClick={google}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 font-semibold text-[var(--color-ink)] hover:bg-[var(--color-canvas)] transition active:scale-[.98] disabled:opacity-60"
          >
            {loading ? <Spinner /> : <GoogleGlyph />}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          {error && (
            <p className="text-sm text-[var(--color-danger)] mt-4 text-center">{error}</p>
          )}
        </div>

        <p className="text-center text-brand-200 text-xs mt-6">
          Secure sign-in with Google. No passwords, no codes.
        </p>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
