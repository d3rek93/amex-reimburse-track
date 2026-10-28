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
              {pos.toTopUp > 0
                ? `Il manque ${eur(pos.toTopUp)} pour couvrir l'avance`
                : `${eur(-pos.toTopUp)} sont à toi, en plus de l'avance`}
            </p>
            <p className="text-muted-foreground">
              {pos.toTopUp > 0
                ? `Une fois Jetfly à jour de ses remboursements, le compte des frais n'aura pas les ${eur(pos.target)} confiés : c'est ce qu'il faudrait remettre.`
                : `Une fois Jetfly à jour de ses remboursements, le compte des frais aura ${eur(pos.target)} de plus que l'avance confiée : c'est de l'argent à toi (tes apports, tes offres AMEX…), que tu peux récupérer.`}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">Le calcul, pas à pas</h2>
            <table className="w-full text-sm">
              <tbody>
                <Step label="Sur le compte Boursobank des frais" hint={`Solde au ${longDate(pos.snapshot.snapshot_date)}`} value={pos.bankBalance} first />
                <Step
                  label="AMEX : dépenses pas encore prélevées"
                  hint={pos.amexUnpaidSince ? `Depuis le ${longDate(pos.amexUnpaidSince)}, dernier prélèvement AMEX` : "Dernier prélèvement AMEX inconnu"}
                  value={-pos.amexUnpaid}
                />
                <Step label="CB Boursobank : achats pas encore débités" hint="Débit différé de fin de mois" value={-pos.cardUnpaid} />
                <Subtotal label="Disponible aujourd'hui" value={pos.bankBalance - pos.amexUnpaid - pos.cardUnpaid} />
                <Step
                  label="Jetfly te doit encore"
                  hint={`${pos.owedExpenses.length} dépense${pos.owedExpenses.length > 1 ? "s" : ""} pro pas encore remboursée${pos.owedExpenses.length > 1 ? "s" : ""}, détail plus bas`}
                  value={pos.owedByJetfly}
                />
                <Subtotal label="Quand Jetfly sera à jour" value={pos.position} />
                <Step label="Avance confiée par Jetfly" hint="À garder sur le compte" value={-pos.target} />
                <Subtotal label={pos.toTopUp > 0 ? "Manque" : "À toi"} value={-pos.toTopUp} strong />
              </tbody>
            </table>
            <p className="text-sm text-muted-foreground mt-3">
              Tes virements entre tes comptes Boursobank, tes dépenses perso, les écarts acceptés et les offres AMEX sont déjà
              dans le solde du compte : rien à saisir à part.
              {gains > 0.005 && <> Les offres AMEX représentent {eur(gains)} au total.</>} Les opérations encore en cours
              (pas encore comptabilisées par la banque) n'apparaissent qu'à la synchronisation suivante.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">Ce que Jetfly te doit encore ({pos.owedExpenses.length})</h2>
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

function Step({ label, hint, value, first = false }: { label: string; hint: string; value: number; first?: boolean }) {
  return (
    <tr className={cn(!first && "border-t")}>
      <td className="py-2.5 pr-3">
        <p>{label}</p>
        <p className="text-muted-foreground">{hint}</p>
      </td>
      <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
        {first ? "" : value >= 0 ? "+ " : "− "}
        {eur(Math.abs(value))}
      </td>
    </tr>
  );
}

function Subtotal({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={cn("border-t-2 border-foreground/20", strong && "text-base")}>
      <td className="py-2.5 pr-3 font-semibold">= {label}</td>
      <td className={cn("py-2.5 text-right tabular-nums font-semibold whitespace-nowrap", strong && (value >= 0 ? "text-success" : "text-destructive"))}>
        {value < 0 ? "− " : ""}
        {eur(Math.abs(value))}
      </td>
    </tr>
  );
}

export default AdvanceDetails;
