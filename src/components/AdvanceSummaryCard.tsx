import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AdvancePosition, loadAdvancePosition } from "@/lib/advance";

export const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export const AdvanceSummaryCard = () => {
  const [pos, setPos] = useState<AdvancePosition | null>(null);

  useEffect(() => {
    loadAdvancePosition().then(setPos).catch(console.error);
  }, []);

  if (!pos) return <Card className="p-6 h-28 animate-pulse" />;

  const ok = pos.toTopUp <= 0;
  return (
    <Card className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className={`rounded-full p-3 ${ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Avance Jetfly ({eur(pos.target)})</p>
          {!pos.snapshot ? (
            <p className="text-lg font-semibold">Importe un relevé Boursobank pour calculer ta position</p>
          ) : (
            <>
              <p className={`text-2xl font-bold ${ok ? "text-success" : "text-destructive"}`}>
                {ok ? `Tu peux récupérer ${eur(-pos.toTopUp)}` : `À remettre : ${eur(pos.toTopUp)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Position {eur(pos.position)} · solde du{" "}
                {format(new Date(pos.snapshot.snapshot_date), "d MMM yyyy", { locale: fr })}
              </p>
            </>
          )}
        </div>
      </div>
      <Button asChild variant="outline">
        <Link to="/advance">
          Détail <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
      </Button>
    </Card>
  );
};
