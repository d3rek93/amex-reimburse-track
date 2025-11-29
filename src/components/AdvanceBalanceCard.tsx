import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { ManualTransferDialog } from "./ManualTransferDialog";

interface AdvanceBalanceCardProps {
  initialAdvance: number;
  personalExpenses: number;
  professionalExpenses: number;
  reimbursementsReceived: number;
  approvedDiscrepancies: number;
  manualTransfers: number;
  onTransferAdded: () => void;
}

export const AdvanceBalanceCard = ({
  initialAdvance,
  personalExpenses,
  professionalExpenses,
  reimbursementsReceived,
  approvedDiscrepancies,
  manualTransfers,
  onTransferAdded,
}: AdvanceBalanceCardProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Calculate current balance
  // Initial advance - personal expenses - professional expenses (up to previous month) + reimbursements - approved discrepancies + manual transfers
  const currentBalance = initialAdvance - personalExpenses - professionalExpenses + reimbursementsReceived - approvedDiscrepancies + manualTransfers;
  const isHealthy = currentBalance >= initialAdvance;

  return (
    <>
      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              État de l'avance de frais
            </div>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Virement
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-4">
            {/* Current balance */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Solde actuel de l'avance</p>
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

            {/* Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Avance initiale</span>
                <span className="font-medium">+{initialAdvance.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Dépenses personnelles</span>
                <span className="font-medium text-red-600">-{personalExpenses.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Dépenses professionnelles (jusqu'au mois précédent)</span>
                <span className="font-medium text-red-600">-{professionalExpenses.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Remboursements reçus</span>
                <span className="font-medium text-green-600">+{reimbursementsReceived.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Écarts approuvés</span>
                <span className="font-medium text-red-600">-{approvedDiscrepancies.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Virements manuels</span>
                <span className="font-medium text-green-600">+{manualTransfers.toFixed(2)} €</span>
              </div>
            </div>

            {/* Alert if balance is low */}
            {!isHealthy && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  Votre avance est en déficit de <strong>{Math.abs(currentBalance - initialAdvance).toFixed(2)} €</strong>.
                  Effectuez un virement pour rétablir l'équilibre.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ManualTransferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          onTransferAdded();
          setDialogOpen(false);
        }}
      />
    </>
  );
};
