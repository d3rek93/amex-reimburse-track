import { cn } from "@/lib/utils";
import type { ExpenseStatus, NoteStatus } from "@/lib/ledger";

type Tone = "ok" | "warn" | "todo" | "wait" | "off" | "missing";

const TONE: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  todo: "bg-primary",
  wait: "bg-muted-foreground/50",
  off: "bg-transparent border border-muted-foreground/50",
  missing: "bg-destructive",
};

/** One-line summary, used for filters and compact places. */
const EXPENSE: Record<ExpenseStatus, [string, Tone]> = {
  validated: ["Remboursée et validée", "ok"],
  discrepancy: ["Remboursée, écart accepté", "warn"],
  disputed: ["Réclamation en cours", "missing"],
  reimbursed: ["Remboursée, relevé à venir", "ok"],
  no_note: ["Remboursée sans note Jetfly", "missing"],
  to_review: ["À vérifier", "todo"],
  pending: ["En attente de remboursement", "wait"],
  personal: ["Perso", "off"],
  gain: ["Offre AMEX, à moi", "off"],
  neutralized: ["Annulée par un avoir", "off"],
  refund: ["Crédit à classer", "todo"],
};

/** Has the money come back? */
const REFUND: Record<ExpenseStatus, [string, Tone] | null> = {
  validated: ["Reçu", "ok"],
  discrepancy: ["Reçu", "ok"],
  disputed: ["Reçu en partie", "warn"],
  reimbursed: ["Reçu", "ok"],
  no_note: ["Reçu", "ok"],
  to_review: ["En attente", "wait"],
  pending: ["En attente", "wait"],
  personal: null,
  gain: null,
  neutralized: null,
  refund: null,
};

/** Has the Jetfly expense department validated it? */
const VALIDATION: Record<ExpenseStatus, [string, Tone] | null> = {
  validated: ["Validée", "ok"],
  discrepancy: ["Écart accepté", "warn"],
  disputed: ["Réclamation en cours", "missing"],
  reimbursed: ["Relevé à venir", "wait"],
  no_note: ["Absente du relevé", "missing"],
  to_review: ["À vérifier", "todo"],
  pending: ["Pas encore de note", "wait"],
  personal: null,
  gain: null,
  neutralized: null,
  refund: null,
};

const NOTE: Record<NoteStatus, [string, Tone]> = {
  matched: ["Associée", "ok"],
  discrepancy: ["Écart accepté", "warn"],
  disputed: ["Réclamation en cours", "missing"],
  to_review: ["À vérifier", "todo"],
  missing: ["Sans dépense", "missing"],
  cancelled: ["Annulée par Jetfly", "off"],
  before_history: ["Avant tes relevés", "off"],
};

function Label({ text, tone, className }: { text: string; tone: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", className)}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full shrink-0", TONE[tone])} />
      {text}
    </span>
  );
}

export const ExpenseStatusLabel = ({ status, className }: { status: ExpenseStatus; className?: string }) => (
  <Label text={EXPENSE[status][0]} tone={EXPENSE[status][1]} className={className} />
);

/** Two indicators: money received (bank) and validation (Jetfly statement). */
export const ExpenseStatusPair = ({ status, receivedOn, className }: { status: ExpenseStatus; receivedOn?: string; className?: string }) => {
  const refund = REFUND[status];
  const validation = VALIDATION[status];
  if (!refund || !validation) return <ExpenseStatusLabel status={status} className={className} />;
  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <Label text={refund[0] === "Reçu" && receivedOn ? `Reçu le ${receivedOn}` : refund[0]} tone={refund[1]} />
      <Label text={validation[0]} tone={validation[1]} />
    </span>
  );
};

export const NoteStatusLabel = ({ status, className }: { status: NoteStatus; className?: string }) => (
  <Label text={NOTE[status][0]} tone={NOTE[status][1]} className={className} />
);

export const EXPENSE_STATUS_LABELS = Object.fromEntries(
  Object.entries(EXPENSE).map(([k, [label]]) => [k, label]),
) as Record<ExpenseStatus, string>;
