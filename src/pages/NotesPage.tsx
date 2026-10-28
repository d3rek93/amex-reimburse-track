import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { NoteStatusLabel } from "@/components/StatusLabel";
import { Input } from "@/components/ui/input";
import { useLedger, type BatchView, type Ledger } from "@/lib/ledger";
import { categoryLabel, dayDate, eur, monthLabel, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function NotesPage() {
  const { ledger, isLoading, error } = useLedger();
  const [query, setQuery] = useState("");

  const months = useMemo(() => {
    if (!ledger) return [];
    const q = query.trim().toLowerCase().replace(",", ".");
    const visible = ledger.batches.filter((b) => {
      if (!q) return true;
      if (b.ref.toLowerCase().includes(q) || b.linesTotal.toFixed(2).includes(q)) return true;
      return b.noteIds.some((n) => {
        const c = ledger.claimById.get(n);
        return n.includes(q) || (c && (c.amount.toFixed(2).includes(q) || categoryLabel(c.category, c.subcategory).toLowerCase().includes(q)));
      });
    });
    const byMonth = new Map<string, BatchView[]>();
    for (const b of visible) {
      const key = b.paymentDate.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), b]);
    }
    return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [ledger, query]);

  return (
    <AppLayout title="Notes Jetfly">
      {error ? (
        <p className="text-destructive">Chargement impossible : {(error as Error).message}</p>
      ) : isLoading || !ledger ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : ledger.batches.length === 0 ? (
        <p className="text-muted-foreground max-w-xl">
          Aucun relevé Jetfly importé. Utilise « Importer » et choisis les fichiers XLS reçus chaque début de mois : tu
          peux en sélectionner plusieurs d'un coup.
        </p>
      ) : (
        <div className="space-y-8">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N° de note, montant, catégorie" className="pl-9" aria-label="Chercher" />
          </div>
          {months.map(([key, batches]) => (
            <Month key={key} label={monthLabel(`${key}-15`)} batches={batches} ledger={ledger} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function Month({ label, batches, ledger }: { label: string; batches: BatchView[]; ledger: Ledger }) {
  const total = batches.reduce((s, b) => s + b.linesTotal, 0);
  const received = batches.filter((b) => b.transfer).reduce((s, b) => s + b.linesTotal, 0);
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-base font-semibold">Payé en {label.toLowerCase()}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {eur(total)} annoncés, {eur(received)} reçus sur Boursobank
        </p>
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {batches.map((b) => (
          <Batch key={b.ref} batch={b} ledger={ledger} />
        ))}
      </div>
    </section>
  );
}

function Batch({ batch, ledger }: { batch: BatchView; ledger: Ledger }) {
  const [open, setOpen] = useState(false);
  const mismatch = batch.declaredTotal !== null && Math.abs(batch.declaredTotal - batch.linesTotal) >= 0.005;
  const notes = batch.noteIds.map((n) => ledger.claimById.get(n)).filter(Boolean);
  const issues = notes.filter((c) => c && ["missing", "to_review"].includes(ledger.noteStatus.get(c.noteId) ?? "")).length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-muted/40 focus-visible:bg-muted/40 outline-none"
      >
        <span className="w-20 tabular-nums text-muted-foreground">{dayDate(batch.paymentDate)}</span>
        <span className="flex-1 min-w-[10rem]">
          {notes.length} note{notes.length > 1 ? "s" : ""}
          {issues > 0 && <span className="text-primary"> dont {issues} à traiter</span>}
          <span className="text-muted-foreground"> · {batch.ref}</span>
        </span>
        <span className={cn("text-sm", batch.transfer ? "text-success" : batch.beforeHistory ? "text-muted-foreground" : "text-warning")}>
          {batch.transfer
            ? `Virement reçu le ${shortDate(batch.transfer.date)}`
            : batch.beforeHistory
              ? "Avant tes relevés"
              : batch.linesTotal > 0
                ? "Virement non trouvé"
                : ""}
        </span>
        <span className="w-24 text-right tabular-nums font-medium">{eur(batch.linesTotal)}</span>
      </button>
      {mismatch && (
        <p className="px-4 pb-2 text-sm text-warning">
          Le relevé annonce {eur(batch.declaredTotal!)} pour ce paiement, mais ses lignes totalisent {eur(batch.linesTotal)}.
        </p>
      )}
      {open && (
        <div className="px-4 pb-3">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {notes.map((c) =>
                c ? (
                  <tr key={c.noteId}>
                    <td className="py-1.5 pr-3 w-20 tabular-nums text-muted-foreground">{shortDate(c.date)}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted-foreground w-20">{c.noteId}</td>
                    <td className="py-1.5 pr-3">{categoryLabel(c.category, c.subcategory)}</td>
                    <td className="py-1.5 pr-3">
                      <NoteStatusLabel status={ledger.noteStatus.get(c.noteId)!} />
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {c.lines
                        .filter((l) => l.batchRef === batch.ref)
                        .map((l) => eur(l.amount))
                        .join(" ")}
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
