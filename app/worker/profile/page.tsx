"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/client-auth";
import { Spinner } from "@/components/ui";
import { IconMapPin, IconLogout } from "@/components/icons";

interface Me {
  user: { email: string; name?: string; uid: string; photoURL?: string } | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [ctx, setCtx] = useState<{ sites: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setMe);
    fetch("/api/worker/context").then((r) => r.json()).then((d) => setCtx(d));
  }, []);

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  if (!me) {
    return (
      <div className="grid place-items-center h-dvh text-[var(--color-muted)]">
        <Spinner />
      </div>
    );
  }

  const name = me.user?.name || "Worker";
  return (
    <div>
      <header className="grad-ocean text-white px-5 pt-safe pb-8 rounded-b-3xl">
        <div className="pt-6 flex flex-col items-center">
          {me.user?.photoURL ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={me.user.photoURL}
              alt={name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-full object-cover ring-4 ring-white/30"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/15 grid place-items-center text-3xl font-bold">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-bold mt-3">{name}</h1>
          <p className="text-ocean-100 text-sm">{me.user?.email}</p>
        </div>
      </header>

      <main className="px-5 py-4 space-y-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Your sites</h2>
          {ctx?.sites?.length ? (
            <ul className="space-y-2">
              {ctx.sites.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <IconMapPin size={16} className="text-ocean-600 shrink-0" /> {s.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">No sites assigned yet.</p>
          )}
        </div>

        <div className="card divide-y divide-[var(--color-line)]">
          <Row label="App" value="Clockwise" />
          <Row label="Timezone" value="Australia" />
          <Row label="Sign-in" value="Google" />
        </div>

        <button className="btn-outline w-full text-[var(--color-danger)]" onClick={doLogout}>
          <IconLogout size={18} /> Sign out
        </button>
        <p className="text-center text-xs text-[var(--color-muted)]">
          Your location is only used while clocking in/out and during an active shift.
        </p>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
