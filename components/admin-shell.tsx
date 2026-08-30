"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ensureFirebaseSignedIn, logout } from "@/lib/client-auth";
import type { SessionUser } from "@/lib/types";
import {
  IconDashboard,
  IconApprovals,
  IconMapPin,
  IconUsers,
  IconLogout,
  IconMenu,
  IconClipboard,
  IconClock,
} from "@/components/icons";
import Logo from "@/components/logo";
import GlobalSearch from "@/components/global-search";
import NotificationsBell from "@/components/notifications-bell";

const NAV = [
  { href: "/admin", label: "Dashboard", Icon: IconDashboard, exact: true },
  { href: "/admin/approvals", label: "Approvals", Icon: IconApprovals },
  { href: "/admin/live", label: "On shift", Icon: IconClock },
  { href: "/admin/reports", label: "Reports", Icon: IconClipboard },
  { href: "/admin/sites", label: "Sites", Icon: IconMapPin },
  { href: "/admin/workers", label: "Workers", Icon: IconUsers },
];

export default function AdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Make sure the Firebase client is signed in for real-time listeners.
  useEffect(() => {
    ensureFirebaseSignedIn();
  }, []);

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-dvh md:flex bg-[var(--color-canvas)]">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-ink text-white">
        <Brand />
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                isActive(n.href, n.exact)
                  ? "bg-brand-600 text-white"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <n.Icon size={19} />
              {n.label}
            </Link>
          ))}
        </nav>
        <UserBox email={user.email} onLogout={doLogout} />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-ink text-white flex items-center justify-between px-4 h-14 pt-safe">
        <span className="bg-white rounded-lg px-2 py-1 inline-flex">
          <Logo height={24} />
        </span>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-2 -mr-2"
          aria-label="Menu"
        >
          <IconMenu size={24} />
        </button>
      </header>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute top-0 right-0 w-64 h-full bg-ink text-white flex flex-col pt-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 font-bold border-b border-white/10">Menu</div>
            <nav className="flex-1 px-3 py-2 space-y-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    isActive(n.href, n.exact) ? "bg-brand-600" : "text-slate-300"
                  }`}
                >
                  <n.Icon size={19} />
                  {n.label}
                </Link>
              ))}
            </nav>
            <UserBox email={user.email} onLogout={doLogout} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop top bar */}
        <header className="hidden md:flex items-center gap-4 h-16 px-8 border-b border-[var(--color-line)] bg-white/70 backdrop-blur sticky top-0 z-20">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <div className="flex items-center gap-2.5 pl-2">
              {user.photoURL ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.photoURL}
                  alt={user.name || "Admin"}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-brand-600 text-white grid place-items-center text-sm font-semibold">
                  {user.email.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="leading-tight">
                <div className="text-sm font-semibold">{user.name || "Admin"}</div>
                <div className="text-xs text-[var(--color-muted)]">{user.email}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto w-full p-4 md:p-8 pb-16">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-4 py-3 border-b border-white/10">
      <div className="bg-white rounded-xl px-3 py-2 flex items-center justify-center">
        <Logo height={38} />
      </div>
      <div className="text-[11px] text-slate-400 mt-1.5 text-center tracking-wide">
        Admin console
      </div>
    </div>
  );
}

function UserBox({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="p-3 border-t border-white/10">
      <div className="text-xs text-slate-400 px-2 mb-2 truncate">{email}</div>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-200 hover:bg-white/5"
      >
        <IconLogout size={18} /> Sign out
      </button>
    </div>
  );
}
