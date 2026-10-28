import { useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLedgerActions, type ExpenseRow, type Ledger, type MatchView } from "@/lib/ledger";
import type { Claim } from "@/lib/reconciliation";
import { categoryLabel, eur, shortDate, signedEur } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Building blocks shared by the reconciliation page and the note details. */

export const claimsOf = (l: Ledger, ids: string[]) => ids.map((n) => l.claimById.get(n)).filter(Boolean) as Claim[];
export const expensesOf = (l: Ledger, ids: string[]) => ids.map((id) => l.expenseById.get(id)).filter(Boolean) as ExpenseRow[];

/** Runs an action with a busy flag and a toast on failure. */
export function useRunner() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast({ title: done });
    } catch (e) {
      toast({ title: "Action impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/** Associate a note with expenses picked by hand, when the proposal was wrong. */
export function PickExpenses({
  ledger,
  noteIds,
  onClose,
  extend,
}: {
  ledger: Ledger;
  noteIds: string[] | null;
  onClose: () => void;
  /** Add to this existing association instead of creating a new one. */
  extend?: MatchView;
}) {
  const { associate, extend: extendLink } = useLedgerActions();
  const { busy, run } = useRunner();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const notes = noteIds ? claimsOf(ledger, noteIds) : [];
  const target = notes.reduce((s, c) => s + c.amount, 0);
  const date = notes[0]?.date ?? "";

  const q = query.trim().toLowerCase().replace(",", ".");
  const free = ledger.expenses.filter((e) => {
    const st = ledger.expenseStatus.get(e.id);
    // Credit notes ("Avoir") are offered too, to net them against a purchase.
    return e.amount_eur !== 0 && ["pending", "to_review", "refund", "reimbursed", "no_note"].includes(st ?? "");
  });
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const already = extend ? extend.lineIds.reduce((s, id) => s + (ledger.expenseById.get(id)?.amount_eur ?? 0), 0) : 0;
  // What is still missing: the whole note, or the gap left by the expenses already associated.
  const gap = target - already;
  // Merchants already in the association come first (a credit note at the same hotel…).
  const merchant = (label: string) => label.toUpperCase().replace(/^REMBOURSEMENT - /, "").replace(/[^A-Z]/g, "").slice(0, 8);
  const linkedMerchants = new Set((extend?.lineIds ?? []).map((id) => merchant(ledger.expenseById.get(id)?.description ?? "")));
  const searched = free
    .filter((e) => !extend?.lineIds.includes(e.id))
    .filter((e) => !q || e.description.toLowerCase().includes(q) || Math.abs(e.amount_eur).toFixed(2).includes(q));
  const rank = (list: ExpenseRow[]) =>
    list.sort(
      (a, b) =>
        Number(linkedMerchants.has(merchant(b.description))) - Number(linkedMerchants.has(merchant(a.description))) ||
        Math.abs(a.amount_eur - gap) - Math.abs(b.amount_eur - gap) ||
        days(a.date, date) - days(b.date, date),
    );
  const purchases = rank(searched.filter((e) => e.amount_eur > 0)).slice(0, 40);
  // Credit notes: shown apart, near the note's date unless searched for.
  const credits = rank(searched.filter((e) => e.amount_eur < 0 && (q !== "" || days(e.date, date) <= 120))).slice(0, 10);
  const total = already + [...selected].reduce((s, id) => s + (ledger.expenseById.get(id)?.amount_eur ?? 0), 0);
  const difference = Math.round((total - target) * 100) / 100;

  const close = () => {
    setSelected(new Set());
    setQuery("");
    onClose();
  };

  return (
    <Dialog open={noteIds !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{extend ? "Ajouter une dépense à l'association" : "Choisir la dépense"}</DialogTitle>
          <DialogDescription>
            {notes.map((n) => `${categoryLabel(n.category, n.subcategory)}, note ${n.noteId}, ${shortDate(n.date)} : ${eur(n.amount)}`).join(" ; ")}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Libellé ou montant" className="pl-9" aria-label="Chercher une dépense" />
        </div>
        <p className="text-xs text-muted-foreground">
          {!extend
            ? "Avoirs autour de la date de la note, puis dépenses libres, de la plus proche en montant à la plus éloignée."
            : gap < 0
              ? `L'association dépasse la note de ${eur(-gap)} : un avoir de ce montant comblerait l'écart.`
              : `Il manque ${eur(gap)} pour atteindre le montant de la note.`}
        </p>
        <div className="rounded-lg border divide-y max-h-[50vh] overflow-y-auto">
          {purchases.length === 0 && credits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Aucune dépense libre ne correspond.</p>
          ) : (
            // Credit notes first: there are only a few around the note's date.
            ([["credits", credits], ["purchases", purchases]] as const).flatMap(([kind, list]) => [
              list.length > 0 ? (
                <p key={`h-${kind}`} className="px-4 py-1.5 text-xs font-medium text-muted-foreground bg-muted/40">
                  {kind === "credits" ? "Avoirs et crédits" : "Dépenses"}
                </p>
              ) : null,
              ...list.map((e) => (
              <SelectableRow
                key={e.id}
                checked={selected.has(e.id)}
                onToggle={() => {
                  const next = new Set(selected);
                  if (next.has(e.id)) next.delete(e.id);
                  else next.add(e.id);
                  setSelected(next);
                }}
                date={e.date}
                label={
                  <>
                    <span>{e.description.replace(/^Remboursement - /, "")}</span>
                    <span className="text-muted-foreground"> · {e.source}</span>
                  </>
                }
                amount={e.amount_eur}
              />
              )),
            ])
          )}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className={cn("text-sm tabular-nums", selected.size === 0 ? "text-muted-foreground" : Math.abs(difference) >= 0.005 ? "text-warning" : "text-success")}>
            {selected.size === 0 ? "Aucune dépense choisie" : Math.abs(difference) >= 0.005 ? `Écart ${signedEur(difference)}` : "Montants identiques"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>Annuler</Button>
            <Button
              disabled={selected.size === 0 || busy !== null || !noteIds}
              onClick={() =>
                run(
                  "pick",
                  () =>
                    extend
                      ? extendLink(extend, [...selected], difference)
                      : associate(noteIds!, [...selected], difference, Math.abs(difference) >= 0.005 ? "Écart accepté à l'association" : undefined),
                  "Associées",
                ).then(close)
              }
            >
              {Math.abs(difference) >= 0.005 && selected.size > 0 ? `Associer avec un écart de ${eur(Math.abs(difference))}` : "Associer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Notes settled with another card or in cash. */
export function PayOtherwise({ open, notes, onClose }: { open: boolean; notes: Claim[]; onClose: (done: boolean) => void }) {
  const { payOtherwise } = useLedgerActions();
  const { busy, run } = useRunner();
  const [method, setMethod] = useState<"card" | "cash">("card");
  const [comment, setComment] = useState("");
  const total = notes.reduce((s, n) => s + n.amount, 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {notes.length > 1 ? `${notes.length} notes payées autrement` : "Note payée autrement"}
          </DialogTitle>
          <DialogDescription>
            {notes.length === 1
              ? `${categoryLabel(notes[0].category, notes[0].subcategory)}, note ${notes[0].noteId}, ${shortDate(notes[0].date)} : ${eur(notes[0].amount)}`
              : `Total ${eur(total)}`}
            . Elle{notes.length > 1 ? "s seront associées" : " sera associée"} à une dépense manuelle, hors compte pro.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Moyen de paiement">
            {([["card", "Autre carte"], ["cash", "Espèces"]] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
                variant="outline"
                className={cn(method === value && "border-primary bg-primary/5 text-primary ring-1 ring-primary hover:bg-primary/10 hover:text-primary")}
                onClick={() => setMethod(value)}
              >
                {method === value && <Check className="h-4 w-4 mr-1.5" aria-hidden />}
                {label}
              </Button>
            ))}
          </div>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Précision (facultatif) : carte perso, Visa Revolut…" aria-label="Précision" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)}>Annuler</Button>
          <Button
            disabled={busy !== null || notes.length === 0}
            onClick={() =>
              run("pay", () => payOtherwise(notes, method, comment.trim() || undefined), method === "cash" ? "Marquée payée en espèces" : "Marquée payée avec une autre carte").then(() => {
                setComment("");
                onClose(true);
              })
            }
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SelectableRow({
  checked,
  onToggle,
  date,
  label,
  amount,
}: {
  checked: boolean;
  onToggle: () => void;
  date: string;
  label: ReactNode;
  amount: number;
}) {
  return (
    <label className={cn("flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-muted/50", checked && "bg-primary/5")}>
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{shortDate(date)}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span className="tabular-nums font-medium">{eur(amount)}</span>
    </label>
  );
}
