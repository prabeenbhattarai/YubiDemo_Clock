import "server-only";
import { adminDb } from "./firebase/admin";
import { COL, now } from "./repo";
import type { PayDocument, PayDocRow } from "./types";

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Deterministic id so re-finalizing the same site + period overwrites. */
function payDocId(siteId: string, periodStart: string): string {
  return `${siteId}__timesheet_pay__${periodStart}`;
}

/** Create or overwrite a finalized timesheet-pay document. */
export async function finalizePayDocument(input: {
  siteId: string;
  siteName: string;
  periodStart: string;
  periodLabel: string;
  rows: PayDocRow[];
  by: string;
}): Promise<string> {
  const rows: PayDocRow[] = input.rows.map((r) => ({
    name: String(r.name || "").trim() || "—",
    hours: round2(Number(r.hours) || 0),
    rate: round2(Number(r.rate) || 0),
    payment: String(r.payment || ""),
  }));
  const totalHours = round2(rows.reduce((s, r) => s + r.hours, 0));
  const totalPay = round2(rows.reduce((s, r) => s + r.hours * r.rate, 0));
  const id = payDocId(input.siteId, input.periodStart);
  const t = now();
  const ref = adminDb.collection(COL.documents).doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      type: "timesheet_pay",
      siteId: input.siteId,
      siteName: input.siteName,
      periodStart: input.periodStart,
      periodLabel: input.periodLabel,
      rows,
      totalHours,
      totalPay,
      finalizedBy: input.by,
      finalizedAt: t,
      createdAt: existing.exists ? (existing.data()?.createdAt ?? t) : t,
      updatedAt: t,
    },
    { merge: false }
  );
  return id;
}

export async function listDocuments(): Promise<PayDocument[]> {
  const snap = await adminDb.collection(COL.documents).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PayDocument, "id">) }));
  // Newest finalized first.
  return docs.sort((a, b) => (b.finalizedAt ?? 0) - (a.finalizedAt ?? 0));
}

export async function deleteDocument(id: string): Promise<void> {
  await adminDb.collection(COL.documents).doc(id).delete();
}
