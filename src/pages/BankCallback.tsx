import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { completeLink, runBankSync } from "@/lib/bankSync";

export default function BankCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState("Finalisation de la connexion…");
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const expected = sessionStorage.getItem("enable_banking_state");
    sessionStorage.removeItem("enable_banking_state");

    const fail = (reason: string) => {
      setFailed(true);
      setMessage(reason);
      toast({ title: "Connexion interrompue", description: reason, variant: "destructive" });
    };

    if (!code) {
      fail("Aucune autorisation reçue de la banque.");
      return;
    }
    if (expected && state && expected !== state) {
      fail("La demande de connexion n'a pas pu être vérifiée.");
      return;
    }

    (async () => {
      try {
        const session = await completeLink(code);
        if (session.error) throw new Error(session.error);
        setMessage("Récupération des opérations…");
        const summary = await runBankSync(120);
        toast({
          title: "Compte connecté",
          description:
            `${summary.imported} nouvelle(s) ligne(s) importée(s)` +
            (summary.balance !== null
              ? ` · solde ${summary.balance.toFixed(2).replace(".", ",")} €`
              : ""),
        });
        navigate("/advance", { replace: true });
      } catch (err) {
        fail((err as Error).message ?? "La connexion a échoué.");
      }
    })();
  }, [params, navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        {failed ? (
          <>
            <h1 className="text-lg font-semibold mb-2">Connexion non aboutie</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button onClick={() => navigate("/stats", { replace: true })}>
              Revenir à l'application
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </>
        )}
      </Card>
    </div>
  );
}
