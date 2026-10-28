import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { detectCsv, parseAmexCsv, parseBoursoCsv, parseJetflyStatement, type ParsedExpense } from "./importers";
import { saveClaimStatement, saveFileExpenses, saveSnapshot, saveTransfers } from "./ledger";

export interface ImportOutcome {
  title: string;
  detail: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Reads one file, whatever its kind, and saves what it contains. */
export async function importFile(file: File): Promise<ImportOutcome> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: true });
    const { lines, batches } = parseJetflyStatement(rows);
    if (lines.length === 0) throw new Error("Aucune note Jetfly trouvée dans ce fichier");
    const saved = await saveClaimStatement(lines, batches);
    return {
      title: `Relevé Jetfly : ${file.name}`,
      detail: `${plural(saved.added, "note")} ajoutée${saved.added > 1 ? "s" : ""}, ${saved.skipped} déjà connue${saved.skipped > 1 ? "s" : ""}`,
    };
  }

  if (name.endsWith(".csv")) {
    const text = await file.text();
    const kind = detectCsv(text);
    if (kind === "bourso") {
      const { expenses, transfers, snapshot } = parseBoursoCsv(text);
      const e = await saveFileExpenses(expenses);
      const t = await saveTransfers(transfers);
      if (snapshot) await saveSnapshot(snapshot);
      return {
        title: `Relevé Boursobank : ${file.name}`,
        detail: `${plural(e.added, "dépense")} et ${plural(t.added, "virement")} Jetfly ajoutés`,
      };
    }
    if (kind === "amex") {
      const e = await saveFileExpenses(parseAmexCsv(text));
      return { title: `Relevé AMEX : ${file.name}`, detail: `${plural(e.added, "dépense")} ajoutée${e.added > 1 ? "s" : ""}, ${e.skipped} déjà connue${e.skipped > 1 ? "s" : ""}` };
    }
    throw new Error("Ce CSV ne ressemble ni à un export Boursobank ni à un export AMEX");
  }

  if (name.endsWith(".pdf")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const { data, error } = await supabase.functions.invoke("parse-amex-pdf", {
      body: { fileName: file.name, fileContent: btoa(binary) },
    });
    if (error) throw new Error(error.message);
    const list = ((data as { transactions?: Record<string, unknown>[] }).transactions ?? []) as {
      date: string;
      description: string;
      amountEur: number;
      originalAmount?: number;
      originalCurrency?: string;
    }[];
    const seen = new Map<string, number>();
    const rows: ParsedExpense[] = list
      .filter((t) => !/PRELEVEMENT AUTOMATIQUE/i.test(t.description))
      .map((t) => {
        const base = `file:amexpdf:${t.date}|${Number(t.amountEur).toFixed(2)}|${t.description}`;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        return {
          date: t.date,
          description: t.description,
          amount: Number(t.amountEur),
          source: "AMEX",
          fileKey: `${base}#${n}`,
          originalAmount: t.originalAmount ?? null,
          originalCurrency: t.originalCurrency ?? null,
        };
      });
    const e = await saveFileExpenses(rows);
    return { title: `Relevé AMEX : ${file.name}`, detail: `${plural(e.added, "dépense")} ajoutée${e.added > 1 ? "s" : ""}, ${e.skipped} déjà connue${e.skipped > 1 ? "s" : ""}` };
  }

  throw new Error("Format non reconnu : PDF, CSV ou XLS uniquement");
}
