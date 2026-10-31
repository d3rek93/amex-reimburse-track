import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJetflyApp, parseMoney } from "../src/lib/jetflyApp.ts";

const today = new Date("2026-10-31T12:00:00");

test("money in English and French formats", () => {
  assert.equal(parseMoney("1,229.61"), 1229.61);
  assert.equal(parseMoney("1 229,61"), 1229.61);
  assert.equal(parseMoney("447.20"), 447.2);
  assert.equal(parseMoney("16.00"), 16);
});

test("expanded payment as the OCR reads it (one field per line)", () => {
  const text = `11:49
Reimbursements
Pending €311.82
October 2026
30 Oct
€1,229.61
#00606355
29 Oct 2026
€447.20
#00606439
30 Oct 2026
€154.30
#00606440
30 Oct 2026
€87.80
#00606441
30 Oct 2026
€540.31
Transfer details
29 Oct €265.00 >
28 Oct €16.00 >`;
  const [p, ...rest] = parseJetflyApp(text, today);
  assert.equal(rest.length, 0);
  assert.equal(p.notes.length, 4);
  assert.deepEqual(p.notes[0], { noteId: "606355", date: "2026-10-29", amount: 447.2 });
  assert.equal(p.total, 1229.61);
  assert.equal(p.date, "2026-10-30");
});

test("header total differs from the notes captured (screenshot cut)", () => {
  const [p] = parseJetflyApp(`30 Oct\n€1,229.61\n#00606355\n29 Oct 2026\n€447.20`, today);
  assert.equal(p.total, 1229.61);
  assert.equal(p.notes.length, 1);
});

test("rows read side by side, several payments, French app", () => {
  const text = `octobre 2026
30 oct. 1 229,61 €
#00606355 447,20 €
29 oct. 2026
#00606439 154,30 €
30 oct. 2026
22 oct. 473,68 €
#00605999 473,68 €
21 oct. 2026
28 oct. 16,00 €`;
  const ps = parseJetflyApp(text, today);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].date, "2026-10-30");
  assert.equal(ps[0].total, 1229.61);
  assert.equal(ps[0].notes.length, 2);
  assert.deepEqual(ps[1], { date: "2026-10-22", total: 473.68, notes: [{ noteId: "605999", date: "2026-10-21", amount: 473.68 }] });
});

test("December payment under a January section", () => {
  const ps = parseJetflyApp(`January 2027\n30 Dec €10.00\n#00610000 €10.00\n29 Dec 2026`, today);
  assert.equal(ps[0].date, "2026-12-30");
});

test("misread header: notes of the next payment are split off, not merged into the one above", () => {
  const text = `21 Oct €59.99
#00604100 €59.99
20 Oct 2026
2O 0ct €208.68 >
#00604050 €208.68
19 Oct 2026`;
  // "2O 0ct" (letters for digits) cannot be read as a date: the payment keeps an empty date.
  const ps = parseJetflyApp(text, today);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[0].notes.map((n) => n.noteId), ["604100"]);
  assert.equal(ps[1].total, 208.68);
  assert.equal(ps[1].date, "");
  assert.equal(ps[1].notes[0].date, "2026-10-19");
});

test("header lost entirely: overflow split by the totals", () => {
  const text = `21 Oct €59.99
#00604100 €59.99
20 Oct 2026
#00604050 €208.68
19 Oct 2026`;
  const ps = parseJetflyApp(text, today);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].total, 59.99);
  assert.deepEqual(ps[1], { date: "", total: 208.68, notes: [{ noteId: "604050", date: "2026-10-19", amount: 208.68 }] });
});

test("OCR slips: 0ct, stuck digits", () => {
  const [p] = parseJetflyApp(`30 0ct €265.00\n#00606116 €265.00\n28Oct 2026`, today);
  assert.equal(p.date, "2026-10-30");
  assert.equal(p.notes[0].date, "2026-10-28");
});

test("bank transfer of each payment: the app date is when Jetfly sent it", async () => {
  const { matchTransfers } = await import("../src/lib/jetflyApp.ts");
  const payments = [
    { date: "2026-10-23", total: 38.1, notes: [] },
    { date: "2026-10-22", total: 473.68, notes: [] },
    { date: "", total: 208.68, notes: [{ noteId: "1", date: "2026-10-19", amount: 208.68 }] },
  ];
  const transfers = [
    { id: "a", date: "2026-10-26", amount_eur: 38.1 },
    { id: "b", date: "2026-10-26", amount_eur: 473.68 },
    { id: "c", date: "2026-10-20", amount_eur: 208.68 },
    { id: "d", date: "2026-09-26", amount_eur: 38.1 },
  ];
  assert.deepEqual(matchTransfers(payments, transfers).map((t) => t?.id), ["a", "b", "c"]);
});
