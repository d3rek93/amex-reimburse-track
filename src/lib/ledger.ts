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
  learnRules,
  buildClaims,
  merchantKey,
  reconcile,
  type BankLine,
  type Claim,
  type ClaimLine,
  type Match,
  type ReconcileResult,
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

export type ExpenseStatus =
  | "personal"
  | "reimbursed"
  | "discrepancy"
  | "to_review"
  | "pending"
  | "neutralized"
  | "refund";

export type NoteStatus = "matched" | "discrepancy" | "to_review" | "missing" | "cancelled" | "before_history";

/** A match as shown in the UI: confirmed ones carry the link id they come from. */
export interface MatchView extends Match {
  linkId?: string;
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
  /** Oldest bank line on file (notes before it cannot be checked). */
  historyStart: string | null;
  /** Notes older than the bank history, left out of the lists to handle. */
  beforeHistoryNoteIds: string[];
  advance: AdvancePosition;
  lastSyncedAt: string | null;
  counts: {
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
  snapshot: AccountSnapshot | null;
  lastSyncedAt: string | null;
}

async function loadRaw(): Promise<RawData> {
  const [expenses, claimLines, batches, transfers, links, rejections, snap, sessions] = await Promise.all([
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
    readAll<TransferRow>("jetfly_transfers", "id, date, amount_eur, label", "date"),
    readAll<LinkRow>("reconciliation_links", "id, note_ids, expense_ids, difference, comment", "created_at"),
    readAll<RawData["rejections"][number]>("reconciliation_rejections", "note_id, expense_id", "created_at"),
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
    transfers: transfers.map((t) => ({ ...t, amount_eur: n(t.amount_eur) })),
    links: links.map((l) => ({ ...l, difference: n(l.difference) })),
    rejections,
    snapshot: (snap.data as AccountSnapshot | null) ?? null,
    lastSyncedAt: (sessions.data?.[0]?.last_synced_at as string | null) ?? null,
  };
}

// ---------------------------------------------------------------- deriving

export function buildLedger(raw: RawData): Ledger {
  const expenseById = new Map(raw.expenses.map((e) => [e.id, e]));
  const lines: BankLine[] = raw.expenses.map((e) => ({
    id: e.id,
    date: e.date,
    amount: e.amount_eur,
    label: e.description,
    source: e.source ?? "AMEX",
    personal: e.is_personal,
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
  const confirmed = raw.links.map((l) => ({ noteIds: l.note_ids, lineIds: l.expense_ids, ref: l.id }));
  const rules = learnRules(confirmed, lines, buildClaims(claimLines));

  const result = reconcile({
    lines,
    claimLines,
    transfers: raw.transfers.map((t) => ({ id: t.id, date: t.date, amount: t.amount_eur })),
    confirmed,
    rejected: raw.rejections.map((r) => ({ noteId: r.note_id, lineId: r.expense_id })),
    rules,
  });

  const linkById = new Map(raw.links.map((l) => [l.id, l]));
  const matches: MatchView[] = result.matches.map((m) => {
    const link = m.ref ? linkById.get(m.ref) : undefined;
    return link ? { ...m, linkId: link.id, difference: link.difference } : m;
  });

  const claimById = new Map(result.claims.map((c) => [c.noteId, c]));
  const matchOfExpense = new Map<string, MatchView>();
  const matchOfNote = new Map<string, MatchView>();
  for (const m of matches) {
    m.lineIds.forEach((id) => matchOfExpense.set(id, m));
    m.noteIds.forEach((n) => matchOfNote.set(n, m));
  }
  const inSuggestion = new Set(result.suggestions.flatMap((s) => [...s.noteIds, ...s.lineIds]));
  const neutralized = new Set(result.neutralized.flat());

  const expenseStatus = new Map<string, ExpenseStatus>();
  for (const e of raw.expenses) {
    const m = matchOfExpense.get(e.id);
    let status: ExpenseStatus;
    if (e.is_personal) status = "personal";
    else if (m) status = Math.abs(m.difference) >= 0.005 ? "discrepancy" : "reimbursed";
    else if (neutralized.has(e.id)) status = "neutralized";
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

  // Advance: what Jetfly still owes = pro expenses not yet matched to a note.
  const advance = computeAdvancePosition(
    raw.snapshot,
    raw.expenses.map((e) => {
      const status = expenseStatus.get(e.id)!;
      const reimbursed = status === "reimbursed" || status === "discrepancy" || status === "neutralized";
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
  );

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
    historyStart,
    beforeHistoryNoteIds,
    advance,
    lastSyncedAt: raw.lastSyncedAt,
    counts: {
      toReview: reviewGroups.size + personalSuggestions.length,
      discrepancies: result.suggestions.filter(isDiscrepancy).length,
      missingNotes: missingNoteIds.length,
      unclaimedExpenses: result.unmatchedLineIds.filter((id) => (expenseById.get(id)?.amount_eur ?? 0) > 0).length,
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
        return;
      }
      const uid = await userId();
      const rows = m.noteIds.flatMap((n) => m.lineIds.map((id) => ({ user_id: uid, note_id: n, expense_id: id })));
      const { error } = await supabase
        .from("reconciliation_rejections")
        .upsert(rows, { onConflict: "user_id,note_id,expense_id", ignoreDuplicates: true });
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

export async function saveTransfers(rows: ParsedTransfer[]): Promise<SaveSummary> {
  if (rows.length === 0) return { added: 0, skipped: 0 };
  const uid = await userId();
  const { data, error } = await supabase
    .from("jetfly_transfers")
    .upsert(
      rows.map((t) => ({ user_id: uid, date: t.date, amount_eur: t.amount, label: t.label, bank_transaction_id: t.fileKey })),
      { onConflict: "user_id,bank_transaction_id", ignoreDuplicates: true },
    )
    .select("id");
  fail(error);
  return { added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
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
