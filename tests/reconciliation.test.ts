// Run: node --experimental-strip-types --test tests/
// Fictional data only; each case mirrors a situation seen in real Jetfly statements.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildClaims,
  looksLikeDateTypo,
  merchantKey,
  reconcile,
  type BankLine,
  type ClaimLine,
} from "../src/lib/reconciliation.ts";

let seq = 0;
const note = (
  noteId: string,
  date: string,
  category: string,
  subcategory: string,
  amount: number,
  batchRef = "MOS 20260901 1000",
  paymentDate = "2026-09-01",
): ClaimLine => ({ noteId, date, category, subcategory, amount, batchRef, paymentDate });
const bank = (date: string, amount: number, label: string, source = "AMEX"): BankLine => ({
  id: `L${++seq}`,
  date,
  amount,
  label,
  source,
});

test("one note, one bank line with the same amount: matched automatically", () => {
  const line = bank("2026-09-02", 98, "SNCF-VOYAGEURS SNCF436 PARIS");
  const r = reconcile({ lines: [line], claimLines: [note("100001", "2026-09-02", "Positionning", "Train", 98)] });
  assert.equal(r.matches.length, 1);
  assert.deepEqual(r.matches[0], {
    ...r.matches[0],
    type: "exact",
    noteIds: ["100001"],
    lineIds: [line.id],
    auto: true,
    confidence: "high",
  });
  assert.deepEqual(r.unmatchedNoteIds, []);
  assert.deepEqual(r.unmatchedLineIds, []);
});

test("corrections are netted per note number", () => {
  const claims = buildClaims([
    note("100002", "2026-06-25", "Positionning", "Taxi", 25.1),
    note("100002", "2026-06-25", "Positionning", "Taxi", -0.01, "MOS 20260713 0950", "2026-07-13"),
    note("100003", "2026-06-29", "Meal", "Lunch", 9),
    note("100003", "2026-06-29", "Meal", "Lunch", -9, "MOS 20260825 1404", "2026-08-25"),
  ]);
  const taxi = claims.find((c) => c.noteId === "100002")!;
  const lunch = claims.find((c) => c.noteId === "100003")!;
  assert.equal(taxi.amount, 25.09);
  assert.equal(taxi.cancelled, false);
  assert.equal(lunch.cancelled, true);

  const line = bank("2026-06-25", 25.09, "TAXI G7 EMV2 CLICHY");
  const r = reconcile({
    lines: [line],
    claimLines: claims.flatMap((c) => c.lines),
  });
  assert.equal(r.matches.length, 1);
  assert.deepEqual(r.matches[0].noteIds, ["100002"]);
  assert.ok(!r.unmatchedNoteIds.includes("100003"), "a cancelled note is not reported as missing");
});

test("several notes for one bank line (split)", () => {
  const line = bank("2026-09-07", 259, "HOTELCOM12345 FR.HOTELS.COM");
  const r = reconcile({
    lines: [line],
    claimLines: [
      note("100004", "2026-09-07", "Hotel", "Night", 244),
      note("100005", "2026-09-07", "Hotel", "Night", 15),
    ],
  });
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].type, "split");
  assert.deepEqual([...r.matches[0].noteIds].sort(), ["100004", "100005"]);
  assert.equal(r.matches[0].auto, true);
});

test("one note over several bank lines (combined)", () => {
  const a = bank("2026-09-05", 301.67, "HOTEL DES BAINS SAILLON");
  const b = bank("2026-09-06", 129.99, "HOTEL DES BAINS SAILLON");
  const r = reconcile({ lines: [a, b], claimLines: [note("100006", "2026-09-06", "Hotel", "Night", 431.66)] });
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].type, "combined");
  assert.deepEqual([...r.matches[0].lineIds].sort(), [a.id, b.id].sort());
});

test("two notes, one possible line: never guessed, both suggested", () => {
  const line = bank("2026-07-27", 30, "SUMUP*MONTAXI-VTC DEAUVILLE");
  const r = reconcile({
    lines: [line],
    claimLines: [
      note("100007", "2026-07-27", "Positionning", "Taxi", 30),
      note("100008", "2026-07-27", "Positionning", "Taxi", 30),
    ],
  });
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.suggestions.map((s) => s.noteIds[0]).sort(), ["100007", "100008"]);
  assert.ok(r.suggestions.every((s) => !s.auto));
});

test("same day, same kind, different amount: discrepancy suggested, not matched", () => {
  const line = bank("2026-09-19", 177.72, "MERCURE HOTEL GENEVA AI GENEVE");
  const r = reconcile({ lines: [line], claimLines: [note("100009", "2026-09-19", "Hotel", "Night", 173.72)] });
  assert.equal(r.matches.length, 0);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].type, "mismatch");
  assert.equal(r.suggestions[0].difference, 4);
});

test("mistyped month on the note: date discrepancy suggested", () => {
  assert.ok(looksLikeDateTypo("2026-06-25", "2026-08-25"));
  assert.ok(looksLikeDateTypo("2026-05-08", "2026-08-05"));
  assert.ok(!looksLikeDateTypo("2026-08-24", "2026-08-25"));
  const line = bank("2026-08-25", 43, "TAXI ADELINO PEREIRA LUXEMBOURG");
  const r = reconcile({ lines: [line], claimLines: [note("100010", "2026-06-25", "Positionning", "Taxi", 43)] });
  assert.equal(r.matches.length, 0);
  assert.equal(r.suggestions[0].type, "date_mismatch");
  assert.equal(r.suggestions[0].confidence, "medium");
});

test("phone bill: declared on invoice date, debited ten days later", () => {
  const line = bank("2026-09-14", 67.99, "PRLV SEPA ORANGE SA", "Prélèvement");
  const r = reconcile({ lines: [line], claimLines: [note("100011", "2026-09-04", "Gsm", "Phone plan", 67.99)] });
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].auto, true);
});

test("a purchase refunded at the same merchant cancels out", () => {
  const buy = bank("2026-09-08", 70, "SNCF-VOYAGEURS SNCF436 PARIS");
  const refund = bank("2026-09-08", -70, "SNCF-VOYAGEURS SNCF436 PARIS");
  const r = reconcile({ lines: [buy, refund], claimLines: [] });
  assert.deepEqual(r.neutralized, [[buy.id, refund.id]]);
  assert.deepEqual(r.unmatchedLineIds, []);
});

test("a claimed purchase is matched before being cancelled by a refund", () => {
  const buy = bank("2026-09-02", 98, "SNCF-VOYAGEURS SNCF436 PARIS");
  const refund = bank("2026-09-03", -98, "SNCF-VOYAGEURS SNCF436 PARIS");
  const r = reconcile({ lines: [buy, refund], claimLines: [note("100012", "2026-09-02", "Positionning", "Train", 98)] });
  assert.deepEqual(r.matches[0].lineIds, [buy.id]);
  assert.deepEqual(r.unmatchedLineIds, [refund.id]);
});

test("payment batches find their transfer, never before the payment date", () => {
  const r = reconcile({
    lines: [],
    claimLines: [
      note("100013", "2026-09-02", "Hotel", "Night", 180, "MOS 20260916 1003", "2026-09-16"),
      note("100014", "2026-09-03", "Meal", "Lunch", 31.27, "MOS 20260903 1421", "2026-09-03"),
      note("100015", "2026-09-03", "Meal", "Dinner", 50, "MOS 20260920 1000", "2026-09-20"),
    ],
    transfers: [
      { id: "T1", date: "2026-09-17", amount: 180 },
      { id: "T2", date: "2026-09-04", amount: 31.27 },
      { id: "T3", date: "2026-09-10", amount: 50 },
    ],
  });
  const byRef = Object.fromEntries(r.batches.map((b) => [b.ref, b.transferId]));
  assert.equal(byRef["MOS 20260916 1003"], "T1");
  assert.equal(byRef["MOS 20260903 1421"], "T2");
  assert.equal(byRef["MOS 20260920 1000"], null);
  assert.deepEqual(r.unmatchedTransferIds, ["T3"]);
});

test("confirmed links are kept and learned merchants break ties", () => {
  const known = bank("2026-09-20", 35.1, "JEAN DUPONT TORINO");
  const other = bank("2026-09-20", 35.1, "MARIE MARTIN TORINO");
  const r = reconcile({
    lines: [known, other],
    claimLines: [note("100016", "2026-09-20", "Positionning", "Taxi", 35.1)],
    rules: { [merchantKey(known.label)]: { taxi: 3 } },
  });
  assert.deepEqual(r.matches[0].lineIds, [known.id]);

  const confirmed = reconcile({
    lines: [known, other],
    claimLines: [note("100016", "2026-09-20", "Positionning", "Taxi", 35.1)],
    confirmed: [{ noteIds: ["100016"], lineIds: [other.id] }],
  });
  assert.equal(confirmed.matches[0].type, "confirmed");
  assert.deepEqual(confirmed.matches[0].lineIds, [other.id]);
});

test("personal lines are never matched", () => {
  const line = { ...bank("2026-09-01", 305.23, "SIXT SAS POS AVRIGNY"), personal: true };
  const r = reconcile({ lines: [line], claimLines: [note("100017", "2026-09-01", "Other", "Car", 305.23)] });
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.unmatchedNoteIds, ["100017"]);
});

test("a rejected pair is never proposed again", () => {
  const line = bank("2026-09-02", 98, "SNCF-VOYAGEURS SNCF436 PARIS");
  const claimLines = [note("100018", "2026-09-02", "Positionning", "Train", 98)];
  const r = reconcile({ lines: [line], claimLines, rejected: [{ noteId: "100018", lineId: line.id }] });
  assert.equal(r.matches.length, 0);
  assert.equal(r.suggestions.length, 0);
  assert.deepEqual(r.unmatchedNoteIds, ["100018"]);
});
