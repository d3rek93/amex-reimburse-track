// Advance position terms on production data: aggregates only (sums, counts, months).
import { readFileSync } from "node:fs";
import { reconcile, allocateTransfers } from "../../src/lib/reconciliation.ts";
import { computeAdvancePosition } from "../../src/lib/advance.ts";

const dir = process.argv[2];
const load = (t: string) => JSON.parse(readFileSync(`${dir}/${t}.json`, "utf8") || "[]") as Record<string, any>[];
const expenses = load("expenses");
const claims = load("claim_lines");
const links = load("reconciliation_links");
const rejections = load("reconciliation_rejections");
const transfers = load("jetfly_transfers").filter((t) => !t.ignored);
const snaps = load("account_snapshots").sort((a, b) => String(b.snapshot_date).localeCompare(String(a.snapshot_date)));
const out = (k: string, v: unknown) => console.log(`::warning::${k}: ${JSON.stringify(v)}`);

const voidIds = new Set<string>();
for (const e of expenses) {
  const m = String(e.bank_transaction_id ?? "").match(/^manual:refund:([0-9a-f-]{36})/);
  if (m) { voidIds.add(m[1]); voidIds.add(String(e.id)); }
}
const lines = expenses.map((e) => ({ id: String(e.id), date: String(e.date), amount: Number(e.amount_eur), label: String(e.description), source: String(e.source ?? "AMEX"), personal: Boolean(e.is_personal) || voidIds.has(String(e.id)) }));
const r = reconcile({
  lines,
  claimLines: claims.map((l) => ({ noteId: String(l.note_id), date: String(l.line_date), category: String(l.category), subcategory: String(l.subcategory), amount: Number(l.amount_eur), batchRef: String(l.batch_ref), paymentDate: String(l.payment_date) })),
  transfers: transfers.map((t) => ({ id: String(t.id), date: String(t.date), amount: Number(t.amount_eur) })),
  confirmed: links.map((l) => ({ noteIds: l.note_ids, lineIds: l.expense_ids })),
  rejected: rejections.map((x) => ({ noteId: String(x.note_id), lineId: String(x.expense_id) })),
});
const alloc = allocateTransfers(r, lines, transfers.map((t) => ({ id: String(t.id), date: String(t.date), amount: Number(t.amount_eur) })));
const matched = new Set(r.matches.flatMap((m) => m.lineIds));
const neutral = new Set([...r.neutralized.flat(), ...voidIds]);
const paidBack = (id: string) => matched.has(id) || neutral.has(id) || alloc.byLine.has(id);

const snap = snaps[0] ?? null;
out("snapshots (latest 3)", snaps.slice(0, 3).map((s) => ({ date: s.snapshot_date, balance: s.balance_eur, card: s.pending_card_eur, amexDebit: s.amex_last_debit_date, source: s.source })));
const pos = computeAdvancePosition(
  snap && { snapshot_date: snap.snapshot_date, balance_eur: Number(snap.balance_eur), pending_card_eur: Number(snap.pending_card_eur), amex_last_debit_date: snap.amex_last_debit_date },
  expenses.map((e) => ({ id: String(e.id), date: String(e.date), description: String(e.description), amount_eur: Number(e.amount_eur), reimbursed_amount: paidBack(String(e.id)) ? Number(e.amount_eur) : 0, reimbursement_status: paidBack(String(e.id)) ? "complete" : "pending", is_personal: Boolean(e.is_personal), considered_complete: false, source: e.source })),
);
const round = (n: number) => Math.round(n * 100) / 100;
out("terms", { bankBalance: round(pos.bankBalance), owedByJetfly: round(pos.owedByJetfly), owedCount: pos.owedExpenses.length, amexUnpaid: round(pos.amexUnpaid), amexUnpaidSince: pos.amexUnpaidSince, cardUnpaid: round(pos.cardUnpaid), position: round(pos.position), toTopUp: round(pos.toTopUp) });
const byMonth = pos.owedExpenses.reduce<Record<string, { n: number; sum: number }>>((a, e) => { const k = e.date.slice(0, 7); a[k] ??= { n: 0, sum: 0 }; a[k].n++; a[k].sum = round(a[k].sum + e.amount_eur); return a; }, {});
out("owed by month", byMonth);
const bySource = pos.owedExpenses.reduce<Record<string, number>>((a, e) => ((a[e.source ?? "?"] = round((a[e.source ?? "?"] ?? 0) + e.amount_eur)), a), {});
out("owed by source", bySource);
const lastAmexDebitInData = expenses.filter((e) => /AMERICAN EXPRESS/i.test(String(e.description))).map((e) => e.date).sort().pop();
out("AMEX lines after since-date by month", expenses.filter((e) => (e.source ?? "AMEX") === "AMEX" && pos.amexUnpaidSince && e.date >= pos.amexUnpaidSince).reduce<Record<string, number>>((a, e) => ((a[String(e.date).slice(0, 7)] = round((a[String(e.date).slice(0, 7)] ?? 0) + Number(e.amount_eur))), a), {}));
out("latest expense date per source", Object.fromEntries(["AMEX", "Boursobank", "Prélèvement"].map((s) => [s, expenses.filter((e) => e.source === s).map((e) => e.date).sort().pop()])));
void lastAmexDebitInData;
