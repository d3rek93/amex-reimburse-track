// Fictional demo data for screenshots. Shaped like real usage, no real data.
const uid = "00000000-0000-4000-8000-000000000001";
let n = 0;
const id = () => `10000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const exp = (date, description, amount_eur, source = "AMEX", extra = {}) => ({
  id: id(),
  user_id: uid,
  date,
  description,
  amount_eur,
  original_amount: null,
  original_currency: null,
  source,
  is_personal: false,
  bank_transaction_id: `demo:${n}`,
  ...extra,
});

export const expenses = [
  exp("2026-09-22", "HOTEL ANNEMASSE CENTRE", 144.22),
  exp("2026-09-22", "SNCF-VOYAGEURS PARIS", 98),
  exp("2026-09-22", "UBER TRIP HTTPS://HELP.UB", 57.93),
  exp("2026-09-21", "CARTE 21/09/26 RESTAURANT LE PORT", 73, "Boursobank"),
  exp("2026-09-20", "TAXI MARCO TORINO", 35.1),
  exp("2026-09-19", "MERCURE HOTEL GENEVA AIRPORT", 177.72),
  exp("2026-09-19", "AUTOGRILL TORINO CASELLE", 10.64),
  exp("2026-09-17", "HOTEL CAMPANILE LE BOURGET", 145.7),
  exp("2026-09-16", "REDEVANCES AEROPORT NICE", 437.71),
  exp("2026-09-14", "PRLV SEPA ORANGE SA", 67.99, "Prélèvement"),
  exp("2026-09-08", "SNCF-VOYAGEURS PARIS", 70),
  exp("2026-09-08", "Remboursement - SNCF-VOYAGEURS PARIS", -70),
  exp("2026-09-07", "HOTELCOM12345 FR.HOTELS.COM", 244),
  exp("2026-09-07", "3CPAYMENT*HYATT THESSALONIKI", 15),
  exp("2026-09-06", "BAINS DE SAILLON SA", 129.99),
  exp("2026-09-05", "BAINS DE SAILLON SA", 301.67),
  exp("2026-09-01", "SIXT SAS POS AVRIGNY", 305.23),
  exp("2026-08-25", "TAXI ADELINO LUXEMBOURG", 43),
  exp("2026-08-23", "SNCF-VOYAGEURS PARIS", 73),
  exp("2026-08-23", "SNCF-VOYAGEURS PARIS", 73),
  exp("2026-08-12", "CINEMA UTOPIA", 11.5, "AMEX", { is_personal: true }),
  exp("2026-09-25", "TAXI G7 EMV2 CLICHY", 25.1),
  exp("2026-09-12", "CINEMA UTOPIA", 12),
];

const line = (note_id, line_date, category, subcategory, amount_eur, batch_ref, payment_date) => ({
  note_id, line_date, category, subcategory, amount_eur, batch_ref, payment_date,
});

export const claim_lines = [
  line("596001", "2026-09-22", "Positionning", "Taxi", 57.93, "DEMO 20260924 1026", "2026-09-24"),
  line("596227", "2026-09-22", "Positionning", "Train", 98, "DEMO 20260924 1026", "2026-09-24"),
  line("595959", "2026-09-22", "Hotel", "Night", 144.22, "DEMO 20260924 1026", "2026-09-24"),
  line("595901", "2026-09-21", "Meal", "Dinner", 73, "DEMO 20260922 0946", "2026-09-22"),
  line("595434", "2026-09-20", "Positionning", "Taxi", 35.1, "DEMO 20260922 0946", "2026-09-22"),
  line("595759", "2026-09-19", "Hotel", "Night", 173.72, "DEMO 20260922 0946", "2026-09-22"),
  line("595151", "2026-09-19", "Meal", "Lunch", 10.64, "DEMO 20260922 0946", "2026-09-22"),
  line("594817", "2026-09-17", "Hotel", "Night", 145.7, "DEMO 20260918 0902", "2026-09-18"),
  line("594500", "2026-09-16", "Airport Tax", "Airport Tax", 437.71, "DEMO 20260918 0902", "2026-09-18"),
  line("592645", "2026-09-04", "Gsm", "Phone plan", 67.99, "DEMO 20260909 1003", "2026-09-09"),
  line("592395", "2026-09-07", "Hotel", "Night", 244, "DEMO 20260908 1000", "2026-09-08"),
  line("592398", "2026-09-07", "Hotel", "Night", 15, "DEMO 20260908 1000", "2026-09-08"),
  line("592219", "2026-09-06", "Hotel", "Night", 431.66, "DEMO 20260908 1000", "2026-09-08"),
  line("593336", "2026-09-11", "Other", "Postage", 2.25, "DEMO 20260914 0908", "2026-09-14"),
  line("589008", "2026-06-25", "Positionning", "Taxi", 43, "DEMO 20260826 1137", "2026-08-26"),
  line("588499", "2026-08-24", "Positionning", "Train", 73, "DEMO 20260826 1137", "2026-08-26"),
  line("599799", "2026-09-25", "Positionning", "Taxi", 25.1, "DEMO 20260926 1000", "2026-09-26"),
  line("599799", "2026-09-25", "Positionning", "Taxi", -0.01, "DEMO 20261013 0950", "2026-10-13"),
  line("574421", "2026-06-29", "Meal", "Lunch", 9, "DEMO 20260630 0942", "2026-06-30"),
  line("574421", "2026-06-29", "Meal", "Lunch", -9, "DEMO 20260826 1137", "2026-08-26"),
];

export const claim_batches = [...new Set(claim_lines.map((l) => l.batch_ref))].map((ref) => {
  const ls = claim_lines.filter((l) => l.batch_ref === ref);
  return { ref, payment_date: ls[0].payment_date, declared_total: Math.round(ls.reduce((s, l) => s + l.amount_eur, 0) * 100) / 100 };
});

export const jetfly_transfers = claim_batches
  .filter((b) => b.ref !== "DEMO 20260914 0908")
  .map((b, i) => ({ id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`, date: b.payment_date, amount_eur: b.declared_total, label: "VIR SEPA JETFLY AVIATION S.A.", ignored: false }));

expenses.push(
  exp("2025-11-14", "HOTEL NOVOTEL LYON", 142.5),
  exp("2025-12-03", "SNCF-VOYAGEURS PARIS", 88),
);

// October: no statement yet, paid back by transfers alone.
expenses.push(
  exp("2026-10-20", "CARTE 20/10/26 INTERMARCHE", 31.27, "Boursobank"),
  exp("2026-10-21", "TAXI G7 EMV2 CLICHY", 40),
  exp("2026-10-21", "RESTAURANT LE PORT", 60),
  exp("2026-10-23", "HOTEL MERCURE METZ", 120),
);
jetfly_transfers.push(
  { id: "30000000-0000-4000-8000-000000000001", date: "2026-10-22", amount_eur: 31.27, label: "VIR SEPA JETFLY AVIATION S.A.", ignored: false },
  { id: "30000000-0000-4000-8000-000000000002", date: "2026-10-23", amount_eur: 100, label: "VIR SEPA JETFLY AVIATION S.A.", ignored: false },
  { id: "30000000-0000-4000-8000-000000000003", date: "2026-09-15", amount_eur: 1500, label: "VIR SEPA JETFLY AVIATION S.A.", ignored: false },
);

export const reconciliation_links = [];
export const reconciliation_rejections = [];
export const account_snapshots = [
  { snapshot_date: "2026-09-30", balance_eur: 1240.1, pending_card_eur: 73, amex_last_debit_date: "2026-09-02" },
];
export const bank_sessions = [{ last_synced_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }];
export const user = { id: uid, aud: "authenticated", role: "authenticated", email: "demo@example.com" };
