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
  IconX,
  IconClipboard,
  IconClock,
  IconLink,
  IconWallet,
  IconFolder,
} from "@/components/icons";
import Logo from "@/components/logo";
import GlobalSearch from "@/components/global-search";
import NotificationsBell from "@/components/notifications-bell";
import { NotificationsProvider } from "@/components/notifications-provider";

type NavItem = { href: string; label: string; Icon: typeof IconDashboard; exact?: boolean };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", Icon: IconDashboard, exact: true },
      { href: "/admin/live", label: "On shift", Icon: IconClock },
      { href: "/admin/approvals", label: "Approvals", Icon: IconApprovals },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/admin/reports", label: "Reports", Icon: IconClipboard },
      { href: "/admin/match", label: "Match", Icon: IconLink },
      { href: "/admin/pay", label: "Pay", Icon: IconWallet },
      { href: "/admin/documents", label: "Documents", Icon: IconFolder },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/admin/sites", label: "Sites", Icon: IconMapPin },
      { href: "/admin/workers", label: "Workers", Icon: IconUsers },
    ],
  },
];

export default function AdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
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

  return (
    <NotificationsProvider>
      <div className="min-h-dvh md:flex bg-[var(--color-canvas)]">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-[var(--color-surface)] border-r border-[var(--color-line)]">
          <Brand />
          <NavList />
          <UserBox user={user} onLogout={doLogout} />
        </aside>

        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-[var(--color-surface)] border-b border-[var(--color-line)] flex items-center justify-between px-4 h-14 pt-safe">
          <Logo height={24} />
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <button onClick={() => setMenuOpen(true)} className="p-2 -mr-2 text-[var(--color-ink-soft)]" aria-label="Menu">
              <IconMenu size={24} />
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40" onClick={() => setMenuOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute top-0 right-0 w-64 h-full bg-[var(--color-surface)] flex flex-col pt-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--color-line)]">
                <Logo height={24} />
                <button onClick={() => setMenuOpen(false)} className="p-2 -mr-2 text-[var(--color-ink-soft)]" aria-label="Close">
                  <IconX size={22} />
                </button>
              </div>
              <NavList onNavigate={() => setMenuOpen(false)} />
              <UserBox user={user} onLogout={doLogout} />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Desktop top bar */}
          <header className="hidden md:flex items-center gap-4 h-16 px-8 border-b border-[var(--color-line)] bg-white/70 backdrop-blur sticky top-0 z-20">
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              <NotificationsBell />
            </div>
          </header>

          <main className="w-full p-4 md:px-8 md:py-7 pb-16">{children}</main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((n) => {
              const active = isActive(n.href, n.exact);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]"
                  }`}
                >
                  <n.Icon size={19} className={active ? "text-brand-600" : "text-[var(--color-muted)]"} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="px-5 py-4 border-b border-[var(--color-line)]">
      <Logo height={34} />
      <div className="text-[11px] text-[var(--color-muted)] mt-1.5 tracking-wide">Admin console</div>
    </div>
  );
}

function UserBox({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  return (
    <div className="p-3 border-t border-[var(--color-line)]">
      <div className="flex items-center gap-3 px-2 py-2">
        {user.photoURL ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={user.photoURL}
            alt={user.name || "Admin"}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-brand-600 text-white grid place-items-center text-sm font-semibold shrink-0">
            {user.email.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <div className="text-sm font-semibold truncate">{user.name || "Admin"}</div>
          <div className="text-xs text-[var(--color-muted)] truncate">{user.email}</div>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="mt-1 w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]"
      >
        <IconLogout size={18} /> Sign out
      </button>
    </div>
  );
}
