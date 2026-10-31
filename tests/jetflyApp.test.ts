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
