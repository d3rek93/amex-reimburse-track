import { useState } from "react";
import { PairStrip } from "@/components/PairStrip";
import { NoteStatusLabel } from "@/components/StatusLabel";
import { PayOtherwise, PickExpenses, claimsOf, expensesOf, useRunner } from "@/components/ReconcileTools";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLedgerActions, type Ledger } from "@/lib/ledger";
import { categoryLabel, eur, longDate, shortDate } from "@/lib/format";

/**
 * Everything about one Jetfly note: its payment history, the expense it is
 * matched with, the open proposals, and the ways to settle it.
 */
export function NoteDetails({ ledger, noteId, onClose }: { ledger: Ledger; noteId: string | null; onClose: () => void }) {
  const actions = useLedgerActions();
  const { busy, run } = useRunner();
  const [mode, setMode] = useState<"details" | "pick" | "pay" | "extend">("details");
  const note = noteId ? ledger.claimById.get(noteId) : undefined;

  const close = () => {
    setMode("details");
    onClose();
  };

  if (!noteId || !note) return null;
  if (mode === "pick") return <PickExpenses ledger={ledger} noteIds={[noteId]} onClose={close} />;
  const current = ledger.matchOfNote.get(noteId);
  if (mode === "extend" && current) return <PickExpenses ledger={ledger} noteIds={current.noteIds} extend={current} onClose={close} />;
  if (mode === "pay") return <PayOtherwise open notes={[note]} onClose={close} />;

  const status = ledger.noteStatus.get(noteId)!;
  const match = ledger.matchOfNote.get(noteId);
  const proposals = ledger.result.suggestions.filter((s) => s.noteIds.includes(noteId));
  const lines = [...note.lines].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  const open = !match && !note.cancelled;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {categoryLabel(note.category, note.subcategory)}, note {note.noteId}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Dépense du {longDate(note.date)}</span>
            <NoteStatusLabel status={status} className="text-foreground" />
          </DialogDescription>
        </DialogHeader>

        <section>
          <h3 className="text-sm font-semibold mb-1.5">Paiements Jetfly</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {lines.map((l, i) => (
                <tr key={`${l.batchRef}-${i}`}>
                  <td className="py-1.5 pr-3">
                    {l.amount >= 0 ? "Payé" : "Repris"} le {shortDate(l.paymentDate)}
                    <span className="text-muted-foreground"> ({l.batchRef})</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {l.amount >= 0 ? "+" : "−"} {eur(Math.abs(l.amount))}
                  </td>
                </tr>
              ))}
              {lines.length > 1 && (
                <tr>
                  <td className="py-1.5 pr-3 font-medium">Total remboursé</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{eur(note.amount)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {match && (
          <section>
            <h3 className="text-sm font-semibold mb-1.5">Dépense associée</h3>
            <PairStrip
              notes={claimsOf(ledger, match.noteIds)}
              expenses={expensesOf(ledger, match.lineIds)}
              difference={match.difference}
              dense
              footer={
                <>
                  <span className="text-xs text-muted-foreground mr-auto">
                    {match.auto ? "Associée automatiquement" : match.comment?.startsWith("Payée") ? match.comment : "Validée par toi"}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setMode("extend")}>
                    Ajouter une dépense…
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" disabled={busy !== null} onClick={() => run("unlink", () => actions.unlink(match), "Dissociées")}>
                    Dissocier
                  </Button>
                </>
              }
            />
          </section>
        )}

        {proposals.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Propositions</h3>
            {proposals.map((m) => (
              <PairStrip
                key={`${m.type}:${m.lineIds.join(",")}`}
                tone={m.type === "mismatch" || m.type === "date_mismatch" ? "warn" : "todo"}
                notes={claimsOf(ledger, m.noteIds)}
                expenses={expensesOf(ledger, m.type === "complete" && match ? [...match.lineIds, ...m.lineIds] : m.lineIds)}
                difference={m.difference}
                footer={
                  <>
                    <span className="text-sm mr-auto">{m.reason}</span>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          m.lineIds.join(","),
                          () => (m.type === "complete" && match ? actions.extend(match, m.lineIds, 0) : actions.confirm(m)),
                          "Associées",
                        )
                      }
                    >
                      {m.type === "mismatch" ? "Accepter l'écart" : m.type === "complete" ? "Ajouter à l'association" : "Associer"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => run(`no:${m.lineIds.join(",")}`, () => actions.reject(m), "Proposition écartée")}
                    >
                      Ce n'est pas ça
                    </Button>
                  </>
                }
              />
            ))}
          </section>
        )}

        {open && (
          <section className="flex flex-wrap items-center gap-2 border-t pt-4">
            <p className="text-sm text-muted-foreground mr-auto">
              {proposals.length > 0 ? "Aucune proposition ne convient ?" : "Aucune dépense associée."}
            </p>
            <Button size="sm" variant="outline" onClick={() => setMode("pick")}>
              Choisir une dépense…
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("pay")}>
              Payée autrement…
            </Button>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
