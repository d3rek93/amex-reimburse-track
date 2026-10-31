import { useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { parseJetflyApp, parseMoney, type AppPayment } from "@/lib/jetflyApp";
import { saveAppPayments, useLedger, useLedgerActions, type Ledger } from "@/lib/ledger";
import { eur, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// Text recognition runs in the browser; the screenshot never leaves the phone.
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

interface TesseractWorker {
  recognize: (image: File) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
}
declare global {
  interface Window {
    Tesseract?: { createWorker: (lang: string) => Promise<TesseractWorker> };
  }
}

function loadTesseract(): Promise<NonNullable<Window["Tesseract"]>> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Lecteur de texte indisponible")));
    script.onerror = () => reject(new Error("Lecteur de texte indisponible (connexion ?)"));
    document.head.appendChild(script);
  });
}

async function readImages(files: File[], onProgress: (done: number) => void): Promise<string> {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker("eng");
  try {
    const texts: string[] = [];
    for (const [i, f] of files.entries()) {
      texts.push((await worker.recognize(f)).data.text);
      onProgress(i + 1);
    }
    return texts.join("\n");
  } finally {
    await worker.terminate();
  }
}

/** Same payment read from two overlapping screenshots: keep one, with every note. */
function mergePayments(list: AppPayment[]): AppPayment[] {
  const byKey = new Map<string, AppPayment>();
  for (const p of list) {
    const key = `${p.date}|${p.total.toFixed(2)}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...p, notes: [...p.notes] });
    else for (const n of p.notes) if (!prev.notes.some((x) => x.noteId === n.noteId)) prev.notes.push(n);
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
}

type Row = AppPayment & { include: boolean };

export function JetflyAppImport({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { ledger } = useLedger();
  const { refresh } = useLedgerActions();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFiles([]);
    setText("");
    setRows(null);
    setReading(null);
  };
  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const read = async () => {
    try {
      let all = text;
      if (files.length > 0) {
        setReading(`Lecture de ${files.length > 1 ? `${files.length} captures` : "la capture"}…`);
        all += "\n" + (await readImages(files, (d) => setReading(`Lecture des captures (${d}/${files.length})…`)));
      }
      const found = mergePayments(parseJetflyApp(all));
      if (found.length === 0) {
        toast({
          title: "Aucun virement lu",
          description: "Ouvre chaque virement dans l'app Jetfly (flèche) pour afficher ses notes, puis refais la capture.",
          variant: "destructive",
        });
        return;
      }
      setRows(found.map((p) => ({ ...p, include: true })));
    } catch (e) {
      toast({ title: "Lecture impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setReading(null);
    }
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const chosen = rows.filter((r) => r.include).map(({ include: _, ...p }) => p);
      const r = await saveAppPayments(chosen);
      await refresh();
      toast({
        title: `${r.added} note${r.added > 1 ? "s" : ""} enregistrée${r.added > 1 ? "s" : ""}`,
        description:
          (r.skipped ? `${r.skipped} déjà sur un relevé Jetfly, ignorée${r.skipped > 1 ? "s" : ""}. ` : "") +
          "Le prochain relevé mensuel les confirmera ou les corrigera.",
      });
      close(false);
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const count = rows?.filter((r) => r.include).reduce((s, r) => s + r.notes.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Virements de l'app Jetfly</DialogTitle>
          <DialogDescription>
            Sans attendre le relevé du mois : dans l'app Jetfly, déplie chaque virement pour afficher ses notes, fais une
            capture d'écran et ajoute-la ici. Le relevé mensuel confirmera ou corrigera ces liaisons.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="grid gap-4">
            <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm cursor-pointer hover:bg-muted/40">
              <ImageUp className="h-6 w-6 text-muted-foreground" aria-hidden />
              {files.length > 0 ? (
                <span className="font-medium">
                  {files.length} capture{files.length > 1 ? "s" : ""} choisie{files.length > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="font-medium">Choisir une ou plusieurs captures d'écran</span>
              )}
              <span className="text-muted-foreground">Le texte est lu sur ton appareil, l'image n'est envoyée nulle part.</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
              />
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Ou colle le texte copié depuis la capture</summary>
              <Textarea
                className="mt-2 font-mono text-xs"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"30 Oct €1,229.61\n#00606355 €447.20\n29 Oct 2026"}
              />
            </details>
            <DialogFooter>
              <Button onClick={() => void read()} disabled={reading !== null || (files.length === 0 && !text.trim())}>
                {reading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {reading}
                  </>
                ) : (
                  "Lire"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">Vérifie les numéros et montants lus, corrige-les au besoin.</p>
            {rows.map((r, i) => (
              <PaymentCard key={`${r.date}-${r.total}`} row={r} ledger={ledger ?? null} onChange={(p) => update(i, p)} />
            ))}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRows(null)}>
                Recommencer
              </Button>
              <Button onClick={() => void save()} disabled={saving || count === 0}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enregistrer {count} note{count > 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentCard({ row, ledger, onChange }: { row: Row; ledger: Ledger | null; onChange: (patch: Partial<Row>) => void }) {
  const sum = Math.round(row.notes.reduce((s, n) => s + n.amount, 0) * 100) / 100;
  const gap = Math.abs(sum - row.total) >= 0.005;
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime() / 86400000;
  const transfer = ledger?.transferViews.find((t) => Math.abs(t.amount_eur - row.total) < 0.005 && Math.abs(day(t.date) - day(row.date)) <= 5);
  const onStatement = (noteId: string) => {
    const c = ledger?.claimById.get(noteId);
    return c && !c.provisional;
  };
  const setNote = (i: number, patch: Partial<AppPayment["notes"][number]>) =>
    onChange({ notes: row.notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) });

  return (
    <div className={cn("rounded-lg border", !row.include && "opacity-60")}>
      <label className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 border-b text-sm cursor-pointer">
        <Checkbox checked={row.include} onCheckedChange={(v) => onChange({ include: v === true })} />
        <span className="font-medium">Virement du {shortDate(row.date)}</span>
        <span className="ml-auto tabular-nums font-medium">{eur(row.total)}</span>
        <span className={cn("basis-full pl-7 text-xs", transfer ? "text-success" : "text-muted-foreground")}>
          {transfer ? `Reçu sur Boursobank le ${shortDate(transfer.date)}` : "Pas encore sur ton compte : synchronise tes banques"}
        </span>
      </label>
      <ul className="divide-y">
        {row.notes.map((n, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">#</span>
            <Input
              value={n.noteId}
              onChange={(e) => setNote(i, { noteId: e.target.value.replace(/\D/g, "").replace(/^0+/, "") })}
              className="h-8 w-24 tabular-nums"
              inputMode="numeric"
              aria-label="Numéro de note"
            />
            <span className="hidden sm:inline text-muted-foreground tabular-nums">{shortDate(n.date)}</span>
            {onStatement(n.noteId) && <span className="text-xs text-muted-foreground">déjà au relevé</span>}
            <Input
              defaultValue={n.amount.toFixed(2).replace(".", ",")}
              onBlur={(e) => {
                const v = parseMoney(e.target.value);
                if (v !== null) setNote(i, { amount: v });
              }}
              className="ml-auto h-8 w-24 text-right tabular-nums"
              inputMode="decimal"
              aria-label="Montant"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Retirer cette note"
              onClick={() => onChange({ notes: row.notes.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {gap && (
        <p className="px-3 py-2 border-t text-xs text-warning">
          Les notes lues totalisent {eur(sum)} sur {eur(row.total)} : une note manque peut-être (capture coupée ?). Tu peux
          enregistrer quand même et ajouter le reste plus tard.
        </p>
      )}
    </div>
  );
}
