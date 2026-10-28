import { supabase } from "@/integrations/supabase/client";

export interface BankAccount {
  uid?: string;
  iban?: string;
  name?: string;
  currency?: string;
  usage?: string;
  product?: string;
  enabled?: boolean;
}

export interface BankSyncResult {
  session_id?: string;
  aspsp_name?: string | null;
  account: BankAccount;
  balances?: { balances?: BankBalance[] };
  transactions?: BankTransaction[];
  pages?: number;
}

interface BankBalance {
  balance?: { amount?: string | number; currency?: string };
  balanceType?: string;
  balance_amount?: { amount?: string | number; currency?: string };
  balance_type?: string;
  reference_date?: string;
  referenceDate?: string;
}

export interface BankTransaction {
  transaction_id?: string;
  entry_date?: string;
  booking_date?: string;
  transaction_status?: string;
  credit_debit_indicator?: string;
  amount?: { amount?: string | number; currency?: string };
  transaction_amount?: { amount?: string | number; currency?: string };
  remittance_information?: string[] | string;
  unstructured_remittance_information?: { value?: string }[];
  structured_remittance_information?: Record<string, unknown>;
  bank_transaction_code?: { code?: string; family?: string; sub_family?: string };
  [key: string]: unknown;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v.replace(/\s/g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Readable label of a bank operation, whatever shape the API used. */
export function describeTransaction(t: BankTransaction): string {
  const parts: string[] = [];
  const ri = t.remittance_information;
  if (Array.isArray(ri)) parts.push(...ri.filter(Boolean));
  else if (typeof ri === "string") parts.push(ri);
  const unstructured = t.unstructured_remittance_information;
  if (Array.isArray(unstructured)) parts.push(...unstructured.map((u) => u?.value ?? ""));
  const code = t.bank_transaction_code;
  if (parts.every((p) => !p)) {
    if (typeof code?.sub_family === "string") parts.push(code.sub_family);
    else if (typeof code?.family === "string") parts.push(code.family);
  }
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Day the operation counts for (booked date when the bank knows it). */
export function transactionDate(t: BankTransaction): string {
  const raw = t.booking_date || t.entry_date || "";
  return String(raw).slice(0, 10);
}

/** Signed amount in euros: money leaving the account is positive. */
export function transactionAmount(t: BankTransaction): number {
  const value = Math.abs(num((t.transaction_amount ?? t.amount)?.amount));
  const indicator = String(t.credit_debit_indicator ?? "").toUpperCase();
  return indicator === "CRDT" || indicator === "CREDIT" ? -value : value;
}

/** Only card payments, deferred-card statements and direct debits are expenses. */
export function isBankExpenseLine(description: string): boolean {
  const d = description.toUpperCase();
  if (/VIREMENT|VIRT|CARTE FRAIS|FRAIS DE TENUE|COMMISSION|INT[RÉ]RÊT/.test(d)) return false;
  return (
    /CARTE|ULTIM|\bCB\b|PAIEMENT|PRLV|PR[LÉ]VEMENT|AMERICAN EXPRESS|ORANGE/.test(d) ||
    d.includes("AFOREV")
  );
}

/** AMEX debits and deferred-card statements pay expenses already counted. */
export function isSettlementLine(description: string): boolean {
  return /RELEV[EÉ] DIFF[EÉ]R[EÉ]|AMERICAN EXPRESS/i.test(description);
}

/** Merchant part of a label, used to match the same purchase across sources. */
export function merchantKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/^REMBOURSEMENT - /, "")
    .replace(/^CARTE \d{2}\/\d{2}\/\d{2}\s*/, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 10);
}

/** Day the purchase happened (card lines carry it in the label). */
export function operationDate(t: BankTransaction): string {
  const m = describeTransaction(t).match(/CARTE (\d{2})\/(\d{2})\/(\d{2})/i);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return String((t.transaction_date as string) || t.value_date || transactionDate(t)).slice(0, 10);
}

const key = (date: string, amount: number, description: string) =>
  `${date}|${amount.toFixed(2)}|${description.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14)}`;

export interface SyncSummary {
  imported: number;
  skipped: number;
  balance: number | null;
  snapshotDate: string | null;
  errors: string[];
  accounts: number;
}

interface NewExpenseRow {
  user_id: string;
  date: string;
  description: string;
  amount_eur: number;
  original_amount: number | null;
  original_currency: string | null;
  reimbursement_status: string;
  reimbursed_amount: number;
  is_personal: boolean;
  considered_complete: boolean;
  source: string;
  bank_transaction_id: string;
}

/** Monthly settlement of the AMEX card (shows on the card account as a credit). */
export function isAmexCardPayment(description: string): boolean {
  return /PRELEVEMENT AUTOMATIQUE|PAIEMENT RE[CÇ]U|PAYMENT RECEIVED|MERCI POUR VOTRE PAIEMENT/i.test(description);
}

/** Stable identity of a bank line: account + bank id (or its content when the bank gives none). */
export function bankTransactionId(r: BankSyncResult, t: BankTransaction): string {
  const account = String(r.account.uid ?? r.account.iban ?? "");
  const own = (t.transaction_id as string | undefined) ?? (t.entry_reference as string | undefined);
  if (own) return `${account}:${own}`;
  return `${account}:${transactionDate(t)}|${transactionAmount(t).toFixed(2)}|${describeTransaction(t)}`;
}

/** Amount in the purchase currency, when the bank reports a foreign-currency payment. */
export function foreignAmount(t: BankTransaction): { amount: number; currency: string } | null {
  const fx = t.exchange_rate as
    | { instructed_amount?: { amount?: string | number; currency?: string } }
    | undefined;
  const instructed = fx?.instructed_amount;
  const currency = String(instructed?.currency ?? "").toUpperCase();
  if (!instructed || !currency || currency === "EUR") return null;
  const amount = Math.abs(num(instructed.amount));
  return amount ? { amount, currency } : null;
}

/**
 * Pulls the linked bank account and stores what it finds:
 * expenses (deduplicated against what is already there) and the real balance.
 */
export async function runBankSync(days = 120): Promise<SyncSummary> {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "sync", days },
  });
  if (error) throw new Error(error.message ?? "Sync failed");
  const payload = data as { results?: BankSyncResult[]; errors?: string[] };
  const results = payload.results ?? [];
  const errors = [...(payload.errors ?? [])];

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Vous devez être connecté");

  const isAmex = (r: BankSyncResult) => /american express|amex/i.test(r.aspsp_name ?? "");
  const amex = results.filter(isAmex);
  const bourso = results.filter((r) => !isAmex(r));
  const isCardAccount = (r: BankSyncResult) =>
    /carte|card|ultim/i.test(`${r.account.product ?? ""} ${r.account.name ?? ""}`);
  const mainAccounts = bourso.filter((r) => !isCardAccount(r));
  const cardAccounts = bourso.filter(isCardAccount);
  const from = new Date(Date.now() - (days + 60) * 86400000).toISOString().slice(0, 10);

  const { data: existing, error: existingError } = await supabase
    .from("expenses")
    .select("date, amount_eur, description, bank_transaction_id")
    .eq("user_id", userId)
    .gte("date", from)
    .range(0, 9999);
  if (existingError) throw new Error(existingError.message);
  const knownIds = new Set<string>(
    (existing ?? []).map((e) => e.bank_transaction_id).filter(Boolean) as string[],
  );
  // Lines that came from PDF/CSV/manual entry: match them loosely.
  const fileRows = (existing ?? [])
    .filter((e) => !e.bank_transaction_id || /^(file|manual):/.test(e.bank_transaction_id))
    .map((e) => ({
      date: e.date as string,
      amount: Number(e.amount_eur),
      merchant: merchantKey(e.description),
    }));
  const matchesFileRow = (date: string, amount: number, description: string, windowDays: number) => {
    const m = merchantKey(description);
    const t = Date.parse(date);
    const i = fileRows.findIndex(
      (e) =>
        Math.abs(e.amount - amount) < 0.005 &&
        Math.abs(Date.parse(e.date) - t) <= windowDays * 86400000 &&
        (e.merchant === m || !m || !e.merchant ||
          e.merchant.startsWith(m.slice(0, 6)) || m.startsWith(e.merchant.slice(0, 6))),
    );
    if (i >= 0) fileRows.splice(i, 1); // one file row matches one bank line at most
    return i >= 0;
  };

  const rows: NewExpenseRow[] = [];
  let skipped = 0;
  const push = (
    r: BankSyncResult,
    t: BankTransaction,
    source: string,
    accept: (description: string) => boolean,
    windowDays: number,
  ) => {
    // Pending lines change id once booked: wait until the bank books them.
    const status = String(t.transaction_status ?? "BOOK").toUpperCase();
    const date = operationDate(t);
    const description = describeTransaction(t);
    const amount = transactionAmount(t);
    const id = bankTransactionId(r, t);
    if (status !== "BOOK" || !date || amount === 0 || !accept(description) ||
        knownIds.has(id) || matchesFileRow(date, amount, description, windowDays)) {
      skipped += 1;
      return;
    }
    knownIds.add(id);
    const isRefund = amount < 0;
    const fx = foreignAmount(t);
    rows.push({
      user_id: userId,
      date,
      description: isRefund ? `Remboursement - ${description}` : description,
      amount_eur: amount,
      original_amount: fx ? (isRefund ? -fx.amount : fx.amount) : null,
      original_currency: fx?.currency ?? null,
      reimbursement_status: isRefund ? "complete" : "pending",
      reimbursed_amount: 0,
      is_personal: false,
      considered_complete: false,
      source,
      bank_transaction_id: id,
    });
  };

  // Money received from Jetfly: kept apart, to check each payment batch arrived.
  const jetflyTransfers: { user_id: string; date: string; amount_eur: number; label: string; bank_transaction_id: string }[] = [];
  for (const r of bourso) {
    for (const t of r.transactions ?? []) {
      const label = describeTransaction(t);
      const amount = transactionAmount(t);
      if (amount < 0 && /JETFLY/i.test(label) && String(t.transaction_status ?? "BOOK").toUpperCase() === "BOOK") {
        jetflyTransfers.push({
          user_id: userId,
          date: transactionDate(t),
          amount_eur: Math.round(-amount * 100) / 100,
          label,
          bank_transaction_id: bankTransactionId(r, t),
        });
      }
    }
  }
  if (jetflyTransfers.length > 0) {
    const { error: transferError } = await supabase
      .from("jetfly_transfers")
      .upsert(jetflyTransfers, { onConflict: "user_id,bank_transaction_id", ignoreDuplicates: true });
    if (transferError) errors.push(`Virements Jetfly : ${transferError.message}`);
  }

  for (const r of bourso) {
    for (const t of r.transactions ?? []) {
      push(
        r,
        t,
        /PRLV|PR[LÉ]VEMENT/i.test(describeTransaction(t)) ? "Prélèvement" : "Boursobank",
        (d) => isBankExpenseLine(d) && !isSettlementLine(d),
        45,
      );
    }
  }
  for (const r of amex) {
    for (const t of r.transactions ?? []) {
      // Every AMEX line is a purchase or a refund, except the monthly payment.
      push(r, t, "AMEX", (d) => !isAmexCardPayment(d), 5);
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("expenses").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  // Real balance: current account only, never the deferred card account.
  let balance: number | null = null;
  let snapshotDate: string | null = null;
  const today = new Date().toISOString().slice(0, 10);
  for (const r of mainAccounts) {
    const list = r.balances?.balances ?? [];
    if (list.length === 0) continue;
    const type = (b: BankBalance) => b.balance_type ?? b.balanceType;
    const chosen =
      list.find((b) => type(b) === "CLBD") ??
      list.find((b) => type(b) === "XPCD") ??
      list[0];
    balance = (balance ?? 0) + num((chosen.balance_amount ?? chosen.balance)?.amount);
    const ref = String(chosen.reference_date ?? chosen.referenceDate ?? today).slice(0, 10);
    if (!snapshotDate || ref > snapshotDate) snapshotDate = ref;
  }
  if (snapshotDate && snapshotDate > today) snapshotDate = today;

  if (balance !== null && snapshotDate) {
    // Card purchases not yet taken from the account (booked after the snapshot day).
    const pendingCard = cardAccounts
      .flatMap((r) => r.transactions ?? [])
      .filter((t) => !isSettlementLine(describeTransaction(t)) && transactionDate(t) > snapshotDate!)
      .reduce((sum, t) => sum + transactionAmount(t), 0);
    const amexDebit = mainAccounts
      .flatMap((r) => r.transactions ?? [])
      .filter((t) => /AMERICAN EXPRESS/i.test(describeTransaction(t)) && transactionAmount(t) > 0)
      .map(transactionDate)
      .sort();
    const { data: previous } = await supabase
      .from("account_snapshots")
      .select("amex_last_debit_date")
      .eq("user_id", userId)
      .eq("source", "Boursobank")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    await supabase.from("account_snapshots").upsert({
      user_id: userId,
      snapshot_date: snapshotDate,
      balance_eur: Math.round(balance * 100) / 100,
      pending_card_eur: Math.round(Math.max(pendingCard, 0) * 100) / 100,
      amex_last_debit_date: amexDebit[amexDebit.length - 1] ?? previous?.[0]?.amex_last_debit_date ?? null,
      source: "Boursobank",
    }, { onConflict: "user_id,snapshot_date,source" });
  }

  return {
    imported: rows.length,
    skipped,
    balance,
    snapshotDate,
    errors,
    accounts: results.length,
  };
}

/** Banks the user can link, for a given country. */
export async function listBanks(country = "FR"): Promise<{ name: string; country: string }[]> {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "aspsps", country },
  });
  if (error) throw new Error(error.message ?? "Unable to load banks");
  return (data as { aspsps?: { name: string; country: string }[] }).aspsps ?? [];
}

/** Start the authorisation: returns the URL to send the user to. */
export async function startLink(
  aspspName: string,
  country = "FR"
): Promise<{ url: string; state: string }> {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "start", aspspName, country },
  });
  if (error) throw new Error(error.message ?? "Unable to start");
  const payload = data as { url?: string; state?: string; error?: string };
  if (!payload.url) throw new Error(payload.error ?? "No authorisation url");
  return { url: payload.url, state: payload.state ?? "" };
}

/** Swap the code coming back from the bank for a stored session. */
export async function completeLink(code: string) {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "session", code },
  });
  if (error) throw new Error(error.message ?? "Unable to link");
  return data as { session_id?: string; accounts?: BankAccount[]; error?: string };
}

export interface LinkedSession {
  session_id: string;
  aspsp_name: string | null;
  accounts: BankAccount[];
  valid_until: string | null;
}

/** Sessions already linked for this user. */
export async function listLinked(): Promise<LinkedSession[]> {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "status" },
  });
  if (error) throw new Error(error.message ?? "Unable to read links");
  return (data as { sessions?: LinkedSession[] }).sessions ?? [];
}

/** Choose which accounts of a linked bank are followed by the sync. */
export async function setFollowedAccounts(sessionId: string, uids: string[]) {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "set_accounts", session_id: sessionId, uids },
  });
  if (error) throw new Error(error.message ?? "Unable to save");
  return (data as { accounts?: BankAccount[] }).accounts ?? [];
}

/** Remove one linked bank (or all when no id). */
export async function forgetLink(sessionId?: string) {
  const { error } = await supabase.functions.invoke("enable-banking", {
    body: { action: "forget", session_id: sessionId },
  });
  if (error) throw new Error(error.message ?? "Unable to unlink");
}
