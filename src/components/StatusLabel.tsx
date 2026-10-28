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

const EXPENSE: Record<ExpenseStatus, [string, Tone]> = {
  reimbursed: ["Remboursée", "ok"],
  discrepancy: ["Écart accepté", "warn"],
  to_review: ["À vérifier", "todo"],
  pending: ["En attente", "wait"],
  personal: ["Perso", "off"],
  neutralized: ["Annulée par un avoir", "off"],
  refund: ["Avoir", "off"],
};

const NOTE: Record<NoteStatus, [string, Tone]> = {
  matched: ["Associée", "ok"],
  discrepancy: ["Écart accepté", "warn"],
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

export const NoteStatusLabel = ({ status, className }: { status: NoteStatus; className?: string }) => (
  <Label text={NOTE[status][0]} tone={NOTE[status][1]} className={className} />
);

export const EXPENSE_STATUS_LABELS = Object.fromEntries(
  Object.entries(EXPENSE).map(([k, [label]]) => [k, label]),
) as Record<ExpenseStatus, string>;
