import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDisputeMail } from "../src/lib/disputeMail.ts";

const item = {
  noteIds: ["595759"],
  noteDate: "2026-09-19",
  category: "Hôtel",
  paid: 173.72,
  payments: [{ ref: "MOS 20260922 0946", date: "2026-09-22" }],
  charged: [{ date: "2026-09-19", label: "MERCURE HOTEL GENEVA", amount: 177.72, source: "AMEX" }],
  difference: 4,
};

test("claim mail lists the note, both amounts and the difference", () => {
  const fr = buildDisputeMail([item], "fr");
  assert.equal(fr.subject, "Demande de régularisation de notes de frais (595759)");
  assert.match(fr.body, /Note 595759 : Hôtel, 19\/09\/2026/);
  assert.match(fr.body, /Remboursé : 173,72\s€ \(paiement MOS 20260922 0946 du 22\/09\/2026\)/);
  assert.match(fr.body, /Montant débité : 177,72\s€ le 19\/09\/2026 \(AMEX, MERCURE HOTEL GENEVA\)/);
  assert.match(fr.body, /Écart : 4,00\s€/);
  assert.doesNotMatch(fr.body, /Total/, "no total for a single item");

  const en = buildDisputeMail([item, { ...item, noteIds: ["599799"], difference: 0.01 }], "en");
  assert.match(en.subject, /\(595759, 599799\)$/);
  assert.match(en.body, /Total to adjust: €4\.01/);
});
