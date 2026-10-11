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
  next_uri?: string | null;
}

interface BankBalance {
  balance?: { amount?: string | number; currency?: string };
  balanceType?: string;
  balance_amount?: { amount?: string | number; currency?: string };
  balance_type?: string;
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

  const transactions = results.flatMap((r) => r.transactions ?? []);
  const dates = transactions.map(transactionDate).filter(Boolean).sort();
  const from = dates[0] ?? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("expenses")
    .select("date, amount_eur, description")
    .eq("user_id", userId)
    .gte("date", from);
  const seen = new Set(
    (existing ?? []).map((e) => key(e.date, Number(e.amount_eur), e.description))
  );

interface NewExpenseRow {
  user_id: string;
  date: string;
  description: string;
  amount_eur: number;
  reimbursement_status: string;
  reimbursed_amount: number;
  is_personal: boolean;
  considered_complete: boolean;
  source: string;
}

const rows: NewExpenseRow[] = [];
  let skipped = 0;
  for (const t of transactions) {
    const date = transactionDate(t);
    const description = describeTransaction(t);
    const amount = transactionAmount(t);
    if (!date || !isBankExpenseLine(description) || amount === 0) {
      skipped += 1;
      continue;
    }
    const k = key(date, amount, description);
    if (seen.has(k)) {
      skipped += 1;
      continue;
    }
    seen.add(k);
    const isRefund = amount < 0;
    rows.push({
      user_id: userId,
      date,
      description: isRefund ? `Remboursement - ${description}` : description,
      amount_eur: amount,
      reimbursement_status: isRefund ? "complete" : "pending",
      reimbursed_amount: 0,
      is_personal: false,
      considered_complete: false,
      source: /PRLV|PR[LÉ]VEMENT/i.test(description) ? "Prélèvement" : "Boursobank",
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("expenses").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  // Real balance of the main account, for the advance computation.
  let balance: number | null = null;
  let snapshotDate: string | null = null;
  for (const r of results) {
    const list = r.balances?.balances ?? [];
    if (list.length === 0) continue;
    const type = (b: BankBalance) => b.balance_type ?? b.balanceType;
    const chosen =
      list.find((b) => type(b) === "CLBD") ??
      list.find((b) => type(b) === "XPCD") ??
      list.find((b) => type(b) === "expected") ??
      list[0];
    const value = num((chosen.balance_amount ?? chosen.balance)?.amount);
    if (value === 0) continue;
    if (balance === null || Math.abs(value) > Math.abs(balance)) balance = value;
  }
  const accountDates = results
    .flatMap((r) => (r.transactions ?? []).map(transactionDate))
    .filter(Boolean)
    .sort();
  if (accountDates.length > 0) snapshotDate = accountDates[accountDates.length - 1];
  if (balance === null) snapshotDate = null;

  if (balance !== null && snapshotDate) {
    const { data: previous } = await supabase
      .from("account_snapshots")
      .select("pending_card_eur, amex_last_debit_date")
      .eq("user_id", userId)
      .eq("source", "Boursobank")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    const amexDebit = transactions
      .filter(
        (t) =>
          /AMERICAN EXPRESS/i.test(describeTransaction(t)) &&
          transactionAmount(t) > 0
      )
      .map(transactionDate)
      .sort();
    await supabase.from("account_snapshots").upsert({
      user_id: userId,
      snapshot_date: snapshotDate,
      balance_eur: balance,
      pending_card_eur: previous?.[0]?.pending_card_eur ?? 0,
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
