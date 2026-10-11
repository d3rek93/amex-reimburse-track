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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  BankAccount,
  forgetLink,
  setFollowedAccounts,
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
  const [busy, setBusy] = useState<"sync" | "link" | "forget" | "save" | null>(null);
  const [addingBank, setAddingBank] = useState(false);

  const isPublished =
    typeof window !== "undefined" && window.location.origin === PUBLISHED_ORIGIN;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setSearch("");
    setAddingBank(false);
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

  const handleForget = async (sessionId: string) => {
    setBusy("forget");
    try {
      await forgetLink(sessionId);
      setSessions((prev) => prev.filter((x) => x.session_id !== sessionId));
      toast({ title: "Banque déconnectée" });
    } finally {
      setBusy(null);
    }
  };

  const toggleAccount = async (session: LinkedSession, uid: string, on: boolean) => {
    const uids = session.accounts
      .filter((a) => (a.uid === uid ? on : a.enabled !== false))
      .map((a) => String(a.uid));
    setBusy("save");
    try {
      const accounts = await setFollowedAccounts(session.session_id, uids);
      setSessions((prev) =>
        prev.map((x) => (x.session_id === session.session_id ? { ...x, accounts } : x))
      );
    } catch (err) {
      toast({ title: "Enregistrement impossible", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const followed = sessions.reduce(
    (n, s) => n + (s.accounts ?? []).filter((a) => a.enabled !== false).length,
    0
  );
  const showPicker = sessions.length === 0 || addingBank;


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
        ) : !showPicker ? (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.session_id} className="rounded-lg border bg-muted/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{session.aspsp_name ?? "Banque connectée"}</p>
                    {session.valid_until && (
                      <p className="text-xs text-muted-foreground">
                        Accès valide jusqu'au {new Date(session.valid_until).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleForget(session.session_id)} disabled={busy !== null}>
                    <Unlink className="h-4 w-4 mr-1" />
                    Déconnecter
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Coche les comptes à suivre :</p>
                {(session.accounts ?? []).map((acc) => (
                  <label key={acc.uid} className="flex items-center gap-3 text-sm cursor-pointer">
                    <Checkbox
                      checked={acc.enabled !== false}
                      disabled={busy !== null}
                      onCheckedChange={(v) => toggleAccount(session, String(acc.uid), v === true)}
                    />
                    <span>
                      {acc.product || acc.name || "Compte"}
                      {acc.iban ? <span className="text-muted-foreground"> · …{acc.iban.slice(-4)}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSync} disabled={busy !== null || followed === 0}>
                {busy === "sync" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Synchroniser maintenant
              </Button>
              <Button variant="outline" onClick={() => setAddingBank(true)} disabled={busy !== null}>
                Ajouter une banque
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAddingBank(false)}>
                ← Retour aux comptes connectés
              </Button>
            )}
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
