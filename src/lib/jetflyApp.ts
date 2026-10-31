/**
 * Payments read from the Jetfly expense app ("Reimbursements" screen), from a
 * screenshot's text (OCR or iPhone Live Text). Pure, so it can be tested.
 *
 *   October 2026
 *   30 Oct              €1,229.61
 *   #00606355           €447.20
 *   29 Oct 2026
 *   ...
 *
 * They are stored as provisional claim lines (batch ref "APP-…") until the
 * monthly statement arrives and replaces them.
 */

export const APP_BATCH_PREFIX = "APP-";

export interface AppNote {
  noteId: string;
  /** Date shown under the note number (submission date, YYYY-MM-DD). */
  date: string;
  amount: number;
}

export interface AppPayment {
  /** Transfer date shown on the header row (YYYY-MM-DD). */
  date: string;
  /** Header amount, or the notes' sum when the header was not captured. */
  total: number;
  notes: AppNote[];
}

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1,
  feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, july: 7, juillet: 7,
  aug: 8, aou: 8, aout: 8, august: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};

const monthOf = (word: string): number | undefined =>
  MONTHS[word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "")];

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "€1,229.61", "1 229,61 €", "€447.20" → number. */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[\s  €]/g, "").replace(/[Oo]/g, "0");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  let value: string;
  if (lastSep >= 0 && s.length - lastSep - 1 === 2) {
    value = `${s.slice(0, lastSep).replace(/[.,]/g, "")}.${s.slice(lastSep + 1)}`;
  } else {
    value = s.replace(/[.,]/g, "");
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const MONEY = /(?:€\s?(\d[\d\s.,]*\d)|(\d[\d\s.,]*\d)\s?€)/;
const NOTE = /#\s*0*(\d{4,9})\b/;
const DAY_MONTH = /\b(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9}\.?)(?:\s+(\d{4}))?/;
const MONTH_YEAR = /^\s*([A-Za-zÀ-ÿ]{3,9})\s+(\d{4})\s*$/;

export function parseJetflyApp(text: string, today = new Date()): AppPayment[] {
  const payments: AppPayment[] = [];
  let year = today.getFullYear();
  let sectionMonth: number | null = null;
  let payment: AppPayment | null = null;
  let note: Partial<AppNote> | null = null;
  let headerTotal: number | null = null;
  /** Header date read on a line of its own, waiting for its amount. */
  let headerDate: string | null = null;

  const closeNote = () => {
    if (note?.noteId && note.amount !== undefined) {
      if (!payment) payment = { date: note.date ?? "", total: 0, notes: [] };
      payment.notes.push({ noteId: note.noteId, date: note.date ?? payment.date, amount: note.amount });
    }
    note = null;
  };
  const closePayment = () => {
    closeNote();
    if (payment && payment.notes.length > 0) {
      const sum = Math.round(payment.notes.reduce((s, n) => s + n.amount, 0) * 100) / 100;
      payment.total = headerTotal ?? sum;
      if (!payment.date) payment.date = payment.notes.map((n) => n.date).sort().pop()!;
      payments.push(payment);
    }
    payment = null;
    headerTotal = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const section = line.match(MONTH_YEAR);
    if (section && monthOf(section[1])) {
      year = Number(section[2]);
      sectionMonth = monthOf(section[1])!;
      continue;
    }

    const noteMatch = line.match(NOTE);
    const money = (noteMatch ? line.replace(noteMatch[0], " ") : line).match(MONEY);
    const amount = money ? parseMoney(money[1] ?? money[2]) : null;
    const dm = line.match(DAY_MONTH);
    const month = dm ? monthOf(dm[2]) : undefined;

    if (noteMatch) {
      closeNote();
      note = { noteId: noteMatch[1] };
      if (amount !== null) note.amount = amount;
      if (dm && month && dm[3]) note.date = iso(Number(dm[3]), month, Number(dm[1]));
      continue;
    }

    // Date with a year under a note number.
    if (note && dm && month && dm[3]) {
      note.date = iso(Number(dm[3]), month, Number(dm[1]));
      if (amount !== null && note.amount === undefined) note.amount = amount;
      continue;
    }

    // Amount on its own line, beside a note.
    if (note && note.amount === undefined && amount !== null && !dm) {
      note.amount = amount;
      continue;
    }

    // Header row of a payment: "30 Oct €1,229.61" (no year), possibly on two lines.
    if (dm && month && !dm[3]) {
      // A December payment listed under a January section belongs to the year before.
      const y = sectionMonth !== null && month > sectionMonth ? year - 1 : year;
      const date = iso(y, month, Number(dm[1]));
      if (amount === null) {
        headerDate = date;
        continue;
      }
      closePayment();
      payment = { date, total: amount, notes: [] };
      headerTotal = amount;
      headerDate = null;
      continue;
    }
    if (headerDate && amount !== null && !note) {
      closePayment();
      payment = { date: headerDate, total: amount, notes: [] };
      headerTotal = amount;
      headerDate = null;
      continue;
    }
    headerDate = null;
  }
  closePayment();
  return payments;
}
