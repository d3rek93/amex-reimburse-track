// Run: npm test — fictional files shaped like the real exports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCsv, parseAmexCsv, parseBoursoCsv, parseJetflyStatement } from "../src/lib/importers.ts";

test("Jetfly statement: batches and note lines, as the XLS reader returns them", () => {
  // Payment dates are Excel serial numbers in the real file (46266 = 2026-09-01).
  const rows: unknown[][] = [
    [null, "Expenses / Statement Private Card"],
    [null, "Dear Employee,"],
    [null, null, "PAYMENT DATE", null, null, "PAYMENT REFERENCE / DETAILS", null, null, "AMOUNT IN EUROS"],
    [null, null, 46266, null, null, "ABC 20260901 1014", null, null, 233.5],
    [null, null, null, null, null, "700001 - 31/08/2026 - Hotel - Night", null, null, 218.5],
    [null, null, null, null, null, "700002 - 31/08/2026 - Meal - Dinner", null, null, 15],
    [null, null, "03/09/2026", null, null, "ABC 20260903 1116", null, null, "-9"],
    [null, null, null, null, null, "690000 - 29/06/2026 - Meal - Lunch", null, null, "-9"],
    [null, "Total paid by Jetfly Aviation S.A. - EUROS", null, null, null, null, null, null, 224.5],
    [null, null, null, null, null, "999999 - 01/01/2026 - Hotel - Night", null, null, 1],
  ];
  const { lines, batches } = parseJetflyStatement(rows);
  assert.deepEqual(batches, [
    { ref: "ABC 20260901 1014", paymentDate: "2026-09-01", declaredTotal: 233.5 },
    { ref: "ABC 20260903 1116", paymentDate: "2026-09-03", declaredTotal: -9 },
  ]);
  assert.equal(lines.length, 3, "stops at the total line");
  assert.deepEqual(lines[0], {
    noteId: "700001",
    date: "2026-08-31",
    category: "Hotel",
    subcategory: "Night",
    amount: 218.5,
    batchRef: "ABC 20260901 1014",
    paymentDate: "2026-09-01",
  });
  assert.equal(lines[2].amount, -9);
  assert.equal(lines[2].batchRef, "ABC 20260903 1116");
});

const BOURSO = [
  '"Date Opération";"Date Valeur";Libellé;"Libellé Suggéré";Catégorie;"Catégorie Parente";Solde;Commentaire;"Numéro Compte";"Libellé Compte";Solde;Pointage',
  '2026-09-30;2026-09-30;"VIR SEPA JETFLY AVIATION S.A.";"x";"Virements reçus";"Virements reçus";248,60;;0001;"Compte pro";1000.5;Non',
  '2026-09-22;2026-09-22;"CARTE 21/09/26 RESTO TEST";"x";Alimentation;"Vie quotidienne";-73,00;;4810;ULTIM;-73;Non',
  '2026-09-22;2026-09-22;"CARTE 21/09/26 RESTO TEST";"x";Alimentation;"Vie quotidienne";-73,00;;4810;ULTIM;-73;Non',
  '2026-09-20;2026-09-20;"CARTE 19/09/26 SHOP REFUND";"x";Achats;"Achats";12,00;;4810;ULTIM;12;Non',
  '2026-09-14;2026-09-14;"PRLV SEPA ORANGE SA";Orange;"Téléphonie";"Abonnements";-67,99;;0001;"Compte pro";751.9;Non',
  '2026-09-02;2026-09-02;"VIR Virement depuis BoursoBank";"x";"Mouvements internes créditeurs";"Mouvements internes créditeurs";500,00;;0001;"Compte pro";819.89;Non',
  '2026-09-02;2026-09-02;"PRLV SEPA American Express Carte-France";"x";"Epargne";"Dépenses d\'épargne";"-1 903,04";;0001;"Compte pro";319.89;Non',
  '2026-09-01;2026-09-01;"Relevé différé Carte 4810";"x";"Prélèvements cartes débit différé et cartes crédit conso";"Mouvements internes débiteurs";-533,80;;0001;"Compte pro";2222.93;Non',
].join("\n");

test("Boursobank export: card purchases, debits, Jetfly transfers, balance", () => {
  assert.equal(detectCsv(BOURSO), "bourso");
  const { expenses, transfers, snapshot } = parseBoursoCsv(BOURSO);
  assert.deepEqual(
    expenses.map((e) => [e.date, e.amount, e.source]),
    [
      ["2026-09-21", 73, "Boursobank"],
      ["2026-09-21", 73, "Boursobank"],
      ["2026-09-19", -12, "Boursobank"],
      ["2026-09-14", 67.99, "Prélèvement"],
    ],
  );
  assert.notEqual(expenses[0].fileKey, expenses[1].fileKey, "identical lines stay distinct");
  assert.match(expenses[2].description, /^Remboursement - /);
  assert.deepEqual(transfers.map((t) => [t.date, t.amount]), [["2026-09-30", 248.6]]);
  assert.deepEqual(snapshot, {
    snapshotDate: "2026-09-30",
    balance: 1000.5,
    pendingCard: 134,
    amexLastDebitDate: "2026-09-02",
  });
});

test("AMEX export: purchases and refunds, monthly payment skipped", () => {
  const csv = [
    "Date,Description,Montant",
    '09/25/2026,VERSEMENT / COTISATION,"16,00"',
    '09/08/2026,TRAIN COMPANY  PARIS,"-70,00"',
    '09/08/2026,TRAIN COMPANY  PARIS,"70,00"',
    '08/31/2026,PRELEVEMENT AUTOMATIQUE ENREGISTRE-MERCI,"-3903,04"',
    '09/07/2026,"HOTEL TEST, THESSAL","15,00"',
  ].join("\n");
  assert.equal(detectCsv(csv), "amex");
  const rows = parseAmexCsv(csv);
  assert.deepEqual(
    rows.map((r) => [r.date, r.amount, r.description]),
    [
      ["2026-09-25", 16, "VERSEMENT / COTISATION"],
      ["2026-09-08", -70, "Remboursement - TRAIN COMPANY PARIS"],
      ["2026-09-08", 70, "TRAIN COMPANY PARIS"],
      ["2026-09-07", 15, "HOTEL TEST, THESSAL"],
    ],
  );
});
