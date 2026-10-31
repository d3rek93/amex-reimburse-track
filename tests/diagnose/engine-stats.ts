// Runs the engine on exported tables and prints statistics only (no amounts, no labels).
// Usage: node --experimental-strip-types tests/diagnose/engine-stats.ts <dir with *.json>
import { readFileSync } from "node:fs";
import { reconcile, labelKind, allocateTransfers } from "../../src/lib/reconciliation.ts";

const dir = process.argv[2];
const load = (t: string) => JSON.parse(readFileSync(`${dir}/${t}.json`, "utf8")) as Record<string, unknown>[];
const expenses = load("expenses");
const claims = load("claim_lines");
const links = load("reconciliation_links");
const rejections = load("reconciliation_rejections");
const transfers = load("jetfly_transfers");

const r = reconcile({
  lines: expenses.map((e) => ({
    id: String(e.id), date: String(e.date), amount: Number(e.amount_eur), label: String(e.description),
    source: String(e.source ?? "AMEX"), personal: Boolean(e.is_personal),
  })),
  claimLines: claims.map((l) => ({
    noteId: String(l.note_id), date: String(l.line_date), category: String(l.category), subcategory: String(l.subcategory),
    amount: Number(l.amount_eur), batchRef: String(l.batch_ref), paymentDate: String(l.payment_date),
  })),
  transfers: transfers.map((t) => ({ id: String(t.id), date: String(t.date), amount: Number(t.amount_eur) })),
  confirmed: links.map((l) => ({ noteIds: l.note_ids as string[], lineIds: l.expense_ids as string[] })),
  rejected: rejections.map((x) => ({ noteId: String(x.note_id), lineId: String(x.expense_id) })),
});

const claimById = new Map(r.claims.map((c) => [c.noteId, c]));
const lineById = new Map(expenses.map((e) => [String(e.id), e]));
const out = (k: string, v: unknown) => console.log(`::notice::${k}: ${JSON.stringify(v)}`);
const count = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});

out("notes open / cancelled", [r.claims.filter((c) => !c.cancelled).length, r.claims.filter((c) => c.cancelled).length]);
out("matches by type", count(r.matches, (m) => `${m.type}${m.auto ? "/auto" : ""}`));
out("suggestions by type", count(r.suggestions, (m) => m.type));
const days = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86400000);
const dm = r.suggestions.filter((s) => s.type === "date_mismatch").map((s) => {
  const c = claimById.get(s.noteIds[0])!;
  const l = lineById.get(s.lineIds[0])!;
  return { kind: c.kind, lineKind: labelKind(String(l.description)), gapDays: days(c.date, String(l.date)), sameDay: c.date.slice(8) === String(l.date).slice(8) };
});
out("date mismatches (kind, line kind, gap, same day of month)", dm);
const rejectedNotes = new Set(rejections.map((x) => String(x.note_id)));
out("date mismatches on a note already rejected once", r.suggestions.filter((s) => s.type === "date_mismatch" && rejectedNotes.has(s.noteIds[0])).length);
out("rejected pairs: kinds of note", [...rejectedNotes].map((n) => claimById.get(n)?.kind ?? "unknown"));
out("unmatched notes / lines", [r.unmatchedNoteIds.length, r.unmatchedLineIds.length]);
out("unmatched notes by kind", count(r.unmatchedNoteIds, (n) => claimById.get(n)?.kind ?? "?"));
out("batches with / without transfer", [r.batches.filter((b) => b.transferId).length, r.batches.filter((b) => !b.transferId).length]);

// Payments without transfer, inside the Boursobank history: how far is the nearest same-amount transfer?
const boursoDates = [
  ...expenses.filter((e) => e.source === "Boursobank" || e.source === "Prélèvement").map((e) => String(e.date)),
  ...transfers.map((t) => String(t.date)),
].sort();
const boursoStart = boursoDates[0] ?? "9999";
const lost = r.batches.filter((b) => !b.transferId && b.total > 0 && b.paymentDate >= boursoStart);
out("Boursobank history starts", boursoStart.slice(0, 7));
out("payments without transfer inside history", lost.length);
out(
  "their nearest same-amount transfer (days after payment; null = none)",
  lost.map((b) => {
    const gaps = transfers
      .filter((t) => Math.abs(Number(t.amount_eur) - b.total) < 0.005)
      .map((t) => Math.round((Date.parse(String(t.date)) - Date.parse(b.paymentDate)) / 86400000));
    return gaps.length ? gaps.sort((x, y) => Math.abs(x) - Math.abs(y))[0] : null;
  }),
);
out("transfers without payment", r.unmatchedTransferIds.length);

const bankLines = expenses.map((e) => ({
  id: String(e.id), date: String(e.date), amount: Number(e.amount_eur), label: String(e.description),
  source: String(e.source ?? "AMEX"), personal: Boolean(e.is_personal),
}));
const tr = transfers.map((t) => ({ id: String(t.id), date: String(t.date), amount: Number(t.amount_eur) }));
const alloc = allocateTransfers(r, bankLines, tr);
const lastStatement = r.batches.map((b) => b.paymentDate).sort().pop() ?? "";
const via = [...alloc.byLine.values()].reduce<Record<string, number>>((a, x) => ((a[x.via] = (a[x.via] ?? 0) + 1), a), {});
const unalloc = alloc.unallocated.map((id) => tr.find((t) => t.id === id)!);
console.log(`::warning::ALLOC lines reimbursed by way: ${JSON.stringify(via)}; bank transfers explained: ${alloc.bankAllocated.length}; unallocated: ${unalloc.length} (inside last statement ${lastStatement.slice(0, 7)}: ${unalloc.filter((t) => t.date <= lastStatement).length}, after: ${unalloc.filter((t) => t.date > lastStatement).length}); unallocated by month: ${JSON.stringify(unalloc.reduce<Record<string, number>>((a, t) => ((a[t.date.slice(0, 7)] = (a[t.date.slice(0, 7)] ?? 0) + 1), a), {}))}`);

// Payments read from the Jetfly app: which transfer, and how each note paired.
const trById = new Map(transfers.map((t) => [String(t.id), t]));
for (const b of r.batches.filter((x) => x.ref.startsWith("APP-"))) {
  const notes = [...new Set(claims.filter((l) => l.batch_ref === b.ref).map((l) => String(l.note_id)))].map((n) => {
    const c = claimById.get(n)!;
    const m = r.matches.find((x) => x.noteIds.includes(n));
    const s = r.suggestions.filter((x) => x.noteIds.includes(n));
    return {
      n, date: c.date, amount: c.amount,
      match: m ? `${m.type}/${m.auto ? "auto" : "user"} -> ${m.lineIds.map((id) => `${lineById.get(id)?.date} ${lineById.get(id)?.amount_eur}`).join("+")}` : null,
      suggestions: s.map((x) => `${x.type} -> ${x.lineIds.map((id) => `${lineById.get(id)?.date} ${lineById.get(id)?.amount_eur}`).join("+")}`),
    };
  });
  const t = b.transferId ? trById.get(b.transferId) : null;
  console.log(`::warning::${b.ref} total ${b.total} transfer ${t ? `${t.date} ${t.amount_eur}` : "none"} notes ${JSON.stringify(notes)}`);
}
