import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { runBankSync } from "@/lib/bankSync";
import { useLedger, useLedgerActions, type Ledger } from "@/lib/ledger";
import { eur, longDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { ledger, isLoading, error } = useLedger();
  const { refresh } = useLedgerActions();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const s = await runBankSync(60);
      await refresh();
      toast({
        title: "Comptes synchronisés",
        description: `${s.imported} nouvelle${s.imported > 1 ? "s" : ""} opération${s.imported > 1 ? "s" : ""}` + (s.errors.length ? ` – ${s.errors.length} erreur(s)` : ""),
        variant: s.errors.length ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "Synchronisation impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppLayout
      title="Tableau de bord"
      actions={
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {ledger?.lastSyncedAt && (
            <span>Synchronisé {formatDistanceToNow(new Date(ledger.lastSyncedAt), { locale: fr, addSuffix: true })}</span>
          )}
          <Button size="sm" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Synchroniser
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="text-destructive">Chargement impossible : {(error as Error).message}</p>
      ) : isLoading || !ledger ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <Content ledger={ledger} />
      )}
    </AppLayout>
  );
}

function Content({ ledger }: { ledger: Ledger }) {
  const { advance, counts } = ledger;
  const owed = advance.owedByJetfly;
  const empty = ledger.expenses.length === 0 && ledger.claims.length === 0;

  if (empty) {
    return (
      <section className="max-w-xl space-y-3">
        <p className="text-lg">Rien à afficher pour l'instant.</p>
        <p className="text-muted-foreground">
          Connecte tes comptes Boursobank et AMEX avec le bouton « Banques », puis importe tes relevés Jetfly (XLS) avec
          « Importer ». L'app associera ensuite tes notes à tes dépenses.
        </p>
      </section>
    );
  }

  const s = (n: number) => (n > 1 ? "s" : "");
  const awaiting = ledger.expenses.reduce(
    (a, e) => (ledger.expenseStatus.get(e.id) === "reimbursed" ? { n: a.n + 1, total: a.total + e.amount_eur } : a),
    { n: 0, total: 0 },
  );
  const tasks = [
    { n: counts.toReview, label: "à vérifier", hint: "Propositions, écarts et remboursements à justifier", to: "/reconcile" },
    { n: counts.missingNotes, label: `note${s(counts.missingNotes)} sans dépense`, hint: "Payées par Jetfly, introuvables sur tes relevés", to: "/reconcile?tab=unmatched" },
    { n: counts.unclaimedExpenses, label: `dépense${s(counts.unclaimedExpenses)} sans note`, hint: "Pas encore déclarées, ou perso", to: "/reconcile?tab=unmatched" },
    { n: counts.batchesWithoutTransfer, label: `paiement${s(counts.batchesWithoutTransfer)} Jetfly sans virement`, hint: "Annoncés dans un relevé, pas vus sur Boursobank", to: "/notes" },
  ];

  return (
    <div className="space-y-10">
      <section className="space-y-2 max-w-3xl">
        <p className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          {owed > 0.005 ? <>Jetfly te doit {eur(owed)}</> : <>Jetfly ne te doit plus rien</>}
        </p>
        <p className="text-muted-foreground">
          {advance.owedExpenses.length} dépense{advance.owedExpenses.length > 1 ? "s" : ""} pro pas encore remboursée
          {advance.owedExpenses.length > 1 ? "s" : ""}.
          {awaiting.n > 0 && (
            <>
              {" "}
              {eur(awaiting.total)} déjà remboursés attendent le prochain relevé Jetfly pour être validés.
            </>
          )}
          {advance.snapshot && (
            <>
              {" "}
              Avance :{" "}
              <Link to="/advance" className="underline underline-offset-4 hover:text-foreground">
                {advance.toTopUp > 0 ? `${eur(advance.toTopUp)} à remettre` : `${eur(-advance.toTopUp)} récupérables`}
              </Link>{" "}
              (solde du {longDate(advance.snapshot.snapshot_date)}).
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">À traiter</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-lg border bg-border overflow-hidden">
          {tasks.map((t) => (
            <Link
              key={t.label}
              to={t.to}
              className="bg-card p-4 hover:bg-muted/60 focus-visible:bg-muted/60 outline-none transition-colors"
            >
              <p className={cn("text-2xl font-semibold tabular-nums", t.n === 0 && "text-muted-foreground")}>{t.n}</p>
              <p className="font-medium">{t.label}</p>
              <p className="text-sm text-muted-foreground">{t.hint}</p>
            </Link>
          ))}
        </div>
      </section>

      <MonthSummary ledger={ledger} />
    </div>
  );
}

type Period = "3m" | "12m" | "ytd" | "last_year" | "all";

const PERIODS: [Period, string][] = [
  ["3m", "3 derniers mois"],
  ["12m", "12 derniers mois"],
  ["ytd", "Année en cours"],
  ["last_year", "Année dernière"],
  ["all", "Depuis le début"],
];

const PERIOD_KEY = "dashboard.period";

const readPeriod = (): Period => {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return PERIODS.some(([p]) => p === v) ? (v as Period) : "3m";
  } catch {
    return "3m";
  }
};

/** First and last month (YYYY-MM) of a period, relative to today. */
function periodRange(period: Period, today = new Date()): [string, string] {
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const back = (months: number) => ym(new Date(today.getFullYear(), today.getMonth() - months, 1));
  const year = today.getFullYear();
  switch (period) {
    case "3m":
      return [back(2), ym(today)];
    case "12m":
      return [back(11), ym(today)];
    case "ytd":
      return [`${year}-01`, ym(today)];
    case "last_year":
      return [`${year - 1}-01`, `${year - 1}-12`];
    case "all":
      return ["0000-00", "9999-99"];
  }
}

interface Totals {
  spent: number;
  matched: number;
  received: number;
  pending: number;
  count: number;
}

const empty = (): Totals => ({ spent: 0, matched: 0, received: 0, pending: 0, count: 0 });
const add = (a: Totals, b: Totals): Totals => ({
  spent: a.spent + b.spent,
  matched: a.matched + b.matched,
  received: a.received + b.received,
  pending: a.pending + b.pending,
  count: a.count + b.count,
});

/** Pro expenses per month over a chosen period: spent, paid back and validated, paid back only, waiting. */
function MonthSummary({ ledger }: { ledger: Ledger }) {
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* preference only */
    }
  };

  const months = new Map<string, Totals>();
  for (const e of ledger.expenses) {
    if (e.is_personal || e.amount_eur <= 0) continue;
    const key = e.date.slice(0, 7);
    const m = months.get(key) ?? empty();
    const status = ledger.expenseStatus.get(e.id);
    m.spent += e.amount_eur;
    m.count += 1;
    if (status === "validated" || status === "discrepancy") m.matched += e.amount_eur;
    else if (status === "reimbursed" || status === "no_note") m.received += e.amount_eur;
    else if (status === "pending" || status === "to_review") m.pending += e.amount_eur;
    months.set(key, m);
  }
  if (months.size === 0) return null;

  const [from, to] = periodRange(period);
  const rows = [...months.entries()].filter(([k]) => k >= from && k <= to).sort((a, b) => b[0].localeCompare(a[0]));
  const total = rows.reduce((t, [, m]) => add(t, m), empty());
  const years = [...new Set(rows.map(([k]) => k.slice(0, 4)))];
  const byYear = years.length > 1;
  const yearTotal = (y: string) => rows.filter(([k]) => k.startsWith(y)).reduce((t, [, m]) => add(t, m), empty());
  const name = (key: string) => {
    const s = new Date(`${key}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", ...(byYear ? {} : { year: "numeric" }) });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const share = (part: number) => (total.spent > 0 ? Math.round((100 * part) / total.spent) : 0);

  const cells = (m: Totals, strong = false) => (
    <>
      <td className={cn("py-2 text-right tabular-nums", strong && "font-semibold")}>{eur(m.spent)}</td>
      <td className={cn("py-2 text-right tabular-nums", strong && "font-semibold")}>{eur(m.matched)}</td>
      <td className={cn("py-2 text-right tabular-nums", strong && "font-semibold")}>{eur(m.received)}</td>
      <td className={cn("py-2 text-right tabular-nums", (strong || m.pending > 0.005) && "font-medium", strong && "font-semibold")}>
        {eur(m.pending)}
      </td>
    </>
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 max-w-4xl">
        <h2 className="text-base font-semibold">Par mois</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Période">
          {PERIODS.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={period === value ? "secondary" : "ghost"}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune dépense pro sur cette période.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3 max-w-4xl">
            {total.count} dépense{total.count > 1 ? "s" : ""} pro pour {eur(total.spent)} : {share(total.matched)} % remboursés et
            validés, {share(total.received)} % remboursés en attente du relevé, {share(total.pending)} % pas encore remboursés.
          </p>
          <div className="overflow-x-auto max-w-4xl">
            <table className="w-full text-sm min-w-[36rem]">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Mois</th>
                  <th className="text-right font-normal py-2">Dépenses pro</th>
                  <th className="text-right font-normal py-2">Remboursées et validées</th>
                  <th className="text-right font-normal py-2">Remboursées, relevé à venir</th>
                  <th className="text-right font-normal py-2">En attente</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <Fragment key={y}>
                    {byYear && (
                      <tr className="border-b bg-muted/40">
                        <td className="py-2 font-semibold">{y}</td>
                        {cells(yearTotal(y), true)}
                      </tr>
                    )}
                    {rows
                      .filter(([k]) => k.startsWith(y))
                      .map(([key, m]) => (
                        <tr key={key} className="border-b">
                          <td className={cn("py-2", byYear && "pl-4")}>{name(key)}</td>
                          {cells(m)}
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr>
                    <td className="py-2 font-semibold">Total</td>
                    {cells(total, true)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </section>
  );
}
