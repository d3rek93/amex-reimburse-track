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
  const [showPersonal, setShowPersonal] = useState(false);
  const [showReimbursed, setShowReimbursed] = useState(false);
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

      // Check if it's a CSV file
      if (file.name.endsWith('.csv')) {
        // Parse CSV file
        const text = await file.text();
        const lines = text.split('\n');
        
        // Check if it's a Boursobank CSV (contains semicolon separator and specific columns)
        const isBoursobank = lines[0] && lines[0].includes('dateOp;dateVal;label;') && lines[0].includes('accountLabel');
        
        let expenses;
        
        if (isBoursobank) {
          // Parse Boursobank format
          const dataLines = lines.slice(1).filter(line => line.trim());
          
          expenses = dataLines.map(line => {
            // Split by semicolon
            const columns = line.split(';').map(col => col.replace(/^"?|"?$/g, '').trim());
            
            if (columns.length < 11) return null;
            
            const dateOp = columns[0];
            const label = columns[2];
            const amountStr = columns[6];
            const accountLabel = columns[9];
            
            // Filter: only VISA ULTIM and CARTE transactions
            if (accountLabel !== 'VISA ULTIM' || !label.startsWith('CARTE')) return null;
            
            // Parse amount (replace comma with dot, get absolute value)
            const amount = Math.abs(parseFloat(amountStr.replace(',', '.')));
            
            if (isNaN(amount)) return null;
            
            return {
              user_id: sessionData.session.user.id,
              date: dateOp,
              description: label,
              amount_eur: amount,
              reimbursement_status: 'pending',
              reimbursed_amount: 0,
              is_personal: false,
            };
          }).filter(Boolean);
        } else {
          // Parse AMEX format (comma-separated)
          const dataLines = lines.slice(1).filter(line => line.trim());
          
          expenses = dataLines.map(line => {
            // Parse CSV line (handle quoted values)
            const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
            if (!matches || matches.length < 3) return null;
            
            const dateStr = matches[0].replace(/^,?"?|"?$/g, '');
            const description = matches[1].replace(/^,?"?|"?$/g, '');
            const amountStr = matches[2].replace(/^,?"?|"?$/g, '').replace(',', '.');
            
            // Parse date (MM/DD/YYYY to YYYY-MM-DD)
            const [month, day, year] = dateStr.split('/');
            const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            
            // Parse amount (remove quotes and convert comma to dot)
            const amount = Math.abs(parseFloat(amountStr));
            
            // Skip negative amounts (payments)
            if (amountStr.startsWith('-')) return null;
            
            return {
              user_id: sessionData.session.user.id,
              date,
              description,
              amount_eur: amount,
              reimbursement_status: 'pending',
              reimbursed_amount: 0,
              is_personal: false,
            };
          }).filter(Boolean);
        }

        if (expenses.length === 0) {
          toast({
            title: "Aucune transaction trouvée",
            description: "Le fichier CSV ne contient pas de transactions valides",
            variant: "destructive",
          });
          return;
        }

        // Insert all expenses
        const { error } = await supabase
          .from('expenses')
          .insert(expenses);

        if (error) throw error;

        toast({
          title: "Import réussi",
          description: `${expenses.length} transactions importées`,
        });

        await loadExpenses();
      } else {
        // Handle PDF files (existing code)
        const reader = new FileReader();
        const fileContent = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { data, error } = await supabase.functions.invoke('parse-amex-pdf', {
          body: { 
            fileName: file.name,
            fileContent: fileContent.split(',')[1],
          },
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });

        if (error) throw error;

        toast({
          title: "Relevé importé avec succès",
          description: `${data.transactionsCount} transactions détectées`,
        });

        await loadExpenses();
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Erreur d'import",
        description: "Impossible de traiter le fichier",
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

    // Filter out personal expenses if showPersonal is false
    const matchesPersonal = showPersonal || !expense.isPersonal;
    
    // Filter out reimbursed expenses if showReimbursed is false
    const matchesReimbursed = showReimbursed || expense.reimbursementStatus === "pending";

    return matchesSearch && matchesStartDate && matchesEndDate && matchesPersonal && matchesReimbursed;
  });

  const handleResetFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setShowPersonal(false);
    setShowReimbursed(false);
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

        <div className="space-y-4">
          {uploading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Traitement du fichier en cours...</span>
            </div>
          )}
          
          {expenses.length === 0 ? (
            <ExpenseUpload onUpload={handleUpload} />
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
                showPersonal={showPersonal}
                showReimbursed={showReimbursed}
                onShowPersonalChange={setShowPersonal}
                onShowReimbursedChange={setShowReimbursed}
                onReset={handleResetFilters}
              />

              <div className="flex justify-end mb-4">
                <ExpenseUpload onUpload={handleUpload} />
              </div>

              <ExpenseTable
                expenses={filteredExpenses}
                onUpdateExpense={handleUpdateExpense}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
