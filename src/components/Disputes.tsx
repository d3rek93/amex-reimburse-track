import { useMemo, useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { PairStrip } from "@/components/PairStrip";
import { useRunner } from "@/components/ReconcileTools";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLedgerActions, type DisputeView, type Ledger, type MatchView } from "@/lib/ledger";
import type { Match } from "@/lib/reconciliation";
import { EXPENSE_DEPARTMENT_EMAIL, buildDisputeMail, mailtoLink, type MailLanguage, type MailItem } from "@/lib/disputeMail";
import { categoryLabel, eur, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Refuser l'écart": opens a claim, with an optional reason that goes into the email. */
export function RefuseGap({ match, onClose }: { match: Match | MatchView | null; onClose: (done: boolean) => void }) {
  const { dispute } = useLedgerActions();
  const { busy, run } = useRunner();
  const [reason, setReason] = useState("");
  return (
    <Dialog open={match !== null} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refuser l'écart</DialogTitle>
          <DialogDescription>
            {match && `Jetfly t'a remboursé ${eur(Math.abs(match.difference))} de moins que la dépense.`} La note et la dépense
            passent en « Réclamation en cours » ; tu pourras préparer le mail au service notes de frais depuis l'onglet
            Réclamations.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor="dispute-reason" className="text-sm font-medium">
            Précision pour le mail (facultatif)
          </label>
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. : taxe de séjour payée sur place, figurant sur la facture jointe"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)}>
            Annuler
          </Button>
          <Button
            disabled={busy !== null || !match}
            onClick={() =>
              run("dispute", () => dispute(match!, reason.trim() || undefined), "Réclamation ouverte").then(() => {
                setReason("");
                onClose(true);
              })
            }
          >
            Ouvrir une réclamation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Data the email needs, from a claim. */
function mailItem(d: DisputeView): MailItem {
  const payments = new Map<string, string>();
  for (const n of d.notes) for (const l of n.lines) payments.set(l.batchRef, l.paymentDate);
  const first = d.notes[0];
  return {
    noteIds: d.note_ids,
    noteDate: first?.date ?? d.expenses[0]?.date ?? d.created_at,
    category: first ? categoryLabel(first.category, first.subcategory) : "Note",
    paid: d.notes.reduce((s, n) => s + n.amount, 0),
    payments: [...payments.entries()].map(([ref, date]) => ({ ref, date })).sort((a, b) => a.date.localeCompare(b.date)),
    charged: d.expenses.map((e) => ({ date: e.date, label: e.description, amount: e.amount_eur, source: e.source ?? "AMEX" })),
    difference: d.currentDifference,
    reason: d.reason,
  };
}

export function DisputeMail({ disputes, onClose }: { disputes: DisputeView[] | null; onClose: () => void }) {
  const { markDisputesSent } = useLedgerActions();
  const { busy, run } = useRunner();
  const { toast } = useToast();
  const [lang, setLang] = useState<MailLanguage>("fr");
  const [to, setTo] = useState(EXPENSE_DEPARTMENT_EMAIL);
  const generated = useMemo(() => (disputes ? buildDisputeMail(disputes.map(mailItem), lang) : { subject: "", body: "" }), [disputes, lang]);
  const [edited, setEdited] = useState<{ key: string; subject: string; body: string } | null>(null);
  const key = `${lang}:${disputes?.map((d) => d.id).join(",")}`;
  const subject = edited?.key === key ? edited.subject : generated.subject;
  const body = edited?.key === key ? edited.body : generated.body;
  const edit = (patch: Partial<{ subject: string; body: string }>) => setEdited({ key, subject, body, ...patch });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      toast({ title: "Texte copié", description: "Objet et message, prêts à coller." });
    } catch {
      toast({ title: "Copie impossible", description: "Sélectionne le texte et copie-le à la main.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={disputes !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mail au service notes de frais</DialogTitle>
          <DialogDescription>
            {disputes?.length ?? 0} réclamation{(disputes?.length ?? 0) > 1 ? "s" : ""}. Relis et ajuste le texte avant de
            l'envoyer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2" role="radiogroup" aria-label="Langue du mail">
          {([["fr", "Français"], ["en", "English"]] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              role="radio"
              aria-checked={lang === value}
              variant="outline"
              className={cn(lang === value && "border-primary bg-primary/5 text-primary ring-1 ring-primary hover:bg-primary/10 hover:text-primary")}
              onClick={() => setLang(value)}
            >
              {lang === value && <Check className="h-4 w-4 mr-1.5" aria-hidden />}
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="mail-to" className="text-sm font-medium">À</label>
            <Input id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="mail-subject" className="text-sm font-medium">Objet</label>
            <Input id="mail-subject" value={subject} onChange={(e) => edit({ subject: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="mail-body" className="text-sm font-medium">Message</label>
            <Textarea id="mail-body" value={body} onChange={(e) => edit({ body: e.target.value })} rows={16} className="font-[inherit] text-sm" />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void copy()}>
              <Copy className="h-4 w-4 mr-2" /> Copier
            </Button>
            <Button variant="outline" asChild>
              <a href={mailtoLink(to, subject, body)}>
                <Mail className="h-4 w-4 mr-2" /> Ouvrir dans ma messagerie
              </a>
            </Button>
          </div>
          <Button
            disabled={busy !== null || !disputes?.length}
            onClick={() => run("sent", () => markDisputesSent(disputes!.map((d) => d.id)), "Réclamation marquée envoyée").then(onClose)}
          >
            Marquer comme envoyée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Open claims: follow-up, email, closing. */
export function DisputesTab({ ledger }: { ledger: Ledger }) {
  const actions = useLedgerActions();
  const { busy, run } = useRunner();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mailFor, setMailFor] = useState<DisputeView[] | null>(null);
  const list = ledger.disputes;
  const unsent = list.filter((d) => !d.sent_at && !d.settled);

  if (list.length === 0) {
    return (
      <p className="text-muted-foreground max-w-xl">
        Aucune réclamation en cours. Sur un écart qui ne te convient pas, « Refuser l'écart » en ouvre une : l'app prépare
        ensuite le mail au service notes de frais.
      </p>
    );
  }

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const chosen = list.filter((d) => selected.has(d.id));
  const total = list.filter((d) => !d.settled).reduce((s, d) => s + d.currentDifference, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground mr-auto">
          {eur(total)} réclamés au total. Coche les réclamations à inclure dans un même mail.
        </p>
        {unsent.length > 0 && chosen.length === 0 && (
          <Button variant="outline" size="sm" onClick={() => setMailFor(unsent)}>
            <Mail className="h-4 w-4 mr-2" /> <span className="sm:hidden">Mail des non envoyées ({unsent.length})</span>
            <span className="hidden sm:inline">Préparer le mail des réclamations non envoyées ({unsent.length})</span>
          </Button>
        )}
        {chosen.length > 0 && (
          <Button size="sm" onClick={() => setMailFor(chosen)}>
            <Mail className="h-4 w-4 mr-2" /> Préparer le mail ({chosen.length})
          </Button>
        )}
      </div>

      {list.map((d) => (
        <div key={d.id} className="flex gap-3 items-start">
          <Checkbox
            className="mt-3"
            checked={selected.has(d.id)}
            onCheckedChange={() => toggle(d.id)}
            aria-label={`Inclure la réclamation ${d.note_ids.join(", ")}`}
            disabled={d.settled}
          />
          <PairStrip
            className="flex-1 min-w-0"
            tone={d.settled ? "neutral" : "warn"}
            notes={d.notes}
            expenses={d.expenses}
            difference={d.currentDifference}
            footer={
              <>
                <span className="text-sm mr-auto">
                  {d.settled ? (
                    <span className="text-success font-medium">Régularisée par Jetfly : l'écart est comblé.</span>
                  ) : d.sent_at ? (
                    <>Réclamation envoyée le {shortDate(d.sent_at)}, en attente de Jetfly.</>
                  ) : (
                    <>Ouverte le {shortDate(d.created_at)}, mail pas encore envoyé.</>
                  )}
                  {d.reason ? <span className="block text-muted-foreground">{d.reason}</span> : null}
                </span>
                {d.settled ? (
                  <Button size="sm" disabled={busy !== null} onClick={() => run(d.id, () => actions.closeDispute(d, "settled"), "Réclamation close")}>
                    Clore
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setMailFor([d])}>
                      Préparer le mail
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => run(d.id, () => actions.closeDispute(d, "accepted"), "Réclamation abandonnée, écart accepté")}
                    >
                      Abandonner
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => run(d.id, () => actions.deleteDispute(d.id), "Réclamation supprimée")}
                    >
                      Supprimer
                    </Button>
                  </>
                )}
              </>
            }
          />
        </div>
      ))}

      <DisputeMail
        disputes={mailFor}
        onClose={() => {
          setMailFor(null);
          setSelected(new Set());
        }}
      />
    </div>
  );
}
