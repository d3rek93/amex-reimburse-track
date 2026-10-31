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

/** Usual OCR slips: "0ct" for "Oct", "20Oct", "2O26". */
export function cleanOcrLine(raw: string): string {
  return raw
    .replace(/(\d)(?=[A-Za-zÀ-ÿ]{3})/g, "$1 ")
    .replace(/\b0(?=[a-zà-ÿ]{2,}\.?\b)/gi, "O")
    .replace(/\b2[O0o]([0-9Oo]{2})\b/g, (m) => m.replace(/[Oo]/g, "0"))
    .trim();
}

const cents = (n: number) => Math.round(n * 100);

/**
 * When a header row is misread, its notes end up under the payment above:
 * the notes then exceed that payment's total. Split them where the running
 * sum reaches the total.
 */
function splitOverflow(p: AppPayment): AppPayment[] {
  const sum = p.notes.reduce((s, n) => s + cents(n.amount), 0);
  if (sum <= cents(p.total)) return [p];
  let run = 0;
  for (let i = 0; i < p.notes.length; i++) {
    run += cents(p.notes[i].amount);
    if (run === cents(p.total) && i < p.notes.length - 1) {
      const rest = p.notes.slice(i + 1);
      return [
        { ...p, notes: p.notes.slice(0, i + 1) },
        { date: "", total: rest.reduce((s, n) => s + cents(n.amount), 0) / 100, notes: rest },
      ];
    }
  }
  return [p];
}

/**
 * Payments with their notes. A payment's date may be "" when its header row
 * could not be read: the caller takes it from the bank transfer.
 */
export function parseJetflyApp(text: string, today = new Date()): AppPayment[] {
  const payments: AppPayment[] = [];
  let year = today.getFullYear();
  let sectionMonth: number | null = null;
  let payment: AppPayment | null = null;
  let note: Partial<AppNote> | null = null;
  /** Header date read on a line of its own, waiting for its amount. */
  let headerDate: string | null = null;

  const closeNote = () => {
    if (note?.noteId && note.amount !== undefined) {
      if (!payment) payment = { date: "", total: 0, notes: [] };
      payment.notes.push({ noteId: note.noteId, date: note.date ?? "", amount: note.amount });
    }
    note = null;
  };
  const closePayment = () => {
    closeNote();
    if (payment && payment.notes.length > 0) {
      const sum = payment.notes.reduce((s, n) => s + cents(n.amount), 0) / 100;
      if (payment.total <= 0) payment.total = sum;
      payments.push(...splitOverflow(payment));
    }
    payment = null;
  };
  const openPayment = (date: string, total: number) => {
    closePayment();
    payment = { date, total, notes: [] };
    headerDate = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanOcrLine(rawLine);
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
    const dayOk = dm && Number(dm[1]) >= 1 && Number(dm[1]) <= 31;

    if (noteMatch) {
      closeNote();
      headerDate = null;
      note = { noteId: noteMatch[1] };
      if (amount !== null) note.amount = amount;
      if (dayOk && month && dm![3]) note.date = iso(Number(dm![3]), month, Number(dm![1]));
      continue;
    }

    // Date with a year under a note number.
    if (note && dayOk && month && dm![3]) {
      note.date = iso(Number(dm![3]), month, Number(dm![1]));
      if (amount !== null && note.amount === undefined) note.amount = amount;
      continue;
    }

    // Amount on its own line, beside a note still without one.
    if (note && note.amount === undefined && amount !== null && !(dayOk && month)) {
      note.amount = amount;
      continue;
    }

    // Header row of a payment: "30 Oct €1,229.61", possibly on two lines.
    const headerDay =
      dayOk && month && !dm![3]
        ? // A December payment listed under a January section belongs to the year before.
          iso(sectionMonth !== null && month > sectionMonth ? year - 1 : year, month, Number(dm![1]))
        : null;
    if (headerDay && amount === null) {
      closeNote();
      headerDate = headerDay;
      continue;
    }
    if (amount !== null && (!note || note.amount !== undefined)) {
      // Any other amount outside a note starts a payment, even if its date was misread.
      if (/pending|en attente/i.test(line)) continue;
      openPayment(headerDay ?? headerDate ?? "", amount);
      continue;
    }
    headerDate = null;
  }
  closePayment();
  for (const p of payments) {
    const latest = p.notes.map((n) => n.date).filter(Boolean).sort().pop() ?? "";
    for (const n of p.notes) if (!n.date) n.date = p.date || latest;
  }
  return payments;
}

export interface TransferCandidate {
  id: string;
  date: string;
  amount_eur: number;
}

const dayNum = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86400000;

/**
 * The bank transfer of each payment: same amount, arrived from 2 days before
 * to 10 days after the date shown in the app (the app shows the day Jetfly
 * sent it). Each transfer serves one payment.
 */
export function matchTransfers<T extends TransferCandidate>(payments: AppPayment[], transfers: T[]): (T | null)[] {
  const used = new Set<string>();
  return payments.map((p) => {
    const ref = p.date || p.notes.map((n) => n.date).filter(Boolean).sort().pop() || "";
    const best = transfers
      .filter((t) => !used.has(t.id) && cents(t.amount_eur) === cents(p.total))
      .map((t) => ({ t, d: ref ? dayNum(t.date) - dayNum(ref) : 0 }))
      .filter(({ d }) => d >= -2 && d <= (p.date ? 10 : 20))
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
    if (!best) return null;
    used.add(best.t.id);
    return best.t;
  });
}
