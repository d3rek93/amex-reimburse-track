/**
 * Data layer: loads everything, runs the reconciliation engine, and derives
 * the status of every expense and note. Statuses are never stored; they are
 * recomputed from the bank lines, the Jetfly statements and the user's
 * decisions (links, rejections, personal flags).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  allocateTransfers,
  learnRules,
  buildClaims,
  merchantKey,
  reconcile,
  type BankLine,
  type Claim,
  type ClaimLine,
  type Match,
  type ReconcileResult,
  type Reimbursement,
} from "./reconciliation";
import { computeAdvancePosition, type AccountSnapshot, type AdvancePosition } from "./advance";
import type { ParsedBatch, ParsedClaimLine, ParsedExpense, ParsedSnapshot, ParsedTransfer } from "./importers";

// ------------------------------------------------------------------ types

export interface ExpenseRow {
  id: string;
  date: string;
  description: string;
  amount_eur: number;
  original_amount: number | null;
  original_currency: string | null;
  source: string | null;
  is_personal: boolean;
  bank_transaction_id: string | null;
}

export interface LinkRow {
  id: string;
  note_ids: string[];
  expense_ids: string[];
  difference: number;
  comment: string | null;
}

export interface TransferRow {
  id: string;
  date: string;
  amount_eur: number;
  label: string;
  ignored: boolean;
}

export interface BatchView {
  ref: string;
  paymentDate: string;
  declaredTotal: number | null;
  linesTotal: number;
  transfer: TransferRow | null;
  noteIds: string[];
  /** Paid before the oldest Boursobank line on file: its transfer cannot be checked. */
  beforeHistory: boolean;
}

/**
 * Two questions per pro expense: has the money come back (bank), and has the
 * Jetfly expense department validated it (statement)?
 * - validated: paid back and matched to its note, same amount
 * - discrepancy: paid back through a note whose amount differs (accepted)
 * - reimbursed: a transfer paid it back; the statement that covers it is not in yet
 * - no_note: paid back by a transfer, yet absent from a statement already in: anomaly
 * - to_review / pending: not paid back yet (pending), with proposals (to_review)
 */
export type ExpenseStatus =
  /** Paid back through its note, but the user refused the gap and claims it. */
  | "disputed"
  | "personal"
  /** A credit that belongs to the user (AMEX offer, welcome credit…), not to Jetfly. */
  | "gain"
  | "validated"
  | "discrepancy"
  | "reimbursed"
  | "no_note"
  | "to_review"
  | "pending"
  | "neutralized"
  | "refund";

export type TransferStatus = "statement" | "bank" | "to_split" | "absent" | "before_statements" | "ignored";

export interface TransferView extends TransferRow {
  status: TransferStatus;
  lineIds: string[];
}

export type NoteStatus = "matched" | "discrepancy" | "disputed" | "to_review" | "missing" | "cancelled" | "before_history";

/** A match as shown in the UI: confirmed ones carry the link id they come from. */
export interface DisputeRow {
  id: string;
  note_ids: string[];
  expense_ids: string[];
  difference: number;
  reason: string | null;
  status: "open" | "closed";
  outcome: "settled" | "accepted" | null;
  sent_at: string | null;
  closed_at: string | null;
  created_at: string;
}

/** An open claim, with what is known today. */
export interface DisputeView extends DisputeRow {
  notes: Claim[];
  expenses: ExpenseRow[];
  /** Bank total minus what Jetfly has paid today (corrections included). */
  currentDifference: number;
  /** Jetfly paid the difference since (a correction on the same note number). */
  settled: boolean;
}

export interface MatchView extends Match {
  linkId?: string;
  disputeId?: string;
  /** The user's note on the link, e.g. "Payée en espèces". */
  comment?: string | null;
}

export interface Ledger {
  expenses: ExpenseRow[];
  expenseById: Map<string, ExpenseRow>;
  claims: Claim[];
  claimById: Map<string, Claim>;
  batches: BatchView[];
  transfers: TransferRow[];
  result: ReconcileResult;
  matches: MatchView[];
  expenseStatus: Map<string, ExpenseStatus>;
  noteStatus: Map<string, NoteStatus>;
  matchOfExpense: Map<string, MatchView>;
  matchOfNote: Map<string, MatchView>;
  /** Unclaimed expenses at merchants the user already marked as personal. */
  personalSuggestions: string[];
  /** Open claims, newest first. */
  disputes: DisputeView[];
  /** How each pro expense was paid back, when it was. */
  reimbursementOf: Map<string, Reimbursement>;
  transferViews: TransferView[];
  /** Last Jetfly payment date covered by an imported statement. */
  statementsEnd: string | null;
  /** Oldest bank line on file (notes before it cannot be checked). */
  historyStart: string | null;
  /** Notes older than the bank history, left out of the lists to handle. */
  beforeHistoryNoteIds: string[];
  advance: AdvancePosition;
  lastSyncedAt: string | null;
  counts: {
    /** Open claims and the amount claimed (settled ones excluded). */
    openDisputes: number;
    disputedAmount: number;
    /** AMEX credits with no purchase to cancel: offer or credit note, to classify. */
    looseCredits: number;
    /** Paid back by a transfer, yet absent from statements already in. */
    noNote: number;
    /** Transfers inside the statements' period that no statement explains. */
    absentTransfers: number;
    /** Transfers after the last statement, not yet split among expenses. */
    toSplit: number;
    toReview: number;
    discrepancies: number;
    missingNotes: number;
    unclaimedExpenses: number;
    personalSuggestions: number;
    batchesWithoutTransfer: number;
  };
}

// ----------------------------------------------------------------- loading

const PAGE = 1000;

/** Reads a whole table for the user, page by page (PostgREST caps responses). */
async function readAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table as never)
      .select(columns)
      .order(order, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

interface RawData {
  expenses: ExpenseRow[];
  claimLines: {
    note_id: string;
    line_date: string;
    category: string;
    subcategory: string;
    amount_eur: number;
    batch_ref: string;
    payment_date: string;
  }[];
  batches: { ref: string; payment_date: string; declared_total: number }[];
  transfers: TransferRow[];
  links: LinkRow[];
  rejections: { note_id: string; expense_id: string }[];
  disputes: DisputeRow[];
  snapshot: AccountSnapshot | null;
  lastSyncedAt: string | null;
}

async function loadRaw(): Promise<RawData> {
  const [expenses, claimLines, batches, transfers, links, rejections, disputes, snap, sessions] = await Promise.all([
    readAll<ExpenseRow>(
      "expenses",
      "id, date, description, amount_eur, original_amount, original_currency, source, is_personal, bank_transaction_id",
      "date",
    ),
    readAll<RawData["claimLines"][number]>(
      "claim_lines",
      "note_id, line_date, category, subcategory, amount_eur, batch_ref, payment_date",
      "payment_date",
    ),
    readAll<RawData["batches"][number]>("claim_batches", "ref, payment_date, declared_total", "payment_date"),
    readAll<TransferRow>("jetfly_transfers", "id, date, amount_eur, label, ignored", "date"),
    readAll<LinkRow>("reconciliation_links", "id, note_ids, expense_ids, difference, comment", "created_at"),
    readAll<RawData["rejections"][number]>("reconciliation_rejections", "note_id, expense_id", "created_at"),
    readAll<DisputeRow>(
      "disputes",
      "id, note_ids, expense_ids, difference, reason, status, outcome, sent_at, closed_at, created_at",
      "created_at",
    ),
    supabase
      .from("account_snapshots")
      .select("snapshot_date, balance_eur, pending_card_eur, amex_last_debit_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("bank_sessions").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1),
  ]);
  if (snap.error) throw new Error(snap.error.message);
  // Postgres numerics may arrive as strings.
  const n = (v: unknown) => Number(v);
  const nOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    expenses: expenses.map((e) => ({ ...e, amount_eur: n(e.amount_eur), original_amount: nOrNull(e.original_amount) })),
    claimLines: claimLines.map((l) => ({ ...l, amount_eur: n(l.amount_eur) })),
    batches: batches.map((b) => ({ ...b, declared_total: n(b.declared_total) })),
    transfers: transfers.map((t) => ({ ...t, amount_eur: n(t.amount_eur), ignored: Boolean(t.ignored) })),
    links: links.map((l) => ({ ...l, difference: n(l.difference) })),
    rejections,
    disputes: disputes.map((d) => ({ ...d, difference: n(d.difference) })),
    snapshot: (snap.data as AccountSnapshot | null) ?? null,
    lastSyncedAt: (sessions.data?.[0]?.last_synced_at as string | null) ?? null,
  };
}

// ---------------------------------------------------------------- deriving

export function buildLedger(raw: RawData): Ledger {
  const expenseById = new Map(raw.expenses.map((e) => [e.id, e]));
  // Refunds the merchant made outside the card (a bank transfer): recorded by hand
  // as "manual:refund:<expense id>"; the pair is void and kept out of the engine.
  const manualRefunds = new Map<string, string>();
  for (const e of raw.expenses) {
    const m = String(e.bank_transaction_id ?? "").match(/^manual:refund:([0-9a-f-]{36})/);
    if (m && expenseById.has(m[1])) manualRefunds.set(m[1], e.id);
  }
  const manuallyVoid = new Set([...manualRefunds.keys(), ...manualRefunds.values()]);
  const lines: BankLine[] = raw.expenses.map((e) => ({
    id: e.id,
    date: e.date,
    amount: e.amount_eur,
    label: e.description,
    source: e.source ?? "AMEX",
    personal: e.is_personal || manuallyVoid.has(e.id),
  }));
  const claimLines: ClaimLine[] = raw.claimLines.map((l) => ({
    noteId: l.note_id,
    date: l.line_date,
    category: l.category,
    subcategory: l.subcategory,
    amount: l.amount_eur,
    batchRef: l.batch_ref,
    paymentDate: l.payment_date,
  }));
  // Open claims keep their pairing, like a validated association.
  const openDisputes = raw.disputes.filter((d) => d.status === "open");
  const confirmed = [
    ...raw.links.map((l) => ({ noteIds: l.note_ids, lineIds: l.expense_ids, ref: l.id })),
    ...openDisputes.map((d) => ({ noteIds: d.note_ids, lineIds: d.expense_ids, ref: `dispute:${d.id}` })),
  ];
  const rules = learnRules(confirmed, lines, buildClaims(claimLines));

  const result = reconcile({
    lines,
    claimLines,
    transfers: raw.transfers.filter((t) => !t.ignored).map((t) => ({ id: t.id, date: t.date, amount: t.amount_eur })),
    confirmed,
    rejected: raw.rejections.map((r) => ({ noteId: r.note_id, lineId: r.expense_id })),
    rules,
  });

  const linkById = new Map(raw.links.map((l) => [l.id, l]));
  const matches: MatchView[] = result.matches.map((m) => {
    if (m.ref?.startsWith("dispute:")) return { ...m, disputeId: m.ref.slice(8) };
    const link = m.ref ? linkById.get(m.ref) : undefined;
    return link ? { ...m, linkId: link.id, difference: link.difference, comment: link.comment } : m;
  });

  const claimById = new Map(result.claims.map((c) => [c.noteId, c]));
  const matchOfExpense = new Map<string, MatchView>();
  const matchOfNote = new Map<string, MatchView>();
  for (const m of matches) {
    m.lineIds.forEach((id) => matchOfExpense.set(id, m));
    m.noteIds.forEach((n) => matchOfNote.set(n, m));
  }
  const inSuggestion = new Set(result.suggestions.flatMap((s) => [...s.noteIds, ...s.lineIds]));
  const neutralized = new Set([...result.neutralized.flat(), ...manuallyVoid]);

  // Money received: which transfer paid back which expense.
  const activeTransfers = raw.transfers.filter((t) => !t.ignored);
  const allocation = allocateTransfers(
    result,
    lines,
    activeTransfers.map((t) => ({ id: t.id, date: t.date, amount: t.amount_eur })),
  );
  const batchDates = result.batches.map((b) => b.paymentDate).sort();
  const statementsStart = batchDates[0] ?? null;
  const statementsEnd = batchDates[batchDates.length - 1] ?? null;
  const transferLines = new Map<string, string[]>();
  for (const [lineId, r] of allocation.byLine) {
    if (r.transferId) transferLines.set(r.transferId, [...(transferLines.get(r.transferId) ?? []), lineId]);
  }
  const usedByBatch = new Set(result.batches.map((b) => b.transferId).filter(Boolean) as string[]);
  const unallocated = new Set(allocation.unallocated);
  const transferViews: TransferView[] = raw.transfers
    .map((t) => {
      let status: TransferStatus;
      if (t.ignored) status = "ignored";
      else if (usedByBatch.has(t.id)) status = "statement";
      else if (statementsStart && t.date < statementsStart) status = "before_statements";
      else if (statementsEnd && t.date <= statementsEnd) status = "absent";
      else if (unallocated.has(t.id)) status = "to_split";
      else status = "bank";
      return { ...t, status, lineIds: transferLines.get(t.id) ?? [] };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const absentTransfers = new Set(transferViews.filter((t) => t.status === "absent").map((t) => t.id));

  const expenseStatus = new Map<string, ExpenseStatus>();
  for (const e of raw.expenses) {
    const m = matchOfExpense.get(e.id);
    const paid = allocation.byLine.get(e.id);
    let status: ExpenseStatus;
    if (manuallyVoid.has(e.id)) status = "neutralized";
    else if (e.is_personal) status = e.amount_eur < 0 ? "gain" : "personal";
    else if (m?.disputeId) status = Math.abs(m.difference) >= 0.005 ? "disputed" : "validated";
    else if (m) status = Math.abs(m.difference) >= 0.005 ? "discrepancy" : "validated";
    else if (neutralized.has(e.id)) status = "neutralized";
    else if (paid && paid.transferId && absentTransfers.has(paid.transferId)) status = "no_note";
    else if (paid) status = "reimbursed";
    else if (inSuggestion.has(e.id)) status = "to_review";
    else if (e.amount_eur < 0) status = "refund";
    else status = "pending";
    expenseStatus.set(e.id, status);
  }

  // How far back the bank data goes; a few days of slack for booking delays.
  const minDate = (dates: string[]) => (dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null);
  const shiftDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const bankDates = raw.expenses.filter((e) => !String(e.bank_transaction_id ?? "").startsWith("manual:")).map((e) => e.date);
  const historyStart = minDate(bankDates);
  const boursoStart = minDate([
    ...raw.expenses.filter((e) => e.source === "Boursobank" || e.source === "Prélèvement").map((e) => e.date),
    ...raw.transfers.map((t) => t.date),
  ]);
  const notesFrom = historyStart ? shiftDays(historyStart, 3) : null;

  const noteStatus = new Map<string, NoteStatus>();
  for (const c of result.claims) {
    const m = matchOfNote.get(c.noteId);
    let status: NoteStatus;
    if (c.cancelled) status = "cancelled";
    else if (m?.disputeId) status = Math.abs(m.difference) >= 0.005 ? "disputed" : "matched";
    else if (m) status = Math.abs(m.difference) >= 0.005 ? "discrepancy" : "matched";
    else if (inSuggestion.has(c.noteId)) status = "to_review";
    else if (!notesFrom || c.date < notesFrom) status = "before_history";
    else status = "missing";
    noteStatus.set(c.noteId, status);
  }
  const beforeHistoryNoteIds = result.claims.filter((c) => noteStatus.get(c.noteId) === "before_history").map((c) => c.noteId);
  const missingNoteIds = result.unmatchedNoteIds.filter((n) => noteStatus.get(n) === "missing");

  // Merchants the user marked as personal before.
  const personalMerchants = new Set(raw.expenses.filter((e) => e.is_personal).map((e) => merchantKey(e.description)));
  const personalSuggestions = result.unmatchedLineIds.filter((id) => {
    const e = expenseById.get(id);
    return e && e.amount_eur > 0 && personalMerchants.has(merchantKey(e.description));
  });

  const transferById = new Map(raw.transfers.map((t) => [t.id, t]));
  const declared = new Map(raw.batches.map((b) => [b.ref, b]));
  const batches: BatchView[] = result.batches
    .map((b) => ({
      ref: b.ref,
      paymentDate: b.paymentDate,
      declaredTotal: declared.get(b.ref)?.declared_total ?? null,
      linesTotal: b.total,
      transfer: b.transferId ? transferById.get(b.transferId) ?? null : null,
      noteIds: [...new Set(claimLines.filter((l) => l.batchRef === b.ref).map((l) => l.noteId))],
      beforeHistory: !b.transferId && (!boursoStart || b.paymentDate < boursoStart),
    }))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  // Expenses whose note Jetfly already paid, only the pairing is still to confirm
  // (amount or date gap): not owed any more, whatever the user decides.
  const notePaid = new Set(
    result.suggestions.filter((x) => x.type === "mismatch" || x.type === "date_mismatch").flatMap((x) => x.lineIds),
  );
  // Advance: what Jetfly still owes = pro expenses not paid back yet.
  const advance = computeAdvancePosition(
    raw.snapshot,
    raw.expenses.map((e) => {
      const status = expenseStatus.get(e.id)!;
      const reimbursed =
        ["validated", "discrepancy", "disputed", "reimbursed", "no_note", "neutralized"].includes(status) || notePaid.has(e.id);
      return {
        id: e.id,
        date: e.date,
        description: e.description,
        amount_eur: e.amount_eur,
        reimbursed_amount: reimbursed ? e.amount_eur : 0,
        reimbursement_status: reimbursed ? "complete" : "pending",
        is_personal: e.is_personal,
        considered_complete: false,
        source: e.source,
      };
    }),
    undefined,
    // Transfers received but not yet tied to expenses ("à répartir").
    transferViews.filter((t) => t.status === "to_split").reduce((sum, t) => sum + t.amount_eur, 0),
  );

  const disputes: DisputeView[] = openDisputes
    .map((d) => {
      const m = matches.find((x) => x.disputeId === d.id);
      const notes = d.note_ids.map((n) => claimById.get(n)).filter(Boolean) as Claim[];
      const exps = d.expense_ids.map((id) => expenseById.get(id)).filter(Boolean) as ExpenseRow[];
      const current = m
        ? m.difference
        : Math.round((exps.reduce((s, e) => s + e.amount_eur, 0) - notes.reduce((s, c) => s + c.amount, 0)) * 100) / 100;
      return { ...d, notes, expenses: exps, currentDifference: current, settled: Math.abs(current) < 0.005 };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const isDiscrepancy = (s: Match) => s.type === "mismatch" || s.type === "date_mismatch";
  const reviewGroups = new Set(result.suggestions.map((s) => s.noteIds.join(",")));
  return {
    expenses: raw.expenses,
    expenseById,
    claims: result.claims,
    claimById,
    batches,
    transfers: raw.transfers,
    result,
    matches,
    expenseStatus,
    noteStatus,
    matchOfExpense,
    matchOfNote,
    personalSuggestions,
    disputes,
    reimbursementOf: allocation.byLine,
    transferViews,
    statementsEnd,
    historyStart,
    beforeHistoryNoteIds,
    advance,
    lastSyncedAt: raw.lastSyncedAt,
    counts: {
      openDisputes: disputes.filter((d) => !d.settled).length,
      disputedAmount: disputes.filter((d) => !d.settled).reduce((s, d) => s + d.currentDifference, 0),
      looseCredits: [...expenseStatus.values()].filter((s) => s === "refund").length,
      noNote: [...expenseStatus.values()].filter((s) => s === "no_note").length,
      absentTransfers: absentTransfers.size,
      toSplit: transferViews.filter((t) => t.status === "to_split").length,
      toReview:
        reviewGroups.size +
        personalSuggestions.length +
        [...expenseStatus.values()].filter((s) => s === "no_note" || s === "refund").length +
        transferViews.filter((t) => t.status === "absent" && t.lineIds.length === 0).length,
      discrepancies: result.suggestions.filter(isDiscrepancy).length,
      missingNotes: missingNoteIds.length,
      unclaimedExpenses: result.unmatchedLineIds.filter(
        (id) => (expenseById.get(id)?.amount_eur ?? 0) > 0 && expenseStatus.get(id) === "pending",
      ).length,
      personalSuggestions: personalSuggestions.length,
      batchesWithoutTransfer: batches.filter((b) => !b.transfer && !b.beforeHistory && b.linesTotal > 0).length,
    },
  };
}

// ------------------------------------------------------------------- hooks

export const LEDGER_KEY = ["ledger"];

export function useLedger() {
  const query = useQuery({ queryKey: LEDGER_KEY, queryFn: loadRaw, staleTime: 30_000 });
  const ledger = useMemo(() => (query.data ? buildLedger(query.data) : null), [query.data]);
  return { ...query, ledger };
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Vous devez être connecté");
  return id;
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** Actions on the ledger; each one refreshes the data when done. */
export function useLedgerActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: LEDGER_KEY });
  const run =
    <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
    async (...args: A) => {
      await fn(...args);
      await refresh();
    };

  return {
    refresh,
    /** Keep a match (automatic or suggested) as the user's decision. */
    confirm: run(async (m: Match, comment?: string) => {
      const { error } = await supabase.from("reconciliation_links").insert({
        user_id: await userId(),
        note_ids: m.noteIds,
        expense_ids: m.lineIds,
        difference: m.difference,
        comment: comment ?? null,
      });
      fail(error);
    }),
    /** Several suggestions at once (e.g. "validate all"). */
    confirmAll: run(async (list: Match[]) => {
      if (list.length === 0) return;
      const uid = await userId();
      const { error } = await supabase.from("reconciliation_links").insert(
        list.map((m) => ({ user_id: uid, note_ids: m.noteIds, expense_ids: m.lineIds, difference: m.difference })),
      );
      fail(error);
    }),
    /** "These do not belong together": never proposed again. */
    reject: run(async (m: Match) => {
      const uid = await userId();
      const rows = m.noteIds.flatMap((n) => m.lineIds.map((id) => ({ user_id: uid, note_id: n, expense_id: id })));
      const { error } = await supabase
        .from("reconciliation_rejections")
        .upsert(rows, { onConflict: "user_id,note_id,expense_id", ignoreDuplicates: true });
      fail(error);
    }),
    /** Undo a match: delete the link, or reject an automatic one. */
    unlink: run(async (m: MatchView) => {
      if (m.linkId) {
        const { error } = await supabase.from("reconciliation_links").delete().eq("id", m.linkId);
        fail(error);
        // An expense created by "paid another way" has no meaning without its note.
        const { error: cleanup } = await supabase
          .from("expenses")
          .delete()
          .in("id", m.lineIds)
          .like("bank_transaction_id", "manual:other:%");
        fail(cleanup);
        return;
      }
      const uid = await userId();
      const rows = m.noteIds.flatMap((n) => m.lineIds.map((id) => ({ user_id: uid, note_id: n, expense_id: id })));
      const { error } = await supabase
        .from("reconciliation_rejections")
        .upsert(rows, { onConflict: "user_id,note_id,expense_id", ignoreDuplicates: true });
      fail(error);
    }),
    /**
     * Add expenses (a credit note, a forgotten part) to an existing association.
     * An automatic match becomes a validated one in the process.
     */
    extend: run(async (m: MatchView, addIds: string[], difference: number) => {
      const expenseIds = [...new Set([...m.lineIds, ...addIds])];
      const diff = Math.round(difference * 100) / 100;
      if (m.linkId) {
        const { error } = await supabase
          .from("reconciliation_links")
          .update({ expense_ids: expenseIds, difference: diff })
          .eq("id", m.linkId);
        fail(error);
        return;
      }
      const { error } = await supabase.from("reconciliation_links").insert({
        user_id: await userId(),
        note_ids: m.noteIds,
        expense_ids: expenseIds,
        difference: diff,
      });
      fail(error);
    }),
    /** Manual association from the "unmatched" lists. */
    associate: run(async (noteIds: string[], expenseIds: string[], difference: number, comment?: string) => {
      const { error } = await supabase.from("reconciliation_links").insert({
        user_id: await userId(),
        note_ids: noteIds,
        expense_ids: expenseIds,
        difference: Math.round(difference * 100) / 100,
        comment: comment ?? null,
      });
      fail(error);
    }),
    /**
     * The merchant paid the money back outside the card (bank transfer): records
     * the refund so the expense is neither declared nor owed by Jetfly.
     */
    refundedByMerchant: run(async (expenses: ExpenseRow[], date: string) => {
      if (expenses.length === 0) return;
      const uid = await userId();
      const { error } = await supabase.from("expenses").insert(
        expenses.map((e) => ({
          user_id: uid,
          date,
          description: `Remboursement - ${e.description} (virement du commerçant)`,
          amount_eur: -e.amount_eur,
          source: "Manuel",
          bank_transaction_id: `manual:refund:${e.id}:${crypto.randomUUID()}`,
        })),
      );
      fail(error);
    }),
    setPersonal: run(async (expenseIds: string[], personal: boolean) => {
      if (expenseIds.length === 0) return;
      const { error } = await supabase.from("expenses").update({ is_personal: personal }).in("id", expenseIds);
      fail(error);
    }),
    addExpense: run(async (row: { date: string; description: string; amount_eur: number }) => {
      const { error } = await supabase.from("expenses").insert({
        ...row,
        user_id: await userId(),
        source: "Manuel",
        bank_transaction_id: `manual:${crypto.randomUUID()}`,
      });
      fail(error);
    }),
    /**
     * Notes paid with another card or in cash: each gets a manual expense of the
     * same amount, linked to it. Not taken from the pro account, so the advance
     * is unaffected.
     */
    payOtherwise: run(async (notes: Claim[], method: "card" | "cash", comment?: string) => {
      if (notes.length === 0) return;
      const uid = await userId();
      const label = method === "cash" ? "Payée en espèces" : "Payée avec une autre carte";
      const { data, error } = await supabase
        .from("expenses")
        .insert(
          notes.map((n) => ({
            user_id: uid,
            date: n.date,
            description: `${label}${comment ? ` – ${comment}` : ""}`,
            amount_eur: n.amount,
            source: "Manuel",
            bank_transaction_id: `manual:other:${method}:${n.noteId}:${crypto.randomUUID()}`,
          })),
        )
        .select("id, bank_transaction_id");
      fail(error);
      const byNote = new Map((data ?? []).map((e) => [String(e.bank_transaction_id).split(":")[3], e.id]));
      const { error: linkError } = await supabase.from("reconciliation_links").insert(
        notes.map((n) => ({
          user_id: uid,
          note_ids: [n.noteId],
          expense_ids: [byNote.get(n.noteId)!],
          difference: 0,
          comment: label,
        })),
      );
      fail(linkError);
    }),
    /** Refuse a gap: open a claim on this pairing. */
    dispute: run(async (m: Match, reason?: string) => {
      const { error } = await supabase.from("disputes").insert({
        user_id: await userId(),
        note_ids: m.noteIds,
        expense_ids: m.lineIds,
        difference: Math.round(m.difference * 100) / 100,
        reason: reason ?? null,
      });
      fail(error);
      // A gap accepted earlier on the same pairing gives way to the claim.
      const link = (m as MatchView).linkId;
      if (link) {
        const { error: unlinkError } = await supabase.from("reconciliation_links").delete().eq("id", link);
        fail(unlinkError);
      }
    }),
    markDisputesSent: run(async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("disputes").update({ sent_at: new Date().toISOString() }).in("id", ids);
      fail(error);
    }),
    /**
     * Close a claim. "settled": Jetfly paid; "accepted": the user gives up and
     * accepts the gap. Either way the pairing stays as a validated association.
     */
    closeDispute: run(async (d: DisputeView, outcome: "settled" | "accepted") => {
      const { error: linkError } = await supabase.from("reconciliation_links").insert({
        user_id: await userId(),
        note_ids: d.note_ids,
        expense_ids: d.expense_ids,
        difference: Math.round(d.currentDifference * 100) / 100,
        comment: outcome === "settled" ? "Réclamation régularisée par Jetfly" : "Réclamation abandonnée, écart accepté",
      });
      fail(linkError);
      const { error } = await supabase
        .from("disputes")
        .update({ status: "closed", outcome, closed_at: new Date().toISOString() })
        .eq("id", d.id);
      fail(error);
    }),
    /** Withdraw a claim opened by mistake: the gap is back to review. */
    deleteDispute: run(async (id: string) => {
      const { error } = await supabase.from("disputes").delete().eq("id", id);
      fail(error);
    }),
    /** A transfer that is not an expense reimbursement (advance top-up…). */
    ignoreTransfer: run(async (id: string, ignored: boolean) => {
      const { error } = await supabase.from("jetfly_transfers").update({ ignored }).eq("id", id);
      fail(error);
    }),
    deleteExpense: run(async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      fail(error);
    }),
  };
}

// ------------------------------------------------------------------ saving

export interface SaveSummary {
  added: number;
  skipped: number;
}

export async function saveClaimStatement(lines: ParsedClaimLine[], batches: ParsedBatch[]): Promise<SaveSummary> {
  const uid = await userId();
  if (batches.length > 0) {
    const { error } = await supabase.from("claim_batches").upsert(
      batches.map((b) => ({ user_id: uid, ref: b.ref, payment_date: b.paymentDate, declared_total: b.declaredTotal })),
      { onConflict: "user_id,ref" },
    );
    fail(error);
  }
  if (lines.length === 0) return { added: 0, skipped: 0 };
  // Lines already known (same note, batch and amount) are updated, not duplicated:
  // a re-import fills in details an older import did not have (sub-category).
  const { data: known, error: knownError } = await supabase
    .from("claim_lines")
    .select("note_id, batch_ref, amount_eur")
    .in("note_id", [...new Set(lines.map((l) => l.noteId))]);
  fail(knownError);
  const key = (n: string, b: string, a: number) => `${n}|${b}|${Number(a).toFixed(2)}`;
  const existing = new Set((known ?? []).map((k) => key(k.note_id, k.batch_ref, k.amount_eur)));
  const { error } = await supabase.from("claim_lines").upsert(
    lines.map((l) => ({
      user_id: uid,
      note_id: l.noteId,
      line_date: l.date,
      category: l.category,
      subcategory: l.subcategory,
      amount_eur: l.amount,
      batch_ref: l.batchRef,
      payment_date: l.paymentDate,
    })),
    { onConflict: "user_id,note_id,batch_ref,amount_eur" },
  );
  fail(error);
  const added = lines.filter((l) => !existing.has(key(l.noteId, l.batchRef, l.amount))).length;
  return { added, skipped: lines.length - added };
}

/**
 * Saves bank lines read from a file. Skips lines already imported from a
 * file (same key) and lines Enable Banking already brought in (same amount,
 * same merchant, a few days apart).
 */
export async function saveFileExpenses(rows: ParsedExpense[]): Promise<SaveSummary> {
  if (rows.length === 0) return { added: 0, skipped: 0 };
  const uid = await userId();
  const dates = rows.map((r) => r.date).sort();
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const { data: existing, error } = await supabase
    .from("expenses")
    .select("date, amount_eur, description, bank_transaction_id")
    .gte("date", shift(dates[0], -5))
    .lte("date", shift(dates[dates.length - 1], 5))
    .range(0, 9999);
  fail(error);
  const keys = new Set((existing ?? []).map((e) => e.bank_transaction_id).filter(Boolean));
  const bankRows = (existing ?? [])
    .filter((e) => !String(e.bank_transaction_id ?? "").startsWith("file:"))
    .map((e) => ({ date: e.date, amount: Number(e.amount_eur), merchant: merchantKey(e.description) }));
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

  const fresh = rows.filter((r) => {
    if (keys.has(r.fileKey)) return false;
    const m = merchantKey(r.description);
    const i = bankRows.findIndex(
      (b) =>
        Math.abs(b.amount - r.amount) < 0.005 &&
        days(b.date, r.date) <= 3 &&
        (b.merchant.startsWith(m.slice(0, 6)) || m.startsWith(b.merchant.slice(0, 6))),
    );
    if (i >= 0) {
      bankRows.splice(i, 1);
      return false;
    }
    return true;
  });
  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from("expenses").insert(
      fresh.map((r) => ({
        user_id: uid,
        date: r.date,
        description: r.description,
        amount_eur: r.amount,
        original_amount: r.originalAmount ?? null,
        original_currency: r.originalCurrency ?? null,
        source: r.source,
        bank_transaction_id: r.fileKey,
      })),
    );
    fail(insertError);
  }
  return { added: fresh.length, skipped: rows.length - fresh.length };
}

export async function saveTransfers(input: ParsedTransfer[]): Promise<SaveSummary> {
  if (input.length === 0) return { added: 0, skipped: 0 };
  const uid = await userId();
  // Transfers the bank sync already brought in (same amount, a day or two apart) are skipped.
  const { data: known, error: knownError } = await supabase
    .from("jetfly_transfers")
    .select("date, amount_eur, bank_transaction_id")
    .not("bank_transaction_id", "like", "file:%");
  fail(knownError);
  const bankRows = (known ?? []).map((k) => ({ date: k.date, amount: Number(k.amount_eur) }));
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const rows = input.filter((t) => {
    const i = bankRows.findIndex((b) => Math.abs(b.amount - t.amount) < 0.005 && days(b.date, t.date) <= 2);
    if (i >= 0) {
      bankRows.splice(i, 1);
      return false;
    }
    return true;
  });
  if (rows.length === 0) return { added: 0, skipped: input.length };
  const { data, error } = await supabase
    .from("jetfly_transfers")
    .upsert(
      rows.map((t) => ({ user_id: uid, date: t.date, amount_eur: t.amount, label: t.label, bank_transaction_id: t.fileKey })),
      { onConflict: "user_id,bank_transaction_id", ignoreDuplicates: true },
    )
    .select("id");
  fail(error);
  return { added: data?.length ?? 0, skipped: input.length - (data?.length ?? 0) };
}

export async function saveSnapshot(s: ParsedSnapshot): Promise<void> {
  const { error } = await supabase.from("account_snapshots").upsert(
    {
      user_id: await userId(),
      snapshot_date: s.snapshotDate,
      balance_eur: s.balance,
      pending_card_eur: s.pendingCard,
      amex_last_debit_date: s.amexLastDebitDate,
      source: "Boursobank",
    },
    { onConflict: "user_id,snapshot_date,source" },
  );
  fail(error);
}
