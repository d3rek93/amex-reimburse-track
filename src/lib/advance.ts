export const TARGET_ADVANCE = 1500;
const ACCOUNT_SOURCES = ["AMEX", "Boursobank", "Prélèvement"];

export interface AccountSnapshot {
  snapshot_date: string;
  balance_eur: number;
  pending_card_eur: number;
  amex_last_debit_date: string | null;
}

export interface AdvanceExpense {
  id: string;
  date: string;
  description: string;
  amount_eur: number;
  reimbursed_amount: number;
  reimbursement_status: string;
  is_personal: boolean;
  considered_complete: boolean;
  source: string | null;
}

export interface AdvancePosition {
  target: number;
  snapshot: AccountSnapshot | null;
  bankBalance: number;
  owedByJetfly: number;
  owedExpenses: AdvanceExpense[];
  amexUnpaid: number;
  amexUnpaidSince: string | null;
  cardUnpaid: number;
  /** Remboursements Jetfly reçus sur le compte pro pour des dépenses payées carte perso : argent à toi */
  personalCardReimbursed: number;
  position: number;
  /** > 0 : à remettre ; < 0 : récupérable */
  toTopUp: number;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** AMEX payment lines (the monthly automatic debit) are not expenses. */
export const isAmexPaymentLine = (description: string) =>
  /PRELEVEMENT AUTOMATIQUE/i.test(description);

export function computeAdvancePosition(
  snapshot: AccountSnapshot | null,
  expenses: AdvanceExpense[],
  target = TARGET_ADVANCE,
): AdvancePosition {
  const bankBalance = snapshot ? Number(snapshot.balance_eur) : 0;
  const cardUnpaid = snapshot ? Number(snapshot.pending_card_eur) : 0;

  const owedExpenses = expenses.filter(
    (e) =>
      !e.is_personal &&
      !e.considered_complete &&
      e.amount_eur > 0 &&
      (e.reimbursement_status === "pending" || e.reimbursement_status === "partial") &&
      ACCOUNT_SOURCES.includes(e.source || "AMEX"),
  );
  const owedByJetfly = owedExpenses.reduce(
    (s, e) => s + Math.max(0, e.amount_eur - (e.reimbursed_amount || 0)),
    0,
  );

  // AMEX debit on Boursobank happens ~2 days after the statement closes.
  const amexUnpaidSince = snapshot?.amex_last_debit_date
    ? addDays(snapshot.amex_last_debit_date, -2)
    : null;
  const amexUnpaid = amexUnpaidSince
    ? expenses
        .filter(
          (e) =>
            (e.source || "AMEX") === "AMEX" &&
            e.date >= amexUnpaidSince &&
            !isAmexPaymentLine(e.description),
        )
        .reduce((s, e) => s + e.amount_eur, 0)
    : 0;

  // Remboursements carte perso : l'utilisateur les revire sur son compte perso,
  // donc l'entrée et la sortie s'annulent déjà dans le solde réel. Affiché à titre info seulement.
  const personalCardReimbursed = 0;

  const position = bankBalance + owedByJetfly - amexUnpaid - cardUnpaid;
  return {
    target,
    snapshot,
    bankBalance,
    owedByJetfly,
    owedExpenses,
    amexUnpaid,
    amexUnpaidSince,
    cardUnpaid,
    personalCardReimbursed,
    position,
    toTopUp: target - position,
  };
}
