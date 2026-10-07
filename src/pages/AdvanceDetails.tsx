import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wallet, Info } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdvancePosition, loadAdvancePosition } from "@/lib/advance";
import { eur } from "@/components/AdvanceSummaryCard";

const fmt = (d: string) => format(new Date(d), "d MMM yyyy", { locale: fr });

const AdvanceDetails = () => {
  const navigate = useNavigate();
  const [pos, setPos] = useState<AdvancePosition | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth");
      else loadAdvancePosition().then(setPos).catch(console.error);
    });
  }, [navigate]);

  if (!pos) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const ok = pos.toTopUp <= 0;
  const rows = [
    { label: "Solde réel du compte pro", hint: pos.snapshot ? `Relevé Boursobank du ${fmt(pos.snapshot.snapshot_date)}` : "Aucun relevé importé", value: pos.bankBalance },
    { label: "Ce que Jetfly te doit", hint: `${pos.owedExpenses.length} dépense(s) pro pas encore remboursée(s)`, value: pos.owedByJetfly },
    { label: "Dépenses AMEX pas encore prélevées", hint: pos.amexUnpaidSince ? `Depuis le ${fmt(pos.amexUnpaidSince)}` : "Date du dernier prélèvement AMEX inconnue", value: -pos.amexUnpaid },
    { label: "Achats carte Boursobank pas encore débités", hint: "Débit différé de fin de mois", value: -pos.cardUnpaid },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation onUpload={() => navigate("/expenses?openUpload=true")} />
      <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Wallet className="h-8 w-8" /> Avance Jetfly
        </h1>

        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Avance confiée par Jetfly : {eur(pos.target)}</p>
            <p className={`text-4xl font-bold ${ok ? "text-success" : "text-destructive"}`}>
              {ok ? `Tu peux récupérer ${eur(-pos.toTopUp)}` : `À remettre de ta poche : ${eur(pos.toTopUp)}`}
            </p>
            <p className="text-muted-foreground">Position actuelle de l'avance : {eur(pos.position)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Comment c'est calculé</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell>
                      <p className="font-medium">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{r.hint}</p>
                    </TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {r.value >= 0 ? "+ " : "− "}{eur(Math.abs(r.value))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-bold">= Position de l'avance</TableCell>
                  <TableCell className="text-right font-bold">{eur(pos.position)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-4 flex gap-2">
              <Info className="h-4 w-4 shrink-0" />
              Tes dépenses perso, les écarts acceptés et tes virements perso sont déjà inclus dans le solde réel du compte : plus besoin de les saisir.
              Importe ton dernier relevé Boursobank (et AMEX) pour mettre ce chiffre à jour.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dépenses pro en attente de remboursement ({pos.owedExpenses.length})</CardTitle></CardHeader>
          <CardContent>
            {pos.owedExpenses.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Aucune</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Montant</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {[...pos.owedExpenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{fmt(e.date)}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{e.description}</TableCell>
                      <TableCell className="text-right">{eur(e.amount_eur - (e.reimbursed_amount || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdvanceDetails;
