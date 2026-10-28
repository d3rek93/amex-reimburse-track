/**
 * File parsers (fallback when Enable Banking is not used). Pure: they turn a
 * file's content into rows; saving is done in src/lib/ledger.ts.
 * Tested by tests/importers.test.ts with fictional files.
 */

export interface ParsedClaimLine {
  noteId: string;
  date: string;
  category: string;
  subcategory: string;
  amount: number;
  batchRef: string;
  paymentDate: string;
}

export interface ParsedBatch {
  ref: string;
  paymentDate: string;
  declaredTotal: number;
}

export interface ParsedExpense {
  date: string;
  description: string;
  amount: number;
  source: "AMEX" | "Boursobank" | "Prélèvement";
  /** Stable identity of the line within the file, so re-importing never duplicates. */
  fileKey: string;
  originalAmount?: number | null;
  originalCurrency?: string | null;
}

export interface ParsedTransfer {
  date: string;
  amount: number;
  label: string;
  fileKey: string;
}

export interface ParsedSnapshot {
  snapshotDate: string;
  balance: number;
  pendingCard: number;
  amexLastDebitDate: string | null;
}

// ---------------------------------------------------------------- helpers

export const parseAmount = (v: unknown): number => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/["\s\u00a0]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

const pad = (n: number | string) => String(n).padStart(2, "0");
const dmyToIso = (s: string) => {
  const [d, m, y] = s.split("/");
  return `${y.length === 2 ? `20${y}` : y}-${pad(m)}-${pad(d)}`;
};

/** Excel stores dates as days since 1899-12-30. */
const excelSerialToIso = (serial: number) =>
  new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);

const asDate = (v: unknown): string | null => {
  if (typeof v === "number" && v > 30000 && v < 80000) return excelSerialToIso(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return dmyToIso(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
};

/** Splits one CSV row, honouring quotes. */
export function splitCsvRow(row: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (quoted && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const textLines = (text: string) =>
  text.replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim() !== "");

/** Adds an occurrence counter so identical lines on the same day stay distinct. */
function keyed<T extends { fileKey: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const n = (seen.get(r.fileKey) ?? 0) + 1;
    seen.set(r.fileKey, n);
    return { ...r, fileKey: `${r.fileKey}#${n}` };
  });
}

// ------------------------------------------------- Jetfly monthly statement

const DETAIL = /^(\d{4,})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(.+?)(?:\s*-\s*(.+))?$/;

/**
 * Jetfly "Expenses / Statement" sheet, as rows of cells (XLSX sheet_to_json
 * with header: 1). A payment header has a date, a reference and a total;
 * the lines below it are "number - dd/mm/yyyy - category - sub-category".
 */
export function parseJetflyStatement(rows: unknown[][]): { lines: ParsedClaimLine[]; batches: ParsedBatch[] } {
  const lines: ParsedClaimLine[] = [];
  const batches: ParsedBatch[] = [];
  let current: ParsedBatch | null = null;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const cells = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
    if (cells.length === 0) continue;
    const text = cells.map((c) => String(c)).join(" ");
    if (/Total paid by/i.test(text)) break;

    const amountCell = [...cells].reverse().find((c) => !Number.isNaN(parseAmount(c)) && asDate(c) === null);
    const amount = amountCell === undefined ? NaN : parseAmount(amountCell);

    const detailCell = cells.find((c) => typeof c === "string" && DETAIL.test(c.trim()));
    if (detailCell && current && !Number.isNaN(amount)) {
      const m = String(detailCell).trim().match(DETAIL)!;
      lines.push({
        noteId: m[1],
        date: dmyToIso(m[2]),
        category: m[3].trim(),
        subcategory: (m[4] ?? "").trim(),
        amount: Math.round(amount * 100) / 100,
        batchRef: current.ref,
        paymentDate: current.paymentDate,
      });
      continue;
    }

    const dateCell = cells.find((c) => asDate(c) !== null);
    const refCell = cells.find((c) => typeof c === "string" && asDate(c) === null && Number.isNaN(parseAmount(c)));
    if (dateCell !== undefined && refCell !== undefined && !Number.isNaN(amount)) {
      current = {
        ref: String(refCell).trim(),
        paymentDate: asDate(dateCell)!,
        declaredTotal: Math.round(amount * 100) / 100,
      };
      batches.push(current);
    }
  }
  return { lines, batches };
}

// ------------------------------------------------------- Boursobank export

/**
 * Boursobank CSV export (French "Date Opération;…" or English "dateOp;…"
 * headers). Card purchases use the purchase date written in the label.
 */
export function parseBoursoCsv(text: string): {
  expenses: ParsedExpense[];
  transfers: ParsedTransfer[];
  snapshot: ParsedSnapshot | null;
} {
  const rows = textLines(text);
  if (rows.length === 0) return { expenses: [], transfers: [], snapshot: null };
  const header = splitCsvRow(rows[0], ";").map((h) => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = Math.max(col("date opération", "dateop"), 0);
  const iLabel = col("libellé", "label");
  const iCategory = col("catégorie", "category");
  const iParent = col("catégorie parente", "categoryparent");
  const iAccount = col("libellé compte", "accountlabel");
  // The French export names both the amount and the balance "Solde".
  const iAmount = header.indexOf("amount") >= 0 ? header.indexOf("amount") : header.indexOf("solde");
  const iBalance = header.indexOf("accountbalance") >= 0 ? header.indexOf("accountbalance") : header.lastIndexOf("solde");

  const expenses: ParsedExpense[] = [];
  const transfers: ParsedTransfer[] = [];
  const parsed = rows.slice(1).map((r) => splitCsvRow(r, ";")).filter((c) => c.length > iAmount);

  for (const c of parsed) {
    const date = c[iDate];
    const label = c[iLabel] ?? "";
    const raw = parseAmount(c[iAmount]);
    if (!date || Number.isNaN(raw)) continue;
    const category = iCategory >= 0 ? c[iCategory] : "";
    const parent = iParent >= 0 ? c[iParent] : "";

    if (/JETFLY/i.test(label) && raw > 0) {
      transfers.push({ date, amount: raw, label, fileKey: `file:bourso:${date}|${raw.toFixed(2)}|${label}` });
      continue;
    }
    if (/Relev[eé] diff[eé]r[eé]/i.test(label) || /débit différé/i.test(category)) continue;
    if (/American Express/i.test(label)) continue; // pays AMEX purchases already counted
    if (/Mouvements internes/i.test(parent) || /^VIR /i.test(label)) continue;

    const card = label.match(/^CARTE (\d{2}\/\d{2}\/\d{2})/i);
    const isDebit = /^PRLV/i.test(label);
    if (!card && !isDebit) continue;
    const purchaseDate = card ? dmyToIso(card[1]) : date;
    const amount = Math.round(-raw * 100) / 100; // bank: money out is negative
    expenses.push({
      date: purchaseDate,
      description: amount < 0 ? `Remboursement - ${label}` : label,
      amount,
      source: isDebit ? "Prélèvement" : "Boursobank",
      fileKey: `file:bourso:${purchaseDate}|${amount.toFixed(2)}|${label}`,
    });
  }

  let snapshot: ParsedSnapshot | null = null;
  const isCard = (c: string[]) => iAccount >= 0 && /ULTIM|CARTE/i.test(c[iAccount] ?? "");
  const accountRows = parsed.filter((c) => !isCard(c) && !Number.isNaN(parseAmount(c[iBalance])));
  if (accountRows.length > 0) {
    const latest = accountRows.reduce((a, b) => (b[iDate] > a[iDate] ? b : a));
    const statements = parsed.filter((c) => /Relev[eé] diff[eé]r[eé]/i.test(c[iLabel])).map((c) => c[iDate]).sort();
    const last = statements[statements.length - 1];
    const cardFrom = last ? `${last.slice(0, 8)}01` : "0000-00-00";
    const pendingCard = parsed
      .filter((c) => isCard(c) && c[iDate] >= cardFrom)
      .reduce((s, c) => s - (parseAmount(c[iAmount]) || 0), 0);
    const amexDebits = parsed
      .filter((c) => /American Express/i.test(c[iLabel]) && parseAmount(c[iAmount]) < 0)
      .map((c) => c[iDate])
      .sort();
    snapshot = {
      snapshotDate: latest[iDate],
      balance: parseAmount(latest[iBalance]),
      pendingCard: Math.round(Math.max(pendingCard, 0) * 100) / 100,
      amexLastDebitDate: amexDebits[amexDebits.length - 1] ?? null,
    };
  }

  return { expenses: keyed(expenses), transfers: keyed(transfers), snapshot };
}

// ------------------------------------------------------------- AMEX export

/** AMEX "activity" CSV export: Date (MM/DD/YYYY), Description, Montant. */
export function parseAmexCsv(text: string): ParsedExpense[] {
  const rows = textLines(text);
  const expenses: ParsedExpense[] = [];
  for (const r of rows.slice(1)) {
    const c = splitCsvRow(r, ",");
    if (c.length < 3) continue;
    const [m, d, y] = c[0].split("/");
    if (!y) continue;
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const label = c[1].replace(/\s+/g, " ").trim();
    const amount = parseAmount(c[2]);
    if (Number.isNaN(amount) || amount === 0) continue;
    if (/PRELEVEMENT AUTOMATIQUE/i.test(label)) continue; // monthly card payment
    expenses.push({
      date,
      description: amount < 0 ? `Remboursement - ${label}` : label,
      amount,
      source: "AMEX",
      fileKey: `file:amex:${date}|${amount.toFixed(2)}|${label}`,
    });
  }
  return keyed(expenses);
}

/** Which parser fits a CSV, from its header line. */
export function detectCsv(text: string): "bourso" | "amex" | null {
  const first = textLines(text)[0] ?? "";
  if (/date op[ée]ration|dateop/i.test(first)) return "bourso";
  if (/^"?date"?,"?description"?,/i.test(first)) return "amex";
  return null;
}
