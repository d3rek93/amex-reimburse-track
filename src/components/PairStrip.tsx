import { Check, Equal, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Claim } from "@/lib/reconciliation";
import type { ExpenseRow } from "@/lib/ledger";
import { categoryLabel, eur, shortDate, signedEur } from "@/lib/format";

/**
 * The app's signature element: Jetfly notes on the left, bank lines on the
 * right, and in the middle what ties them — a check when amounts agree, the
 * gap in euros when they do not.
 */
export function PairStrip({
  notes,
  expenses,
  difference,
  tone = "neutral",
  footer,
  dense = false,
  className,
}: {
  notes: Claim[];
  expenses: ExpenseRow[];
  difference: number;
  tone?: "neutral" | "warn" | "todo";
  footer?: ReactNode;
  /** Tighter footer, for long lists. */
  dense?: boolean;
  className?: string;
}) {
  const gap = Math.abs(difference) >= 0.005;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        tone === "warn" && "border-warning/50",
        tone === "todo" && "border-primary/40",
        className,
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch">
        <Side>
          {notes.length === 0 ? (
            <Empty>Aucune note Jetfly</Empty>
          ) : (
            notes.map((n) => (
              <Row
                key={n.noteId}
                left={
                  <>
                    <span className="font-medium">{categoryLabel(n.category, n.subcategory)}</span>
                    <span className="text-muted-foreground"> · note {n.noteId}</span>
                  </>
                }
                date={n.date}
                amount={n.amount}
              />
            ))
          )}
        </Side>
        <div
          className={cn(
            "flex md:flex-col items-center justify-center gap-1 px-3 py-1.5 md:py-0 border-y md:border-y-0 md:border-x text-xs font-medium tabular-nums",
            gap ? "text-warning bg-warning/5" : "text-success bg-success/5",
          )}
          title={gap ? "Écart entre la dépense et la note" : "Les montants concordent"}
        >
          {notes.length > 0 && expenses.length > 0 ? (
            gap ? (
              <span>{signedEur(difference)}</span>
            ) : (
              <Check className="h-4 w-4" aria-label="Montants identiques" />
            )
          ) : (
            <Equal className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
        <Side>
          {expenses.length === 0 ? (
            <Empty>Aucune dépense bancaire</Empty>
          ) : (
            expenses.map((e) => (
              <Row
                key={e.id}
                left={
                  <>
                    <span className="font-medium">{e.description}</span>
                    <span className="text-muted-foreground"> · {e.source ?? "AMEX"}</span>
                    {e.original_currency && e.original_amount ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.original_amount.toLocaleString("fr-FR")} {e.original_currency}
                      </span>
                    ) : null}
                  </>
                }
                date={e.date}
                amount={e.amount_eur}
              />
            ))
          )}
        </Side>
      </div>
      {footer && (
        <div className={cn("border-t px-4 flex flex-wrap items-center gap-2", dense ? "py-1" : "py-2.5")}>{footer}</div>
      )}
    </div>
  );
}

const Side = ({ children }: { children: ReactNode }) => <div className="px-4 py-2.5 space-y-1.5 min-w-0">{children}</div>;
const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground italic">{children}</p>;

function Row({ left, date, amount }: { left: ReactNode; date: string; amount: number }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{shortDate(date)}</span>
      <span className="min-w-0 flex-1 truncate">{left}</span>
      <span className="shrink-0 tabular-nums font-medium">{eur(amount)}</span>
    </div>
  );
}

/** Small "+" between items when building a manual association. */
export const PlusSign = () => <Plus className="h-3 w-3 text-muted-foreground" aria-hidden />;
