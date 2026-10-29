/**
 * Email to the Jetfly expense department claiming refused gaps. Pure, so it
 * can be tested; the UI lets the user edit the text before sending it.
 */

export const EXPENSE_DEPARTMENT_EMAIL = "ndf@jetfly.com";

export type MailLanguage = "fr" | "en";

export interface MailItem {
  noteIds: string[];
  /** Expense date and category declared on the note(s). */
  noteDate: string;
  category: string;
  /** What Jetfly paid for these notes, corrections included. */
  paid: number;
  /** Jetfly payments (statement references) that paid the notes. */
  payments: { ref: string; date: string }[];
  /** Bank lines actually charged. */
  charged: { date: string; label: string; amount: number; source: string }[];
  /** Amount claimed: charged − paid. */
  difference: number;
  reason?: string | null;
}

const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const money = (n: number, lang: MailLanguage) =>
  n.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" });

const TEXT = {
  fr: {
    subject: (notes: string) => `Demande de régularisation de notes de frais (${notes})`,
    hello: "Bonjour,",
    intro: (n: number) =>
      n > 1
        ? "En rapprochant mes relevés de notes de frais de mes relevés de carte, j'ai relevé les écarts suivants entre le montant remboursé et le montant réellement débité :"
        : "En rapprochant mes relevés de notes de frais de mes relevés de carte, j'ai relevé l'écart suivant entre le montant remboursé et le montant réellement débité :",
    note: (ids: string[]) => (ids.length > 1 ? `Notes ${ids.join(", ")}` : `Note ${ids[0]}`),
    reimbursed: "Remboursé",
    payment: (ref: string, date: string) => `paiement ${ref} du ${date}`,
    charged: "Montant débité",
    on: (date: string) => `le ${date}`,
    diff: "Écart",
    reason: "Précision",
    total: "Total à régulariser",
    ask: (n: number) =>
      n > 1
        ? "Pourriez-vous vérifier ces montants et les régulariser lors d'un prochain paiement ? Je peux vous transmettre les justificatifs si besoin."
        : "Pourriez-vous vérifier ce montant et le régulariser lors d'un prochain paiement ? Je peux vous transmettre le justificatif si besoin.",
    thanks: "Je vous remercie par avance.",
    bye: "Cordialement,",
  },
  en: {
    subject: (notes: string) => `Expense claim adjustment request (${notes})`,
    hello: "Hello,",
    intro: (n: number) =>
      n > 1
        ? "While checking my expense statements against my card statements, I found the following differences between the amount reimbursed and the amount actually charged:"
        : "While checking my expense statements against my card statements, I found the following difference between the amount reimbursed and the amount actually charged:",
    note: (ids: string[]) => (ids.length > 1 ? `Notes ${ids.join(", ")}` : `Note ${ids[0]}`),
    reimbursed: "Reimbursed",
    payment: (ref: string, date: string) => `payment ${ref} of ${date}`,
    charged: "Amount charged",
    on: (date: string) => `on ${date}`,
    diff: "Difference",
    reason: "Note",
    total: "Total to adjust",
    ask: (n: number) =>
      n > 1
        ? "Could you please check these amounts and adjust them in a next payment? I can send you the receipts if needed."
        : "Could you please check this amount and adjust it in a next payment? I can send you the receipt if needed.",
    thanks: "Thank you in advance.",
    bye: "Best regards,",
  },
};

export function buildDisputeMail(items: MailItem[], lang: MailLanguage): { subject: string; body: string } {
  const t = TEXT[lang];
  const allNotes = items.flatMap((i) => i.noteIds);
  const blocks = items.map((i) => {
    const lines = [`- ${t.note(i.noteIds)} : ${i.category}, ${dmy(i.noteDate)}`];
    const payments = i.payments.map((p) => t.payment(p.ref, dmy(p.date))).join(", ");
    lines.push(`  ${t.reimbursed} : ${money(i.paid, lang)}${payments ? ` (${payments})` : ""}`);
    for (const c of i.charged) {
      lines.push(`  ${t.charged} : ${money(c.amount, lang)} ${t.on(dmy(c.date))} (${c.source}, ${c.label})`);
    }
    lines.push(`  ${t.diff} : ${money(i.difference, lang)}`);
    if (i.reason?.trim()) lines.push(`  ${t.reason} : ${i.reason.trim()}`);
    return lines.join("\n");
  });
  const total = items.reduce((s, i) => s + i.difference, 0);
  const body = [
    t.hello,
    "",
    t.intro(items.length),
    "",
    blocks.join("\n\n"),
    "",
    ...(items.length > 1 ? [`${t.total} : ${money(total, lang)}`, ""] : []),
    `${t.ask(items.length)} ${t.thanks}`,
    "",
    t.bye,
    "",
  ].join("\n");
  // French punctuation spacing only in French.
  const finalBody = lang === "fr" ? body.replace(/ : /g, " : ") : body.replace(/ : /g, ": ");
  return { subject: t.subject(allNotes.join(", ")), body: finalBody };
}

/** mailto: link (bodies stay short enough for mail clients). */
export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
