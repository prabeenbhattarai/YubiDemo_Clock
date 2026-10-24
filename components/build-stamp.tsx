/**
 * Small "which version is live" footer. The build time + commit are baked in at
 * build time (see next.config.ts), so an admin can ask a worker to read the
 * bottom of the page and confirm they're on the latest deploy.
 */
export default function BuildStamp() {
  const iso = process.env.NEXT_PUBLIC_BUILD_TIME || "";
  const rev = process.env.NEXT_PUBLIC_BUILD_REV || "";
  let when = "dev";
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      when = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Sydney",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(d);
    }
  }
  return (
    <div className="text-center text-[10px] text-[var(--color-muted)] py-4">
      Updated {when}
      {rev ? ` · ${rev}` : ""}
    </div>
  );
}
