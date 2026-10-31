import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Signed amount for differences: "+ 4,00 €" / "− 4,00 €". */
export const signedEur = (n: number) => `${n >= 0 ? "+" : "−"} ${eur(Math.abs(n))}`;

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

export const shortDate = (iso: string) => format(parse(iso), "d MMM", { locale: fr });
export const longDate = (iso: string) => format(parse(iso), "d MMMM yyyy", { locale: fr });
export const dayDate = (iso: string) => format(parse(iso), "dd/MM/yyyy");
export const monthLabel = (iso: string) => {
  const s = format(parse(iso), "MMMM yyyy", { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Jetfly category as the user reads it: "Hotel", "Taxi", "Repas · dîner"… */
export const categoryLabel = (category: string, subcategory: string) => {
  const map: Record<string, string> = {
    "Hotel Night": "Hôtel",
    "Positionning Taxi": "Taxi",
    "Positionning Train": "Train",
    "Positionning Aircraft": "Avion",
    "Meal Dinner": "Dîner",
    "Meal Lunch": "Déjeuner",
    "Meal Breakfast": "Petit-déjeuner",
    "Meal Collation": "Collation",
    "Airport Tax Airport Tax": "Taxe aéroport",
    "Gsm Phone plan": "Forfait téléphone",
    "Other Bank card": "Cotisation carte",
    "Other Postage": "Affranchissement",
    "Uniform Dry cleaning": "Pressing",
    "JET A1 JET A1": "Jet A1",
  };
  return map[`${category} ${subcategory}`.trim()] ?? ([category, subcategory].filter(Boolean).join(" – ") || "Note (app Jetfly)");
};
