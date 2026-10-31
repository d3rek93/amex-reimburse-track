import { useMemo, useState } from "react";
import { Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { MerchantRefund } from "@/components/ReconcileTools";
import { AppLayout } from "@/components/AppLayout";
import { ExpenseStatusPair, EXPENSE_STATUS_LABELS } from "@/components/StatusLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLedger, useLedgerActions, type ExpenseStatus } from "@/lib/ledger";
import { dayDate, eur, shortDate } from "@/lib/format";

const PAGE = 100;

export default function ExpensesPage() {
  const { ledger, isLoading, error } = useLedger();
  const actions = useLedgerActions();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ExpenseStatus>("all");
  const [source, setSource] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [refunding, setRefunding] = useState<string | null>(null);
  const canRefund = (id: string) => ["pending", "to_review"].includes(ledger?.expenseStatus.get(id) ?? "") && (ledger?.expenseById.get(id)?.amount_eur ?? 0) > 0;

  const rows = useMemo(() => {
    if (!ledger) return [];
    const q = query.trim().toLowerCase().replace(",", ".");
    return ledger.expenses
      .filter((e) => {
        if (status !== "all" && ledger.expenseStatus.get(e.id) !== status) return false;
        if (source !== "all" && (e.source ?? "AMEX") !== source) return false;
        if (from && e.date < from) return false;
        if (to && e.date > to) return false;
        if (!q) return true;
        const notes = ledger.matchOfExpense.get(e.id)?.noteIds.join(" ") ?? "";
        return `${e.description} ${notes}`.toLowerCase().includes(q) || Math.abs(e.amount_eur).toFixed(2).includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger, query, status, source, from, to]);

  const total = rows.reduce((s, e) => s + e.amount_eur, 0);
  const received = (id: string) => {
    const r = ledger?.reimbursementOf.get(id);
    return r ? shortDate(r.date) : undefined;
  };
  const sources = ledger ? [...new Set(ledger.expenses.map((e) => e.source ?? "AMEX"))].sort() : [];

  const togglePersonal = async (id: string, personal: boolean) => {
    try {
      await actions.setPersonal([id], personal);
    } catch (e) {
      toast({ title: "Modification impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <AppLayout
      title="Dépenses"
      actions={
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-2" /> Ajouter une dépense
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive">Chargement impossible : {(error as Error).message}</p>
      ) : isLoading || !ledger ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Libellé, montant, n° de note" className="pl-9" aria-label="Chercher" />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-44" aria-label="Statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{EXPENSE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-40" aria-label="Source"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sources</SelectItem>
                {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="from" className="font-normal text-muted-foreground">Du</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="to" className="font-normal text-muted-foreground">au</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>

          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length} dépense{rows.length > 1 ? "s" : ""}, total {eur(total)}
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground">Aucune dépense ne correspond à ces filtres.</p>
          ) : (
            <>
            <ul className="md:hidden rounded-lg border bg-card divide-y">
              {rows.slice(0, limit).map((e) => {
                const st = ledger.expenseStatus.get(e.id)!;
                const match = ledger.matchOfExpense.get(e.id);
                return (
                  <li key={e.id} className="px-4 py-2.5 text-sm space-y-1">
                    <div className="flex items-baseline gap-3">
                      <span className="flex-1 min-w-0 truncate">{e.description}</span>
                      <span className="tabular-nums font-medium">{eur(e.amount_eur)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
                      <span className="tabular-nums">{dayDate(e.date)}</span>
                      <span>{e.source ?? "AMEX"}</span>
                      {match && <span className="tabular-nums">note {match.noteIds.join(", ")}</span>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <ExpenseStatusPair status={st} receivedOn={received(e.id)} />
                      {canRefund(e.id) && (
                        <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => setRefunding(e.id)}>
                          Remboursée…
                        </Button>
                      )}
                      <label className="flex items-center gap-2 text-muted-foreground">
                        Perso
                        <Switch checked={e.is_personal} onCheckedChange={(v) => void togglePersonal(e.id, v)} />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="text-left font-normal px-4 py-2">Date</th>
                    <th className="text-left font-normal px-4 py-2">Libellé</th>
                    <th className="text-right font-normal px-4 py-2">Montant</th>
                    <th className="text-left font-normal px-4 py-2">Remboursement et validation</th>
                    <th className="text-left font-normal px-4 py-2">Note</th>
                    <th className="text-left font-normal px-4 py-2">Perso</th>
                    <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.slice(0, limit).map((e) => {
                    const st = ledger.expenseStatus.get(e.id)!;
                    const match = ledger.matchOfExpense.get(e.id);
                    return (
                      <tr key={e.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{dayDate(e.date)}</td>
                        <td className="px-4 py-2 max-w-[22rem]">
                          <p className="truncate">{e.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {e.source ?? "AMEX"}
                            {e.original_currency && e.original_amount ? ` · ${e.original_amount.toLocaleString("fr-FR")} ${e.original_currency}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">{eur(e.amount_eur)}</td>
                        <td className="px-4 py-2"><ExpenseStatusPair status={st} receivedOn={received(e.id)} /></td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{match?.noteIds.join(", ") || ""}</td>
                        <td className="px-4 py-2">
                          <Switch
                            checked={e.is_personal}
                            onCheckedChange={(v) => void togglePersonal(e.id, v)}
                            aria-label={e.is_personal ? "Dépense perso : rendre pro" : "Marquer comme perso"}
                          />
                        </td>
                        <td className="px-2 py-2">
                          {canRefund(e.id) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Remboursée par le commerçant"
                              title="Remboursée par le commerçant (virement)"
                              onClick={() => setRefunding(e.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {e.source === "Manuel" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={e.amount_eur < 0 ? "Annuler ce remboursement" : "Supprimer cette dépense"}
                              title={e.amount_eur < 0 ? "Annuler ce remboursement" : "Supprimer cette dépense"}
                              onClick={() => void actions.deleteExpense(e.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
          {rows.length > limit && (
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
              Afficher plus ({rows.length - limit} restantes)
            </Button>
          )}
        </div>
      )}
      <AddExpenseDialog open={adding} onOpenChange={setAdding} />
      <MerchantRefund
        expenses={refunding && ledger?.expenseById.get(refunding) ? [ledger.expenseById.get(refunding)!] : null}
        onClose={() => setRefunding(null)}
      />
    </AppLayout>
  );
}

/** For expenses paid another way (cash, other card) so a note can be matched to them. */
function AddExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { addExpense } = useLedgerActions();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const value = parseFloat(amount.replace(",", "."));
  const valid = date && description.trim() && Number.isFinite(value) && value !== 0;

  const save = async () => {
    setSaving(true);
    try {
      await addExpense({ date, description: description.trim(), amount_eur: Math.round(value * 100) / 100 });
      toast({ title: "Dépense ajoutée" });
      setDescription("");
      setAmount("");
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ajout impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une dépense</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pour une dépense payée en espèces ou avec une autre carte : elle pourra ensuite être associée à sa note Jetfly.
        </p>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="add-date">Date</Label>
            <Input id="add-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="add-desc">Libellé</Label>
            <Input id="add-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pressing, espèces…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="add-amount">Montant en euros</Label>
            <Input id="add-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="31,70" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={!valid || saving}>Ajouter la dépense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
