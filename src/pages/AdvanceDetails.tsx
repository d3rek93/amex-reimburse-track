import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet, Trash2, Plus, ArrowUpCircle, ArrowDownCircle, CheckCircle2 } from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { ManualTransferDialog } from "@/components/ManualTransferDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Transfer {
  id: string;
  transfer_date: string;
  amount_eur: number;
  description: string | null;
}

interface PersonalExpense {
  id: string;
  date: string;
  description: string;
  amount_eur: number;
}

interface ApprovedDiscrepancy {
  groupKey: string;
  expenseNumbers: string[];
  discrepancy: number;
}

const INITIAL_ADVANCE = 1500;

const AdvanceDetails = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [personalExpenses, setPersonalExpenses] = useState<PersonalExpense[]>([]);
  const [approvedDiscrepancies, setApprovedDiscrepancies] = useState<ApprovedDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        if (!currentSession) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (!currentSession) {
        navigate("/auth");
      } else {
        loadData();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadData = async () => {
    try {
      const [transfersResult, expensesResult, reimbursementsResult] = await Promise.all([
        supabase
          .from('manual_transfers')
          .select('*')
          .order('transfer_date', { ascending: false }),
        supabase
          .from('expenses')
          .select('*')
          .eq('is_personal', true)
          .order('date', { ascending: false }),
        supabase
          .from('reimbursements')
          .select('*')
          .eq('discrepancy_approved', true)
      ]);

      if (transfersResult.error) throw transfersResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (reimbursementsResult.error) throw reimbursementsResult.error;

      setTransfers(transfersResult.data || []);
      setPersonalExpenses(expensesResult.data?.map(e => ({
        id: e.id,
        date: e.date,
        description: e.description,
        amount_eur: e.amount_eur
      })) || []);

      // Calculate approved discrepancies by group
      const allExpensesResult = await supabase
        .from('expenses')
        .select('*')
        .eq('is_personal', false);
      
      if (allExpensesResult.error) throw allExpensesResult.error;
      
      const professionalExpenses = allExpensesResult.data || [];
      const approvedReimbursements = reimbursementsResult.data || [];

      // Build expense number graph
      const numberGraph: Record<string, Set<string>> = {};
      professionalExpenses.forEach((exp) => {
        const numbers = exp.expense_number?.filter(Boolean) || [];
        if (numbers.length === 0) return;
        numbers.forEach((num: string) => {
          if (!numberGraph[num]) numberGraph[num] = new Set();
          numbers.forEach((other: string) => {
            if (other !== num) numberGraph[num].add(other);
          });
        });
      });

      // Find connected components
      const visited = new Set<string>();
      const groupTotals: Record<string, { expenseNumbers: string[]; totalExpenseAmount: number }> = {};
      const numberToGroup: Record<string, string> = {};

      const buildComponent = (start: string): string[] => {
        const stack = [start];
        const component: string[] = [];
        while (stack.length) {
          const current = stack.pop()!;
          if (visited.has(current)) continue;
          visited.add(current);
          component.push(current);
          numberGraph[current]?.forEach((neighbor) => {
            if (!visited.has(neighbor)) stack.push(neighbor);
          });
        }
        return component.sort();
      };

      Object.keys(numberGraph).forEach((num) => {
        if (visited.has(num)) return;
        const component = buildComponent(num);
        const groupKey = component.join('|');
        groupTotals[groupKey] = { expenseNumbers: component, totalExpenseAmount: 0 };
        component.forEach((n) => { numberToGroup[n] = groupKey; });
      });

      // Sum expense amounts by group
      professionalExpenses.forEach((exp) => {
        const numbers = exp.expense_number?.filter(Boolean) || [];
        if (numbers.length === 0) return;
        const groupKey = numberToGroup[numbers[0]] || numbers.sort().join('|');
        if (!groupTotals[groupKey]) {
          groupTotals[groupKey] = { expenseNumbers: Array.from(new Set(numbers)).sort(), totalExpenseAmount: 0 };
        }
        groupTotals[groupKey].totalExpenseAmount += exp.amount_eur;
      });

      // Calculate reimbursement totals by group for approved discrepancies
      const reimbursementsByGroup = new Map<string, number>();
      approvedReimbursements.forEach((r) => {
        const groupKey = numberToGroup[r.expense_number] || r.expense_number;
        const current = reimbursementsByGroup.get(groupKey) || 0;
        reimbursementsByGroup.set(groupKey, current + r.amount_eur);
      });

      // Build approved discrepancies list
      const discrepancies: ApprovedDiscrepancy[] = [];
      reimbursementsByGroup.forEach((totalReimbursement, groupKey) => {
        const groupInfo = groupTotals[groupKey];
        if (!groupInfo) return;
        const diff = totalReimbursement - groupInfo.totalExpenseAmount;
        if (Math.abs(diff) > 0.01) {
          discrepancies.push({
            groupKey,
            expenseNumbers: groupInfo.expenseNumbers,
            discrepancy: diff
          });
        }
      });

      setApprovedDiscrepancies(discrepancies);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('manual_transfers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Virement supprimé",
        description: "Le virement a été supprimé avec succès",
      });

      loadData();
    } catch (error) {
      console.error('Error deleting transfer:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le virement",
        variant: "destructive",
      });
    }
  };

  // Neutraliser les dépenses personnelles annulées/remboursées :
  // chaque montant négatif (remboursement) annule une dépense de même montant absolu
  const excludedIds = new Set<string>();
  personalExpenses
    .filter((e) => e.amount_eur < 0)
    .forEach((refund) => {
      excludedIds.add(refund.id);
      const match = personalExpenses.find(
        (e) =>
          e.amount_eur > 0 &&
          !excludedIds.has(e.id) &&
          Math.abs(e.amount_eur - Math.abs(refund.amount_eur)) < 0.01
      );
      if (match) excludedIds.add(match.id);
    });
  const activePersonalExpenses = personalExpenses.filter((e) => !excludedIds.has(e.id));

  const totalTransfers = transfers.reduce((sum, t) => sum + t.amount_eur, 0);
  const totalPersonal = activePersonalExpenses.reduce((sum, e) => sum + e.amount_eur, 0);
  const totalDiscrepancies = approvedDiscrepancies.reduce((sum, d) => sum + d.discrepancy, 0);
  const currentBalance = INITIAL_ADVANCE - totalPersonal + totalTransfers + totalDiscrepancies;


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation onUpload={() => navigate('/expenses?openUpload=true')} />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Wallet className="h-8 w-8" />
            Détail de l'avance de frais
          </h1>
          <p className="text-muted-foreground">
            Suivi détaillé des opérations affectant votre avance de frais
          </p>
        </div>

        {/* Summary Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Avance initiale</p>
                <p className="text-xl font-bold">+{INITIAL_ADVANCE.toFixed(2)} €</p>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <p className="text-sm text-muted-foreground">Dépenses perso.</p>
                <p className="text-xl font-bold text-red-600">-{totalPersonal.toFixed(2)} €</p>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-sm text-muted-foreground">Virements</p>
                <p className="text-xl font-bold text-green-600">+{totalTransfers.toFixed(2)} €</p>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-sm text-muted-foreground">Écarts approuvés</p>
                <p className="text-xl font-bold text-blue-600">+{totalDiscrepancies.toFixed(2)} €</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${currentBalance >= INITIAL_ADVANCE ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                <p className="text-sm text-muted-foreground">Solde actuel</p>
                <p className={`text-xl font-bold ${currentBalance >= INITIAL_ADVANCE ? 'text-green-600' : 'text-red-600'}`}>
                  {currentBalance.toFixed(2)} €
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transfers Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ArrowUpCircle className="h-5 w-5 text-green-600" />
                Virements ({transfers.length})
              </CardTitle>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Aucun virement</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell>{format(new Date(transfer.transfer_date), 'dd MMM yyyy', { locale: fr })}</TableCell>
                        <TableCell>{transfer.description || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${transfer.amount_eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {transfer.amount_eur >= 0 ? '+' : ''}{transfer.amount_eur.toFixed(2)} €
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer ce virement ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Cette action est irréversible.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTransfer(transfer.id)}>
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Personal Expenses Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownCircle className="h-5 w-5 text-red-600" />
                Dépenses personnelles ({activePersonalExpenses.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activePersonalExpenses.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Aucune dépense personnelle</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activePersonalExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{format(new Date(expense.date), 'dd MMM yyyy', { locale: fr })}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{expense.description}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          -{expense.amount_eur.toFixed(2)} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Approved Discrepancies Section */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                Écarts approuvés ({approvedDiscrepancies.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approvedDiscrepancies.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Aucun écart approuvé</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Notes de frais</TableHead>
                      <TableHead className="text-right">Écart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedDiscrepancies.map((discrepancy) => (
                      <TableRow key={discrepancy.groupKey}>
                        <TableCell>{discrepancy.expenseNumbers.join(', ')}</TableCell>
                        <TableCell className="text-right font-medium text-blue-600">
                          {discrepancy.discrepancy > 0 ? '+' : ''}{discrepancy.discrepancy.toFixed(2)} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ManualTransferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          loadData();
          setDialogOpen(false);
        }}
      />
    </div>
  );
};

export default AdvanceDetails;