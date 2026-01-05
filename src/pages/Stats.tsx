import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { ExpenseStats } from "@/components/ExpenseStats";
import { Expense } from "@/components/ExpenseTable";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Session } from "@supabase/supabase-js";

const Stats = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reimbursements, setReimbursements] = useState<any[]>([]);
  const [manualTransfers, setManualTransfers] = useState<any[]>([]);
  const [balanceReference, setBalanceReference] = useState<{ amount_eur: number; reference_date: string } | null>(null);
  const [loading, setLoading] = useState(true);

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
        loadExpenses();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadExpenses = async () => {
    try {
      const [expensesResult, reimbursementsResult, transfersResult, balanceRefResult] = await Promise.all([
        supabase
          .from('expenses')
          .select('*')
          .order('date', { ascending: false }),
        supabase
          .from('reimbursements')
          .select('*'),
        supabase
          .from('manual_transfers')
          .select('*')
          .order('transfer_date', { ascending: false }),
        supabase
          .from('balance_references')
          .select('amount_eur, reference_date')
          .maybeSingle()
      ]);

      if (expensesResult.error) throw expensesResult.error;
      if (reimbursementsResult.error) throw reimbursementsResult.error;
      if (balanceRefResult.error) throw balanceRefResult.error;

      const formattedExpenses: Expense[] = expensesResult.data.map((expense) => ({
        id: expense.id,
        date: expense.date,
        description: expense.description,
        originalAmount: expense.original_amount ?? undefined,
        originalCurrency: expense.original_currency ?? undefined,
        conversionFees: expense.conversion_fees ?? undefined,
        amountEur: expense.amount_eur,
        expenseNumber: expense.expense_number ?? undefined,
        reimbursementStatus: expense.reimbursement_status as "pending" | "partial" | "complete",
        reimbursedAmount: expense.reimbursed_amount,
        isPersonal: expense.is_personal,
        source: (expense.source as "AMEX" | "Boursobank" | "Manuel") || "AMEX",
      }));

      setExpenses(formattedExpenses);
      setReimbursements(reimbursementsResult.data || []);
      setManualTransfers(transfersResult.data || []);
      setBalanceReference(balanceRefResult.data);
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Statistiques</h1>
          <p className="text-muted-foreground">
            Vue d'ensemble de vos dépenses professionnelles
          </p>
        </div>
        <ExpenseStats 
          expenses={expenses} 
          reimbursements={reimbursements}
          manualTransfers={manualTransfers}
          balanceReference={balanceReference}
          onTransferAdded={loadExpenses}
          onBalanceReferenceUpdated={loadExpenses}
        />
      </div>
    </div>
  );
};

export default Stats;
