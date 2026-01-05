import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingDown, TrendingUp, Wallet, Settings } from "lucide-react";
import { useState } from "react";
import { ManualTransferDialog } from "./ManualTransferDialog";
import { SetBalanceReferenceDialog } from "./SetBalanceReferenceDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface BalanceReference {
  amount_eur: number;
  reference_date: string;
}

interface AdvanceBalanceCardProps {
  targetAdvance: number;
  balanceReference: BalanceReference | null;
  personalExpensesSinceRef: number;
  manualTransfersSinceRef: number;
  onTransferAdded: () => void;
  onBalanceReferenceUpdated: () => void;
}

export const AdvanceBalanceCard = ({
  targetAdvance,
  balanceReference,
  personalExpensesSinceRef,
  manualTransfersSinceRef,
  onTransferAdded,
  onBalanceReferenceUpdated,
}: AdvanceBalanceCardProps) => {
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);

  // Calculate current balance from reference
  const referenceAmount = balanceReference?.amount_eur ?? 0;
  const currentBalance = referenceAmount - personalExpensesSinceRef + manualTransfersSinceRef;
  const amountNeededForTarget = targetAdvance - currentBalance;
  const isHealthy = currentBalance >= targetAdvance;

  return (
    <>
      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              État de l'avance de frais
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBalanceDialogOpen(true)}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Solde réf.
              </Button>
              <Button
                size="sm"
                onClick={() => setTransferDialogOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Virement
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-4">
            {/* Current balance */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Solde actuel estimé</p>
                <p className={`text-2xl font-bold ${isHealthy ? 'text-green-600' : 'text-red-600'}`}>
                  {currentBalance.toFixed(2)} €
                </p>
              </div>
              {isHealthy ? (
                <TrendingUp className="h-8 w-8 text-green-600" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-600" />
              )}
            </div>

            {/* Reference info */}
            {balanceReference ? (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Solde de référence : <strong>{balanceReference.amount_eur.toFixed(2)} €</strong> au{" "}
                {format(new Date(balanceReference.reference_date), "d MMMM yyyy", { locale: fr })}
              </div>
            ) : (
              <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                ⚠️ Aucun solde de référence défini. Cliquez sur "Solde réf." pour initialiser.
              </div>
            )}

            {/* Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Objectif d'avance</span>
                <span className="font-medium">{targetAdvance.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Solde de référence</span>
                <span className="font-medium">{referenceAmount.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Dépenses perso depuis réf.</span>
                <span className="font-medium text-red-600">-{personalExpensesSinceRef.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Virements depuis réf.</span>
                <span className="font-medium text-green-600">+{manualTransfersSinceRef.toFixed(2)} €</span>
              </div>
            </div>

            {/* Alert if balance needs adjustment */}
            {!isHealthy && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  Effectuez un virement de <strong>{amountNeededForTarget.toFixed(2)} €</strong> pour revenir à {targetAdvance.toFixed(2)} € d'avance.
                </p>
              </div>
            )}
            {isHealthy && currentBalance > targetAdvance && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  Vous avez <strong>{(currentBalance - targetAdvance).toFixed(2)} €</strong> au-dessus de votre objectif d'avance.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ManualTransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onSuccess={() => {
          onTransferAdded();
          setTransferDialogOpen(false);
        }}
      />

      <SetBalanceReferenceDialog
        open={balanceDialogOpen}
        onOpenChange={setBalanceDialogOpen}
        currentReference={balanceReference}
        onSuccess={() => {
          onBalanceReferenceUpdated();
          setBalanceDialogOpen(false);
        }}
      />
    </>
  );
};
