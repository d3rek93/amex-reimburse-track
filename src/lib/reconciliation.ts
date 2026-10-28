/**
 * Reconciliation engine: links Jetfly expense-claim lines (monthly XLS) to
 * bank lines (AMEX, Boursobank) and Jetfly payment batches to the transfers
 * received on Boursobank.
 *
 * Pure and dependency-free on purpose: the same code runs in the app and in
 * `tests/reconciliation.test.ts` (node --test). It never writes anything; the
 * caller decides what to store (auto matches) and what to show (suggestions).
 *
 * Principles
 * - A note number is one claim. Jetfly corrects a claim by re-sending the same
 *   number with a negative amount, so claims are netted per number first.
 * - Automatic matches only when there is no doubt: the pair is each other's
 *   best candidate by a clear margin. Everything else is a suggestion.
 * - Amounts that do not agree are never matched automatically: they are
 *   surfaced as discrepancies, which is what the user wants to track.
 */

// ------------------------------------------------------------------ types

export interface BankLine {
  id: string;
  /** Purchase date (YYYY-MM-DD). */
  date: string;
  /** Euros; positive = money spent, negative = refund. */
  amount: number;
  label: string;
  source: string;
  personal?: boolean;
}

export interface ClaimLine {
  noteId: string;
  /** Expense date declared on the note (YYYY-MM-DD). */
  date: string;
  category: string;
  subcategory: string;
  amount: number;
  batchRef: string;
  paymentDate: string;
}

export interface Transfer {
  id: string;
  date: string;
  amount: number;
}

/** An association the user confirmed (or made by hand). */
export interface ConfirmedLink {
  noteIds: string[];
  lineIds: string[];
  /** Caller's id for the link, returned on the match. */
  ref?: string;
}

/** merchant key → kind → number of confirmed associations. */
export type LearnedRules = Record<string, Record<string, number>>;

export type Kind =
  | "hotel" | "taxi" | "train" | "aircraft" | "meal" | "airport_tax"
  | "phone" | "card_fee" | "uniform" | "postage" | "fuel" | "other";

export interface Claim {
  noteId: string;
  date: string;
  category: string;
  subcategory: string;
  kind: Kind;
  /** Net amount over all lines with this number (corrections included). */
  amount: number;
  lines: ClaimLine[];
  cancelled: boolean;
}

export type MatchType = "confirmed" | "exact" | "split" | "combined" | "mismatch" | "date_mismatch";

export interface Match {
  type: MatchType;
  noteIds: string[];
  lineIds: string[];
  /** Bank total minus claimed total (0 except for mismatches). */
  difference: number;
  confidence: "high" | "medium" | "low";
  auto: boolean;
  reason: string;
  /** For confirmed matches: the ref of the ConfirmedLink. */
  ref?: string;
}

export interface BatchStatus {
  ref: string;
  paymentDate: string;
  /** Sum of the batch lines in the XLS. */
  total: number;
  transferId: string | null;
}

export interface ReconcileInput {
  lines: BankLine[];
  claimLines: ClaimLine[];
  transfers?: Transfer[];
  confirmed?: ConfirmedLink[];
  /** Pairs the user rejected: never proposed again. */
  rejected?: { noteId: string; lineId: string }[];
  rules?: LearnedRules;
}

export interface ReconcileOptions {
  /** Max days between note date and bank date for exact and split matches. */
  dateWindow?: number;
  /** Max days for a discrepancy suggestion. */
  mismatchWindow?: number;
  /** Max days between the Jetfly payment date and the transfer. */
  transferWindow?: number;
}

export interface ReconcileResult {
  claims: Claim[];
  /** Confirmed links plus automatic matches: safe to store. */
  matches: Match[];
  /** Possible matches to review; several may compete for the same items. */
  suggestions: Match[];
  /** Purchase + refund pairs on the bank side that cancel out. */
  neutralized: [string, string][];
  unmatchedNoteIds: string[];
  unmatchedLineIds: string[];
  batches: BatchStatus[];
  unmatchedTransferIds: string[];
}

// ---------------------------------------------------------------- helpers

const EPS = 0.005;
const cents = (n: number) => Math.round(n * 100) / 100;
const sameAmount = (a: number, b: number) => Math.abs(a - b) < EPS;

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const daysBetween = (a: string, b: string) => Math.abs(dayNumber(a) - dayNumber(b));

/** Merchant part of a bank label, stable across lines of the same shop. */
export function merchantKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/^REMBOURSEMENT - /, "")
    .replace(/^CARTE \d{2}\/\d{2}\/\d{2}\s*/, "")
    .replace(/^(PRLV SEPA|VIR SEPA)\s+/, "")
    .replace(/^(3CPAYMENT|SUMUP|PAYPAL|SQ|ZETTLE)\s*\*\s*/, "")
    .replace(/HTTPS?:\/\/\S*/g, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 12);
}

/** Kind of a claim, from the Jetfly category and sub-category. */
export function claimKind(category: string, subcategory: string): Kind {
  const c = `${category} ${subcategory}`.toLowerCase();
  if (/hotel/.test(c)) return "hotel";
  if (/taxi/.test(c)) return "taxi";
  if (/train/.test(c)) return "train";
  if (/aircraft|flight|plane/.test(c)) return "aircraft";
  if (/meal|dinner|lunch|breakfast|collation/.test(c)) return "meal";
  if (/airport tax/.test(c)) return "airport_tax";
  if (/gsm|phone/.test(c)) return "phone";
  if (/bank card/.test(c)) return "card_fee";
  if (/uniform|dry clean/.test(c)) return "uniform";
  if (/postage/.test(c)) return "postage";
  if (/jet a1|fuel/.test(c)) return "fuel";
  return "other";
}

const KIND_PATTERNS: [Kind, RegExp][] = [
  ["card_fee", /COTISATION/],
  ["phone", /\b(ORANGE|SFR|BOUYGUES|FREE MOBILE|SOSH|POST LUXEMBOURG)\b/],
  ["train", /\b(SNCF|TRAINLINE|SBB|CFF|DB BAHN|OUIGO|EUROSTAR|TRENITALIA|CFL)\b/],
  ["taxi", /\b(TAXI|UBER TRIP|UBER BV|G7|VTC|BOLT|FREENOW|HEETCH|LE CAB)\b|TRANSPORTS?\b/],
  ["hotel", /\b(HOTEL|HÔTEL|HOTELCOM|HOTELS?\.COM|NOVOTEL|NOVOTELKIRCHB|MERCURE|IBIS|CAMPANILE|ACCOR|SOFITEL|PULLMAN|MGALLERY|HYATT|HILTON|MARRIOTT|MOXY|MOEVENPICK|BOOKING|AIRBNB|BEST WESTERN|KYRIAD|HUUS)\b|\b(FNOV|FMER|FMGA|FIBI)\b|\bH\d{4}\b|\bHB\w{3}\b/],
  ["airport_tax", /\b(REDEVANCE|REDEVANCES|AERODROME|AÉROPORT|AEROPORT|AIRPORT|FLUGHAFEN|ACM)\b/],
  ["aircraft", /\b(EGENCIA|SWISS|AIR FRANCE|EASYJET|LUXAIR|LUFTHANSA|RYANAIR|VOLOTEA|TRANSAVIA)\b|AIR LINES/],
  ["uniform", /\b(PRESS|PRESSING|AQUALOGIA|CLEAN|BLANCHISSERIE|TEINTURERIE)\b/],
  ["postage", /\b(LA POSTE|POSTE|DHL|UPS|FEDEX)\b/],
  ["meal", /\b(RESTAURANT|RESTO|UBER EATS|DELIVEROO|CAFE|CAFÉ|STARBUCKS|AUTOGRILL|BRASSERIE|PIZZ\w*|CREPERIE|BOULANGERIE|BURGER|BK|MCDONALD\w*|PAUL|BISTRO|TRATTORIA|INTERMARCHE|CARREFOUR|MONOPRIX|LECLERC|AUCHAN|LIDL|SPAR)\b/],
];

/** Kind guessed from a bank label (null when nothing is recognisable). */
export function labelKind(label: string): Kind | null {
  const l = label.toUpperCase();
  for (const [kind, re] of KIND_PATTERNS) if (re.test(l)) return kind;
  return null;
}

/** Rules learned from confirmed associations: which merchants are which kind. */
export function learnRules(
  links: ConfirmedLink[],
  lines: BankLine[],
  claims: Claim[],
): LearnedRules {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const claimById = new Map(claims.map((c) => [c.noteId, c]));
  const rules: LearnedRules = {};
  for (const link of links) {
    const kinds = new Set(link.noteIds.map((n) => claimById.get(n)?.kind).filter(Boolean) as Kind[]);
    for (const id of link.lineIds) {
      const line = lineById.get(id);
      if (!line) continue;
      const key = merchantKey(line.label);
      if (!key) continue;
      for (const kind of kinds) {
        rules[key] ??= {};
        rules[key][kind] = (rules[key][kind] ?? 0) + 1;
      }
    }
  }
  return rules;
}

/** Nets claim lines per note number; a net of zero means the claim was cancelled. */
export function buildClaims(claimLines: ClaimLine[]): Claim[] {
  const byNote = new Map<string, ClaimLine[]>();
  for (const l of claimLines) {
    const list = byNote.get(l.noteId) ?? [];
    list.push(l);
    byNote.set(l.noteId, list);
  }
  const claims: Claim[] = [];
  for (const [noteId, lines] of byNote) {
    const first = lines.find((l) => l.amount > 0) ?? lines[0];
    const amount = cents(lines.reduce((s, l) => s + l.amount, 0));
    claims.push({
      noteId,
      date: first.date,
      category: first.category,
      subcategory: first.subcategory,
      kind: claimKind(first.category, first.subcategory),
      amount,
      lines,
      cancelled: Math.abs(amount) < EPS,
    });
  }
  return claims.sort((a, b) => a.date.localeCompare(b.date) || a.noteId.localeCompare(b.noteId));
}

/** k-combinations of `items` (k ≤ 3 in practice). */
function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

/**
 * Days allowed between the note date and the bank date, per kind. Phone bills
 * are declared on the invoice date and debited about ten days later.
 */
const KIND_WINDOW: Partial<Record<Kind, number>> = { phone: 20 };

/**
 * Same day of month one or two months away, or day and month swapped: a typo,
 * not a coincidence. Further apart, a same-day match is just a monthly habit.
 */
export function looksLikeDateTypo(a: string, b: string): boolean {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const monthGap = Math.abs(ay * 12 + am - (by * 12 + bm));
  return (ad === bd && monthGap >= 1 && monthGap <= 2) || (ay === by && ad === bm && am === bd && am !== ad);
}

/** Bills that come back every month for the same amount: a far date is the next bill, not a typo. */
const RECURRING: Kind[] = ["phone", "card_fee"];

// ----------------------------------------------------------------- engine

export function reconcile(input: ReconcileInput, options: ReconcileOptions = {}): ReconcileResult {
  const dateWindow = options.dateWindow ?? 3;
  const mismatchWindow = options.mismatchWindow ?? 2;
  const transferWindow = options.transferWindow ?? 5;
  const rules = input.rules ?? {};
  const rejected = new Set((input.rejected ?? []).map((r) => `${r.noteId}|${r.lineId}`));
  const allowed = (noteId: string, lineId: string) => !rejected.has(`${noteId}|${lineId}`);

  const claims = buildClaims(input.claimLines);
  const claimById = new Map(claims.map((c) => [c.noteId, c]));
  const lineById = new Map(input.lines.map((l) => [l.id, l]));

  const matches: Match[] = [];
  const suggestions: Match[] = [];
  const neutralized: [string, string][] = [];

  const openClaims = new Set(claims.filter((c) => !c.cancelled).map((c) => c.noteId));
  const openLines = new Set(input.lines.filter((l) => !l.personal).map((l) => l.id));

  // 1. What the user already confirmed is never questioned.
  for (const link of input.confirmed ?? []) {
    const noteIds = link.noteIds.filter((n) => claimById.has(n));
    const lineIds = link.lineIds.filter((l) => lineById.has(l));
    if (noteIds.length === 0 && lineIds.length === 0) continue;
    const claimed = noteIds.reduce((s, n) => s + claimById.get(n)!.amount, 0);
    const spent = lineIds.reduce((s, l) => s + lineById.get(l)!.amount, 0);
    matches.push({
      type: "confirmed",
      noteIds,
      lineIds,
      difference: cents(spent - claimed),
      confidence: "high",
      auto: false,
      reason: "Association confirmée",
      ref: link.ref,
    });
    noteIds.forEach((n) => openClaims.delete(n));
    lineIds.forEach((l) => openLines.delete(l));
  }

  /** How well a bank line fits a claim, beyond the amount. */
  const kindScore = (claim: Claim, line: BankLine) => {
    let score = 0;
    const learned = rules[merchantKey(line.label)];
    if (learned) {
      const forKind = learned[claim.kind] ?? 0;
      const other = Object.entries(learned).reduce((s, [k, n]) => (k === claim.kind ? s : s + n), 0);
      score += Math.min(3, forKind) - Math.min(2, other > forKind ? 1 : 0);
    }
    const guessed = labelKind(line.label);
    if (guessed === claim.kind) score += 4;
    else if (guessed !== null) score -= 3;
    return score;
  };
  const windowFor = (claim: Claim) => Math.max(dateWindow, KIND_WINDOW[claim.kind] ?? 0);
  // Date distance counts relative to the kind's window (a 10-day gap is normal for a phone bill).
  const pairScore = (claim: Claim, line: BankLine) =>
    10 - (2 * daysBetween(claim.date, line.date) * dateWindow) / windowFor(claim) + kindScore(claim, line);

  // 2. One claim ↔ one bank line, same amount.
  const exactPass = () => {
    for (;;) {
      const pairs: { c: Claim; l: BankLine; s: number }[] = [];
      for (const n of openClaims) {
        const c = claimById.get(n)!;
        for (const id of openLines) {
          const l = lineById.get(id)!;
          if (allowed(c.noteId, l.id) && sameAmount(c.amount, l.amount) && daysBetween(c.date, l.date) <= windowFor(c)) {
            pairs.push({ c, l, s: pairScore(c, l) });
          }
        }
      }
      const byClaim = new Map<string, typeof pairs>();
      const byLine = new Map<string, typeof pairs>();
      for (const p of pairs) {
        (byClaim.get(p.c.noteId) ?? byClaim.set(p.c.noteId, []).get(p.c.noteId)!).push(p);
        (byLine.get(p.l.id) ?? byLine.set(p.l.id, []).get(p.l.id)!).push(p);
      }
      const clearBest = (list: typeof pairs) => {
        const sorted = list.slice().sort((a, b) => b.s - a.s);
        const margin = sorted.length > 1 ? sorted[0].s - sorted[1].s : Infinity;
        return margin >= 2 ? sorted[0] : null;
      };
      let accepted = 0;
      for (const [, list] of byClaim) {
        const best = clearBest(list);
        if (!best || !openClaims.has(best.c.noteId) || !openLines.has(best.l.id)) continue;
        const lineBest = clearBest(byLine.get(best.l.id)!);
        if (lineBest !== best) continue;
        const kindOk = labelKind(best.l.label) === best.c.kind || kindScore(best.c, best.l) > 0;
        matches.push({
          type: "exact",
          noteIds: [best.c.noteId],
          lineIds: [best.l.id],
          difference: 0,
          confidence: kindOk && daysBetween(best.c.date, best.l.date) <= 1 ? "high" : "medium",
          auto: true,
          reason: "Même montant, seul candidat",
        });
        openClaims.delete(best.c.noteId);
        openLines.delete(best.l.id);
        accepted += 1;
      }
      if (accepted === 0) {
        // Ambiguous leftovers: show the candidates, best first.
        for (const [, list] of byClaim) {
          for (const p of list.sort((a, b) => b.s - a.s).slice(0, 3)) {
            suggestions.push({
              type: "exact",
              noteIds: [p.c.noteId],
              lineIds: [p.l.id],
              difference: 0,
              confidence: "medium",
              auto: false,
              reason: "Même montant, plusieurs candidats",
            });
          }
        }
        return;
      }
    }
  };
  exactPass();
  const ambiguous = new Set(suggestions.flatMap((s) => [...s.noteIds, ...s.lineIds]));

  // 3. Bank purchase + refund of the same amount at the same merchant: they cancel out.
  const refunds = [...openLines].map((id) => lineById.get(id)!).filter((l) => l.amount < 0);
  for (const r of refunds.sort((a, b) => a.date.localeCompare(b.date))) {
    if (!openLines.has(r.id)) continue;
    const key = merchantKey(r.label);
    const purchase = [...openLines]
      .map((id) => lineById.get(id)!)
      .filter(
        (l) =>
          l.amount > 0 &&
          sameAmount(l.amount, -r.amount) &&
          merchantKey(l.label) === key &&
          dayNumber(r.date) - dayNumber(l.date) >= 0 &&
          dayNumber(r.date) - dayNumber(l.date) <= 60 &&
          !ambiguous.has(l.id),
      )
      .sort((a, b) => daysBetween(r.date, a.date) - daysBetween(r.date, b.date))[0];
    if (purchase) {
      neutralized.push([purchase.id, r.id]);
      openLines.delete(purchase.id);
      openLines.delete(r.id);
    }
  }

  // 4. Splits: several claims for one bank line, or one claim over several lines.
  const groupPass = () => {
    type Combo = { noteIds: string[]; lineIds: string[]; s: number; type: "split" | "combined" };
    const combos: Combo[] = [];
    const freeClaims = [...openClaims].map((n) => claimById.get(n)!).filter((c) => c.amount > 0 && !ambiguous.has(c.noteId));
    const freeLines = [...openLines].map((id) => lineById.get(id)!).filter((l) => l.amount > 0 && !ambiguous.has(l.id));

    for (const l of freeLines) {
      const near = freeClaims.filter((c) => allowed(c.noteId, l.id) && daysBetween(c.date, l.date) <= dateWindow && c.amount < l.amount);
      for (const k of [2, 3]) {
        for (const group of combinations(near, k)) {
          if (!sameAmount(group.reduce((s, c) => s + c.amount, 0), l.amount)) continue;
          const s = group.reduce((acc, c) => acc + pairScore(c, l), 0) / k - (k - 2);
          combos.push({ noteIds: group.map((c) => c.noteId), lineIds: [l.id], s, type: "split" });
        }
      }
    }
    for (const c of freeClaims) {
      const near = freeLines.filter((l) => allowed(c.noteId, l.id) && daysBetween(c.date, l.date) <= dateWindow && l.amount < c.amount);
      for (const k of [2, 3]) {
        for (const group of combinations(near, k)) {
          if (!sameAmount(group.reduce((s, l) => s + l.amount, 0), c.amount)) continue;
          const s = group.reduce((acc, l) => acc + pairScore(c, l), 0) / k - (k - 2);
          combos.push({ noteIds: [c.noteId], lineIds: group.map((l) => l.id), s, type: "combined" });
        }
      }
    }

    // A combo is safe when none of its items appears in any other combo.
    const uses = new Map<string, number>();
    for (const combo of combos) for (const id of [...combo.noteIds, ...combo.lineIds]) uses.set(id, (uses.get(id) ?? 0) + 1);
    for (const combo of combos.sort((a, b) => b.s - a.s)) {
      const items = [...combo.noteIds, ...combo.lineIds];
      const exclusive = items.every((id) => uses.get(id) === 1);
      const stillOpen = combo.noteIds.every((n) => openClaims.has(n)) && combo.lineIds.every((l) => openLines.has(l));
      if (!stillOpen) continue;
      const lines = combo.lineIds.map((id) => lineById.get(id)!);
      const notes = combo.noteIds.map((n) => claimById.get(n)!);
      const kindsAgree = notes.every((c) => lines.every((l) => kindScore(c, l) >= 0));
      const match: Match = {
        type: combo.type,
        noteIds: combo.noteIds,
        lineIds: combo.lineIds,
        difference: 0,
        confidence: exclusive && kindsAgree ? "medium" : "low",
        auto: exclusive && kindsAgree,
        reason:
          combo.type === "split"
            ? `${combo.noteIds.length} notes pour une dépense`
            : `Une note pour ${combo.lineIds.length} dépenses`,
      };
      if (match.auto) {
        matches.push(match);
        combo.noteIds.forEach((n) => openClaims.delete(n));
        combo.lineIds.forEach((l) => openLines.delete(l));
      } else {
        suggestions.push(match);
      }
    }
  };
  groupPass();

  // 5. Same kind, same days, different amount: likely an error somewhere.
  const leftClaims = [...openClaims].map((n) => claimById.get(n)!).filter((c) => c.amount > 0 && !ambiguous.has(c.noteId));
  const leftLines = [...openLines].map((id) => lineById.get(id)!).filter((l) => l.amount > 0 && !ambiguous.has(l.id));
  const nearMisses: { c: Claim; l: BankLine; diff: number }[] = [];
  for (const c of leftClaims) {
    for (const l of leftLines) {
      if (!allowed(c.noteId, l.id) || daysBetween(c.date, l.date) > mismatchWindow) continue;
      const kindOk = labelKind(l.label) === c.kind || kindScore(c, l) >= 3;
      const diff = l.amount - c.amount;
      const relative = Math.abs(diff) / Math.max(c.amount, l.amount);
      if (kindOk && relative <= 0.25) nearMisses.push({ c, l, diff });
    }
  }
  const usedC = new Set<string>();
  const usedL = new Set<string>();
  for (const m of nearMisses.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))) {
    if (usedC.has(m.c.noteId) || usedL.has(m.l.id)) continue;
    usedC.add(m.c.noteId);
    usedL.add(m.l.id);
    suggestions.push({
      type: "mismatch",
      noteIds: [m.c.noteId],
      lineIds: [m.l.id],
      difference: cents(m.diff),
      confidence: "low",
      auto: false,
      reason: `Écart de ${cents(m.diff).toFixed(2)} € entre la dépense et la note`,
    });
  }

  // 6. Same amount and kind, but the dates are far apart: usually a mistyped date on the note.
  const suggestedNow = new Set(suggestions.flatMap((x) => [...x.noteIds, ...x.lineIds]));
  // A note the user already turned a proposal down for gets no more speculative date guesses.
  const rejectedNotes = new Set((input.rejected ?? []).map((r) => r.noteId));
  const lateClaims = [...openClaims]
    .map((n) => claimById.get(n)!)
    .filter((c) => c.amount > 0 && !suggestedNow.has(c.noteId) && !rejectedNotes.has(c.noteId) && !RECURRING.includes(c.kind));
  const lateLines = [...openLines]
    .map((id) => lineById.get(id)!)
    .filter((l) => l.amount > 0 && !suggestedNow.has(l.id));
  for (const c of lateClaims) {
    const candidates = lateLines.filter(
      (l) =>
        allowed(c.noteId, l.id) &&
        sameAmount(c.amount, l.amount) &&
        !suggestedNow.has(l.id) &&
        (looksLikeDateTypo(c.date, l.date) || daysBetween(c.date, l.date) <= 45) &&
        (labelKind(l.label) === c.kind || kindScore(c, l) >= 3),
    );
    if (candidates.length === 0) continue;
    const best = candidates.sort(
      (a, b) =>
        Number(looksLikeDateTypo(c.date, b.date)) - Number(looksLikeDateTypo(c.date, a.date)) ||
        daysBetween(c.date, a.date) - daysBetween(c.date, b.date),
    )[0];
    suggestedNow.add(best.id);
    suggestions.push({
      type: "date_mismatch",
      noteIds: [c.noteId],
      lineIds: [best.id],
      difference: 0,
      confidence: looksLikeDateTypo(c.date, best.date) ? "medium" : "low",
      auto: false,
      reason: `Même montant, mais la note est datée du ${c.date} et la dépense du ${best.date}`,
    });
  }

  // 7. Each Jetfly payment batch ↔ the transfer it produced.
  const batchMap = new Map<string, BatchStatus>();
  for (const l of input.claimLines) {
    const b = batchMap.get(l.batchRef) ?? { ref: l.batchRef, paymentDate: l.paymentDate, total: 0, transferId: null };
    b.total = cents(b.total + l.amount);
    batchMap.set(l.batchRef, b);
  }
  const batches = [...batchMap.values()].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.ref.localeCompare(b.ref));
  const freeTransfers = new Set((input.transfers ?? []).map((t) => t.id));
  const transfers = (input.transfers ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const b of batches) {
    const candidate = transfers.find(
      (t) =>
        freeTransfers.has(t.id) &&
        sameAmount(t.amount, b.total) &&
        dayNumber(t.date) - dayNumber(b.paymentDate) >= 0 &&
        dayNumber(t.date) - dayNumber(b.paymentDate) <= transferWindow,
    );
    if (candidate) {
      b.transferId = candidate.id;
      freeTransfers.delete(candidate.id);
    }
  }

  const suggested = new Set(suggestions.flatMap((s) => [...s.noteIds, ...s.lineIds]));
  return {
    claims,
    matches,
    suggestions,
    neutralized,
    unmatchedNoteIds: [...openClaims].filter((n) => !suggested.has(n)).sort(),
    unmatchedLineIds: [...openLines].filter((l) => !suggested.has(l)).sort(),
    batches,
    unmatchedTransferIds: [...freeTransfers].sort(),
  };
}
