import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ExpenseUpload } from "@/components/ExpenseUpload";
import { ExpenseTable, Expense } from "@/components/ExpenseTable";
import { ExpenseFilters } from "@/components/ExpenseFilters";
import { ExpenseStats } from "@/components/ExpenseStats";
import { useToast } from "@/hooks/use-toast";
import { FileText, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      const formattedExpenses: Expense[] = data.map((expense) => ({
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
      }));

      setExpenses(formattedExpenses);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les dépenses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive",
        });
        return;
      }

      // Convert file to base64
      const reader = new FileReader();
      const fileContent = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('parse-amex-pdf', {
        body: { 
          fileName: file.name,
          fileContent: fileContent.split(',')[1], // Remove data:application/pdf;base64, prefix
        },
      });

      if (error) throw error;

      toast({
        title: "Relevé importé avec succès",
        description: `${data.transactionsCount} transactions détectées`,
      });

      // Reload expenses after upload
      await loadExpenses();
    } catch (error) {
      console.error('Error uploading PDF:', error);
      toast({
        title: "Erreur d'import",
        description: "Impossible de traiter le fichier PDF",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const dbUpdates: any = {};
      
      if (updates.expenseNumber !== undefined) dbUpdates.expense_number = updates.expenseNumber;
      if (updates.reimbursementStatus !== undefined) dbUpdates.reimbursement_status = updates.reimbursementStatus;
      if (updates.reimbursedAmount !== undefined) dbUpdates.reimbursed_amount = updates.reimbursedAmount;
      if (updates.isPersonal !== undefined) dbUpdates.is_personal = updates.isPersonal;

      const { error } = await supabase
        .from('expenses')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      setExpenses((prev) =>
        prev.map((expense) => (expense.id === id ? { ...expense, ...updates } : expense))
      );
    } catch (error) {
      console.error('Error updating expense:', error);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la dépense",
        variant: "destructive",
      });
    }
  };

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch =
      expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.expenseNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const expenseDate = new Date(expense.date);
    const matchesStartDate = !startDate || expenseDate >= new Date(startDate);
    const matchesEndDate = !endDate || expenseDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const handleResetFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
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
      <div className="container mx-auto py-8 px-4 space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-3">
              <FileText className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Suivi des Notes de Frais
              </h1>
              <p className="text-muted-foreground">
                Gérez vos remboursements AMEX en toute simplicité
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </Button>
        </header>

        {expenses.length === 0 ? (
          <div className="space-y-4">
            {uploading && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Traitement du PDF en cours...</span>
              </div>
            )}
            <ExpenseUpload onUpload={handleUpload} />
          </div>
        ) : (
          <>
            <ExpenseStats expenses={expenses} />
            
            <ExpenseFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onReset={handleResetFilters}
            />

            <ExpenseTable
              expenses={filteredExpenses}
              onUpdateExpense={handleUpdateExpense}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
