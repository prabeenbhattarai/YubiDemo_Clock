"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ensureFirebaseSignedIn } from "@/lib/client-auth";
import type { SessionUser } from "@/lib/types";

const TABS = [
  { href: "/worker", label: "Home", icon: HomeIcon, exact: true },
  { href: "/worker/timesheet", label: "Timesheet", icon: SheetIcon },
  { href: "/worker/history", label: "History", icon: HistoryIcon },
  { href: "/worker/profile", label: "Profile", icon: UserIcon },
];

export default function WorkerShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  useRouter();

  useEffect(() => {
    ensureFirebaseSignedIn();
  }, []);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)] mx-auto max-w-md flex flex-col">
      <div className="flex-1 pb-24">{children}</div>

      {/* Bottom app nav */}
      <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md bg-white border-t border-[var(--color-line)] pb-safe z-40">
        <div className="grid grid-cols-4">
          {TABS.map((t) => {
            const active = isActive(t.href, t.exact);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                  active ? "text-ocean-600" : "text-[var(--color-muted)]"
                }`}
              >
                <Icon active={active} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <span className="hidden">{user.email}</span>
    </div>
  );
}

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.12 : 0}
      />
    </svg>
  );
}
function SheetIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function HistoryIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} />
      <path d="M3 4v4h4M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UserIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} />
      <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
