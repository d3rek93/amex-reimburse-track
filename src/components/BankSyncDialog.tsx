import { useEffect, useMemo, useState } from "react";
import { Landmark, Loader2, RefreshCw, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  BankAccount,
  listBanks,
  listLinked,
  runBankSync,
  startLink,
} from "@/lib/bankSync";

const PUBLISHED_ORIGIN = "https://amex-reimburse-track.lovable.app";
const SUGGESTED = ["Boursorama Banque", "American Express"];

interface BankSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSynced?: () => void;
}

interface LinkedSession {
  session_id: string;
  aspsp_name: string | null;
  accounts: BankAccount[];
  valid_until: string | null;
}

export const BankSyncDialog = ({
  open,
  onOpenChange,
  onSynced,
}: BankSyncDialogProps) => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<LinkedSession[]>([]);
  const [banks, setBanks] = useState<{ name: string; country: string }[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"sync" | "link" | "forget" | null>(null);

  const isPublished =
    typeof window !== "undefined" && window.location.origin === PUBLISHED_ORIGIN;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setSearch("");
    Promise.all([listLinked().catch(() => []), listBanks("FR").catch(() => [])])
      .then(([linked, available]) => {
        if (!active) return;
        setSessions(linked as LinkedSession[]);
        setBanks(available);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
  }, [banks, search]);

  const handleLink = async (name: string) => {
    setBusy("link");
    try {
      const { url, state } = await startLink(name, "FR");
      sessionStorage.setItem("enable_banking_state", state);
      window.location.assign(url);
    } catch (err) {
      toast({
        title: "Connexion impossible",
        description: (err as Error).message,
        variant: "destructive",
      });
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    try {
      const summary = await runBankSync(120);
      toast({
        title: "Compte synchronisé",
        description:
          `${summary.imported} nouvelle(s) ligne(s) importée(s)` +
          (summary.balance !== null
            ? ` · solde ${summary.balance.toFixed(2).replace(".", ",")} €`
            : ""),
      });
      onSynced?.();
    } catch (err) {
      toast({
        title: "Synchronisation impossible",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleForget = async () => {
    setBusy("forget");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.functions.invoke("enable-banking", { body: { action: "forget" } });
      setSessions([]);
      toast({ title: "Compte déconnecté" });
    } finally {
      setBusy(null);
    }
  };

  const linkedName = sessions[0]?.aspsp_name ?? null;
  const validUntil = sessions[0]?.valid_until
    ? new Date(sessions[0].valid_until as string).toLocaleDateString("fr-FR")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Compte bancaire
          </DialogTitle>
          <DialogDescription>
            Récupère automatiquement le solde et les opérations du compte
            professionnel, sans exporter de fichier.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Vérification des accès…
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium">{linkedName ?? "Compte connecté"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {sessions.reduce((n, s) => n + (s.accounts?.length ?? 0), 0)} compte(s)
                accessible(s)
                {validUntil ? ` · accès valide jusqu'au ${validUntil}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSync} disabled={busy !== null}>
                {busy === "sync" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Synchroniser maintenant
              </Button>
              <Button
                variant="outline"
                onClick={handleForget}
                disabled={busy !== null}
              >
                <Unlink className="h-4 w-4 mr-2" />
                Déconnecter
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!isPublished && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                La connexion doit se faire sur l'adresse publiée de l'application :{" "}
                <a
                  className="underline font-medium"
                  href={`${PUBLISHED_ORIGIN}/stats`}
                  target="_blank"
                  rel="noreferrer"
                >
                  amex-reimburse-track.lovable.app
                </a>
              </p>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Chercher une banque (Boursorama…)"
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {filtered.map((bank) => (
                <button
                  key={`${bank.name}-${bank.country}`}
                  type="button"
                  onClick={() => handleLink(bank.name)}
                  disabled={busy !== null || !isPublished}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors disabled:opacity-50 border-b last:border-b-0"
                >
                  {bank.name}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  Aucune banque trouvée.
                </p>
              )}
            </div>
            {SUGGESTED.filter((s) => banks.some((b) => b.name === s)).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.filter((s) => banks.some((b) => b.name === s)).map((name) => (
                  <Button
                    key={name}
                    size="sm"
                    variant={name === "Boursorama Banque" ? "default" : "outline"}
                    onClick={() => handleLink(name)}
                    disabled={busy !== null || !isPublished}
                  >
                    {busy === "link" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Connecter {name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
