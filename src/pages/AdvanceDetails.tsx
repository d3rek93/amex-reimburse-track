import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useLedger } from "@/lib/ledger";
import { eur, longDate, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const AdvanceDetails = () => {
  const { ledger, isLoading } = useLedger();
  const pos = ledger?.advance;
  const gains = ledger
    ? -ledger.expenses.filter((e) => ledger.expenseStatus.get(e.id) === "gain").reduce((s, e) => s + e.amount_eur, 0)
    : 0;

  return (
    <AppLayout title="Avance Jetfly">
      {isLoading || !pos ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : !pos.snapshot ? (
        <p className="text-muted-foreground max-w-xl">
          Le solde du compte Boursobank n'est pas encore connu. Synchronise tes comptes depuis le tableau de bord, ou
          importe un export CSV Boursobank.
        </p>
      ) : (
        <div className="space-y-8 max-w-3xl">
          <section className="space-y-1">
            <p className={cn("text-3xl font-semibold tracking-tight", pos.toTopUp > 0 ? "text-destructive" : "text-success")}>
              {pos.toTopUp > 0 ? `${eur(pos.toTopUp)} à remettre de ta poche` : `${eur(-pos.toTopUp)} récupérables`}
            </p>
            <p className="text-muted-foreground">
              Jetfly t'a confié {eur(pos.target)}. Position actuelle : {eur(pos.position)}.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">Le calcul</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {[
                  { label: "Solde du compte pro", hint: `Au ${longDate(pos.snapshot.snapshot_date)}`, value: pos.bankBalance },
                  { label: "Ce que Jetfly te doit", hint: `${pos.owedExpenses.length} dépense(s) pro sans note associée`, value: pos.owedByJetfly },
                  { label: "Dépenses AMEX pas encore prélevées", hint: pos.amexUnpaidSince ? `Depuis le ${longDate(pos.amexUnpaidSince)}` : "Dernier prélèvement AMEX inconnu", value: -pos.amexUnpaid },
                  { label: "Achats carte Boursobank pas encore débités", hint: "Débit différé de fin de mois", value: -pos.cardUnpaid },
                ].map((r) => (
                  <tr key={r.label}>
                    <td className="py-2.5">
                      <p>{r.label}</p>
                      <p className="text-muted-foreground">{r.hint}</p>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium whitespace-nowrap">
                      {r.value >= 0 ? "+" : "−"} {eur(Math.abs(r.value))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 font-semibold">Position de l'avance</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold">{eur(pos.position)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm text-muted-foreground mt-3">
              Les dépenses perso, les écarts acceptés et les offres AMEX sont déjà dans le solde du compte : rien à saisir à
              part.
              {gains > 0.005 && (
                <>
                  {" "}
                  Tes offres AMEX ({eur(gains)} au total) réduisent tes prélèvements AMEX : cet argent est à toi et fait
                  partie de ce que tu peux récupérer.
                </>
              )}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">Dépenses pro sans note ({pos.owedExpenses.length})</h2>
            {pos.owedExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune.</p>
            ) : (
              <div className="rounded-lg border bg-card divide-y">
                {[...pos.owedExpenses]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e) => (
                    <div key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                      <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{shortDate(e.date)}</span>
                      <span className="flex-1 min-w-0 truncate">{e.description}</span>
                      <span className="tabular-nums font-medium">{eur(e.amount_eur)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  );
};

export default AdvanceDetails;
