// Runs the engine on exported tables and prints statistics only (no amounts, no labels).
// Usage: node --experimental-strip-types tests/diagnose/engine-stats.ts <dir with *.json>
import { readFileSync } from "node:fs";
import { reconcile, labelKind } from "../../src/lib/reconciliation.ts";

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
