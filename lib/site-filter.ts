import type { Site } from "./types";

/** Sentinel meaning "every site" in the admin site-first pickers. */
export const SITE_ALL = "__all__";

/**
 * Does a record belong to the chosen site? Records carry a `siteId` once a site
 * is picked; legacy/casual records without one are matched by label, and in a
 * single-site system they all roll up to that one site.
 */
export function belongsToSite(
  rec: { siteId?: string | null; siteLabel?: string; siteName?: string },
  siteId: string,
  sites: Site[]
): boolean {
  if (siteId === SITE_ALL) return true;
  if (rec.siteId) return rec.siteId === siteId;
  const site = sites.find((s) => s.id === siteId);
  const label = (rec.siteLabel || rec.siteName || "").trim().toLowerCase();
  if (site && label && label === site.name.trim().toLowerCase()) return true;
  return sites.length <= 1; // one-site system: unassigned rolls up to the site
}
