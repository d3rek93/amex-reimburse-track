import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PairStrip } from "@/components/PairStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PayOtherwise, PickExpenses, SelectableRow, claimsOf, expensesOf, useRunner } from "@/components/ReconcileTools";
import { useLedger, useLedgerActions, type Ledger, type MatchView } from "@/lib/ledger";
import type { Match } from "@/lib/reconciliation";
import { categoryLabel, eur, shortDate, signedEur } from "@/lib/format";
import { cn } from "@/lib/utils";

type Actions = ReturnType<typeof useLedgerActions>;

export default function Reconcile() {
  const { ledger, isLoading, error } = useLedger();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "review";

  return (
    <AppLayout title="Rapprochement">
      {error ? (
        <p className="text-destructive">Chargement impossible : {(error as Error).message}</p>
      ) : isLoading || !ledger ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setParams(v === "review" ? {} : { tab: v }, { replace: true })}>
          <TabsList className="mb-6 h-auto flex-wrap justify-start">
            <TabsTrigger value="review">À vérifier ({ledger.counts.toReview})</TabsTrigger>
            <TabsTrigger value="unmatched">
              Sans correspondance ({ledger.counts.missingNotes + ledger.counts.unclaimedExpenses})
            </TabsTrigger>
            <TabsTrigger value="matched">Associées ({ledger.matches.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="review">
            <Review ledger={ledger} />
          </TabsContent>
          <TabsContent value="unmatched">
            <Unmatched ledger={ledger} />
          </TabsContent>
          <TabsContent value="matched">
            <Matched ledger={ledger} />
          </TabsContent>
        </Tabs>
      )}
    </AppLayout>
  );
}

// ------------------------------------------------------------- helpers


function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

// -------------------------------------------------------------- review

function Review({ ledger }: { ledger: Ledger }) {
  const base = useLedgerActions();
  const { busy, run } = useRunner();
  const { toast } = useToast();
  const [picking, setPicking] = useState<string[] | null>(null);
  const s = ledger.result.suggestions;
  const actions = {
    ...base,
    reject: async (m: Match) => {
      await base.reject(m);
      toast({ title: "Proposition écartée", description: "Elle ne sera plus proposée. La note reste dans « Sans correspondance »." });
    },
  };
  const other = (m: Match) => (
    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setPicking(m.noteIds)}>
      Autre dépense…
    </Button>
  );

  const amountGaps = s.filter((m) => m.type === "mismatch");
  const dateGaps = s.filter((m) => m.type === "date_mismatch");
  const groups = s.filter((m) => m.type === "split" || m.type === "combined");
  const choices = useMemo(() => {
    // Same-amount candidates, gathered per note.
    const byNote = new Map<string, Match[]>();
    for (const m of s.filter((x) => x.type === "exact")) {
      const key = m.noteIds.join(",");
      byNote.set(key, [...(byNote.get(key) ?? []), m]);
    }
    return [...byNote.values()];
  }, [s]);
  const personal = expensesOf(ledger, ledger.personalSuggestions);

  if (s.length === 0 && personal.length === 0) {
    return (
      <p className="text-muted-foreground max-w-xl">
        Rien à vérifier. Les notes et dépenses restantes n'ont aucun candidat : retrouve-les dans « Sans correspondance ».
      </p>
    );
  }

  const key = (m: Match) => `${m.type}:${m.noteIds.join(",")}:${m.lineIds.join(",")}`;

  return (
    <div className="space-y-10">
      <PickExpenses ledger={ledger} noteIds={picking} onClose={() => setPicking(null)} />
      {amountGaps.length > 0 && (
        <Section
          title="Écarts de montant"
          hint="Même jour, même type de dépense, mais les montants diffèrent. Vérifie la note ou le relevé avant de valider."
        >
          {amountGaps.map((m) => (
            <PairStrip
              key={key(m)}
              tone="warn"
              notes={claimsOf(ledger, m.noteIds)}
              expenses={expensesOf(ledger, m.lineIds)}
              difference={m.difference}
              footer={
                <>
                  <span className="text-sm mr-auto">
                    {m.difference > 0
                      ? `La dépense dépasse la note de ${eur(m.difference)} : ce montant reste à ta charge.`
                      : `La note dépasse la dépense de ${eur(-m.difference)}.`}
                  </span>
                  <Button size="sm" disabled={busy !== null} onClick={() => run(key(m), () => actions.confirm(m), "Écart accepté")}>
                    Accepter l'écart
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(key(m), () => actions.reject(m))}>
                    Ce n'est pas la même dépense
                  </Button>
                  {other(m)}
                </>
              }
            />
          ))}
        </Section>
      )}

      {dateGaps.length > 0 && (
        <Section
          title="Dates incohérentes"
          hint="Même montant et même type, mais à des dates éloignées : souvent une faute de frappe sur la note."
        >
          {dateGaps.map((m) => {
            const note = ledger.claimById.get(m.noteIds[0]);
            const exp = ledger.expenseById.get(m.lineIds[0]);
            return (
              <PairStrip
                key={key(m)}
                tone="warn"
                notes={claimsOf(ledger, m.noteIds)}
                expenses={expensesOf(ledger, m.lineIds)}
                difference={0}
                footer={
                  <>
                    <span className="text-sm mr-auto">
                      Note datée du {note && shortDate(note.date)}, dépense du {exp && shortDate(exp.date)}.
                    </span>
                    <Button size="sm" disabled={busy !== null} onClick={() => run(key(m), () => actions.confirm(m, "Date de la note erronée"), "Associées")}>
                      C'est la même dépense
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(key(m), () => actions.reject(m))}>
                      Non
                    </Button>
                    {other(m)}
                  </>
                }
              />
            );
          })}
        </Section>
      )}

      {choices.length > 0 && (
        <Section
          title="Plusieurs dépenses possibles"
          hint="Plusieurs dépenses ont le montant exact de la note. Choisis la bonne."
        >
          {choices.map((list) => (
            <Choice key={list[0].noteIds.join(",")} ledger={ledger} list={list} actions={actions} busy={busy} run={run} onOther={() => setPicking(list[0].noteIds)} />
          ))}
        </Section>
      )}

      {groups.length > 0 && (
        <Section title="Dépenses découpées" hint="Plusieurs notes qui forment ensemble une dépense, ou l'inverse.">
          {groups.map((m) => (
            <PairStrip
              key={key(m)}
              tone="todo"
              notes={claimsOf(ledger, m.noteIds)}
              expenses={expensesOf(ledger, m.lineIds)}
              difference={0}
              footer={
                <>
                  <span className="text-sm mr-auto">{m.reason}</span>
                  <Button size="sm" disabled={busy !== null} onClick={() => run(key(m), () => actions.confirm(m), "Associées")}>
                    Associer
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(key(m), () => actions.reject(m))}>
                    Non
                  </Button>
                  {other(m)}
                </>
              }
            />
          ))}
        </Section>
      )}

      {personal.length > 0 && (
        <Section
          title="Probablement perso"
          hint="Tu as déjà marqué ces commerçants comme perso. Ces dépenses n'ont pas de note Jetfly."
        >
          <div className="rounded-lg border bg-card divide-y">
            {personal.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{shortDate(e.date)}</span>
                <span className="flex-1 min-w-0 truncate">{e.description}</span>
                <span className="tabular-nums font-medium">{eur(e.amount_eur)}</span>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(e.id, () => actions.setPersonal([e.id], true))}>
                  Marquer perso
                </Button>
              </div>
            ))}
          </div>
          {personal.length > 1 && (
            <Button variant="outline" disabled={busy !== null} onClick={() => run("perso-all", () => actions.setPersonal(personal.map((e) => e.id), true), "Dépenses marquées perso")}>
              Tout marquer perso ({personal.length})
            </Button>
          )}
        </Section>
      )}
    </div>
  );
}

function Choice({
  ledger,
  list,
  actions,
  busy,
  run,
  onOther,
}: {
  ledger: Ledger;
  list: Match[];
  actions: Pick<Actions, "confirm" | "reject">;
  onOther: () => void;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const notes = claimsOf(ledger, list[0].noteIds);
  return (
    <div className="rounded-lg border border-primary/40 bg-card">
      <div className="px-4 py-2.5 border-b text-sm">
        {notes.map((n) => (
          <div key={n.noteId} className="flex items-baseline gap-3">
            <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{shortDate(n.date)}</span>
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium">{categoryLabel(n.category, n.subcategory)}</span>
              <span className="text-muted-foreground"> · note {n.noteId}</span>
            </span>
            <span className="tabular-nums font-medium">{eur(n.amount)}</span>
          </div>
        ))}
      </div>
      <div className="divide-y">
        {list.map((m) => {
          const e = ledger.expenseById.get(m.lineIds[0]);
          if (!e) return null;
          return (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{shortDate(e.date)}</span>
              <span className="flex-1 min-w-0 truncate">
                {e.description}
                <span className="text-muted-foreground"> · {e.source}</span>
              </span>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(m.lineIds[0], () => actions.confirm(m), "Associées")}>
                C'est celle-ci
              </Button>
            </div>
          );
        })}
      </div>
      <div className="border-t px-4 py-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={onOther}>
          Autre dépense…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => run(`none:${list[0].noteIds.join(",")}`, async () => {
            for (const m of list) await actions.reject(m);
          })}
        >
          Aucune de ces dépenses
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- unmatched

function Unmatched({ ledger }: { ledger: Ledger }) {
  const actions = useLedgerActions();
  const { busy, run } = useRunner();
  const [query, setQuery] = useState("");
  const [notesSel, setNotesSel] = useState<Set<string>>(new Set());
  const [expSel, setExpSel] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);

  const q = query.trim().toLowerCase().replace(",", ".");
  const matches = (text: string, amount: number) =>
    !q || text.toLowerCase().includes(q) || amount.toFixed(2).includes(q);

  const hidden = ledger.beforeHistoryNoteIds.length;
  const notes = claimsOf(ledger, ledger.result.unmatchedNoteIds.filter((n) => ledger.noteStatus.get(n) === "missing"))
    .filter((c) => matches(`${c.noteId} ${categoryLabel(c.category, c.subcategory)}`, c.amount))
    .sort((a, b) => b.date.localeCompare(a.date));
  const expenses = expensesOf(ledger, ledger.result.unmatchedLineIds)
    // Credit notes too: a purchase and its credit can make up one note.
    .filter((e) => e.amount_eur !== 0 && matches(e.description, e.amount_eur))
    .sort((a, b) => b.date.localeCompare(a.date));

  const notesTotal = [...notesSel].reduce((s, n) => s + (ledger.claimById.get(n)?.amount ?? 0), 0);
  const expTotal = [...expSel].reduce((s, id) => s + (ledger.expenseById.get(id)?.amount_eur ?? 0), 0);
  const difference = Math.round((expTotal - notesTotal) * 100) / 100;
  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };
  const clear = () => {
    setNotesSel(new Set());
    setExpSel(new Set());
  };

  return (
    <div className="space-y-4 pb-24">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Ce qui n'a trouvé aucune correspondance. Coche une ou plusieurs notes et la ou les dépenses qui vont avec, puis
        associe-les. Une note réglée en espèces ou avec une autre carte : coche-la seule, puis « Payée autrement ». Une
        dépense sans note peut aussi être perso.
      </p>
      {hidden > 0 && <HistoryNotice ledger={ledger} hidden={hidden} />}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un libellé, un n° de note, un montant"
          className="pl-9"
          aria-label="Chercher"
        />
      </div>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Column title={`Notes Jetfly sans dépense (${notes.length})`} empty="Toutes les notes ont leur dépense.">
          {notes.map((c) => (
            <SelectableRow
              key={c.noteId}
              checked={notesSel.has(c.noteId)}
              onToggle={() => toggle(notesSel, c.noteId, setNotesSel)}
              date={c.date}
              label={
                <>
                  <span className="font-medium">{categoryLabel(c.category, c.subcategory)}</span>
                  <span className="text-muted-foreground"> · note {c.noteId}</span>
                </>
              }
              amount={c.amount}
            />
          ))}
        </Column>
        <Column title={`Dépenses sans note (${expenses.length})`} empty="Toutes les dépenses pro ont leur note.">
          {expenses.map((e) => (
            <SelectableRow
              key={e.id}
              checked={expSel.has(e.id)}
              onToggle={() => toggle(expSel, e.id, setExpSel)}
              date={e.date}
              label={
                <>
                  <span>{e.description}</span>
                  <span className="text-muted-foreground"> · {e.source}</span>
                </>
              }
              amount={e.amount_eur}
            />
          ))}
        </Column>
      </div>

      <PayOtherwise
        open={paying}
        notes={claimsOf(ledger, [...notesSel])}
        onClose={(done) => {
          setPaying(false);
          if (done) clear();
        }}
      />
      {(notesSel.size > 0 || expSel.size > 0) && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="tabular-nums">
              {notesSel.size} note{notesSel.size > 1 ? "s" : ""} : <strong>{eur(notesTotal)}</strong>
            </span>
            <span className="tabular-nums">
              {expSel.size} dépense{expSel.size > 1 ? "s" : ""} : <strong>{eur(expTotal)}</strong>
            </span>
            {notesSel.size > 0 && expSel.size > 0 && (
              <span className={cn("tabular-nums font-medium", Math.abs(difference) >= 0.005 ? "text-warning" : "text-success")}>
                {Math.abs(difference) >= 0.005 ? `Écart ${signedEur(difference)}` : "Montants identiques"}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={clear}>
                Désélectionner
              </Button>
              {notesSel.size > 0 && expSel.size === 0 && (
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setPaying(true)}>
                  Payée autrement…
                </Button>
              )}
              {expSel.size > 0 && notesSel.size === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => run("perso", () => actions.setPersonal([...expSel], true), "Marquées perso").then(clear)}
                >
                  Marquer perso
                </Button>
              )}
              {notesSel.size > 0 && expSel.size > 0 && (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      "associate",
                      () =>
                        actions.associate(
                          [...notesSel],
                          [...expSel],
                          difference,
                          Math.abs(difference) >= 0.005 ? "Écart accepté à l'association" : undefined,
                        ),
                      "Associées",
                    ).then(clear)
                  }
                >
                  {Math.abs(difference) >= 0.005 ? `Associer avec un écart de ${eur(Math.abs(difference))}` : "Associer"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Notes older than the bank data are hidden; offer to fetch a longer history. */
function HistoryNotice({ ledger, hidden }: { ledger: Ledger; hidden: number }) {
  const { refresh } = useLedgerActions();
  const { busy, run } = useRunner();
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm flex flex-wrap items-center gap-3 max-w-3xl">
      <p className="flex-1 min-w-[16rem]">
        {hidden} note{hidden > 1 ? "s" : ""} Jetfly antérieure{hidden > 1 ? "s" : ""} à tes relevés bancaires
        {ledger.historyStart ? ` (avant le ${shortDate(ledger.historyStart)})` : ""} ne
        {hidden > 1 ? " sont" : " est"} pas affichée{hidden > 1 ? "s" : ""} : leur dépense ne peut pas encore être retrouvée.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() =>
          run("history", async () => {
            const { runBankSync } = await import("@/lib/bankSync");
            const s = await runBankSync(540);
            await refresh();
            if (s.errors.length) throw new Error(s.errors.join(" ; "));
          }, "Historique récupéré")
        }
      >
        {busy === "history" ? "Récupération…" : "Récupérer plus d'historique bancaire"}
      </Button>
    </div>
  );
}

function Column({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="rounded-lg border bg-card divide-y max-h-[65vh] overflow-y-auto">{children}</div>
      )}
    </section>
  );
}

// ------------------------------------------------------------- matched

type Filter = "all" | "auto" | "confirmed" | "gap";

function Matched({ ledger }: { ledger: Ledger }) {
  const actions = useLedgerActions();
  const { busy, run } = useRunner();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(30);

  const firstDate = (m: MatchView) =>
    [...claimsOf(ledger, m.noteIds).map((c) => c.date), ...expensesOf(ledger, m.lineIds).map((e) => e.date)].sort().pop() ?? "";
  const list = ledger.matches
    .filter((m) =>
      filter === "auto" ? m.auto : filter === "confirmed" ? !m.auto : filter === "gap" ? Math.abs(m.difference) >= 0.005 : true,
    )
    .sort((a, b) => firstDate(b).localeCompare(firstDate(a)));

  const filters: [Filter, string][] = [
    ["all", "Toutes"],
    ["auto", "Automatiques"],
    ["confirmed", "Validées par toi"],
    ["gap", "Avec écart"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer">
        {filters.map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>
            {label}
          </Button>
        ))}
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Aucune association.</p>}
      {list.slice(0, limit).map((m) => (
        <PairStrip
          key={`${m.linkId ?? "auto"}:${m.noteIds.join(",")}:${m.lineIds.join(",")}`}
          notes={claimsOf(ledger, m.noteIds)}
          expenses={expensesOf(ledger, m.lineIds)}
          difference={m.difference}
          dense
          footer={
            <>
              <span className="text-xs text-muted-foreground mr-auto" title={m.reason}>
                {m.auto
                  ? "Automatique"
                  : m.comment?.startsWith("Payée")
                    ? m.comment
                    : Math.abs(m.difference) >= 0.005
                      ? "Validée par toi, écart accepté"
                      : "Validée par toi"}
              </span>
              <Button size="sm" variant="ghost" className="h-7" disabled={busy !== null} onClick={() => run(m.linkId ?? m.lineIds.join(","), () => actions.unlink(m), "Dissociées")}>
                Dissocier
              </Button>
            </>
          }
        />
      ))}
      {list.length > limit && (
        <Button variant="outline" onClick={() => setLimit((l) => l + 50)}>
          Afficher plus ({list.length - limit} restantes)
        </Button>
      )}
    </div>
  );
}
