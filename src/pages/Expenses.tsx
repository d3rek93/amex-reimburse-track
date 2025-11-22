import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { ExpenseUpload } from "@/components/ExpenseUpload";
import { ExpenseTable, Expense } from "@/components/ExpenseTable";
import { ExpenseFilters } from "@/components/ExpenseFilters";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as XLSX from 'xlsx';

const Expenses = () => {
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
  const [showUploadDialog, setShowUploadDialog] = useState(false);

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
        source: (expense.source as "AMEX" | "Boursobank" | "Manuel") || "AMEX",
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

  const checkForDuplicates = async (newExpenses: any[]) => {
    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('date, amount_eur, description');

    if (!existingExpenses) return newExpenses;

    // Filter out duplicates (same date, amount, and description)
    return newExpenses.filter((newExp) => {
      return !existingExpenses.some((existing) => 
        existing.date === newExp.date &&
        Math.abs(existing.amount_eur - newExp.amount_eur) < 0.01 &&
        existing.description === newExp.description
      );
    });
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

      let expenses: any[] = [];

      // Check if it's a CSV file
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split('\n');
        
        const isBoursobank = lines[0] && lines[0].includes('dateOp;dateVal;label;') && lines[0].includes('accountLabel');
        
        if (isBoursobank) {
          const dataLines = lines.slice(1).filter(line => line.trim());
          
          expenses = dataLines.map(line => {
            const columns = line.split(';').map(col => col.replace(/^"?|"?$/g, '').trim());
            
            if (columns.length < 11) return null;
            
            const dateOp = columns[0];
            const label = columns[2];
            const amountStr = columns[6];
            const accountLabel = columns[9];
            
            if (accountLabel !== 'VISA ULTIM' || !label.startsWith('CARTE')) return null;
            
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
              source: 'Boursobank',
            };
          }).filter(Boolean);
        } else {
          const dataLines = lines.slice(1).filter(line => line.trim());
          
          expenses = dataLines.map(line => {
            const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
            if (!matches || matches.length < 3) return null;
            
            const dateStr = matches[0].replace(/^,?"?|"?$/g, '');
            const description = matches[1].replace(/^,?"?|"?$/g, '');
            const amountStr = matches[2].replace(/^,?"?|"?$/g, '').replace(',', '.');
            
            const [month, day, year] = dateStr.split('/');
            const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            
            const amount = Math.abs(parseFloat(amountStr));
            
            if (amountStr.startsWith('-')) return null;
            
            return {
              user_id: sessionData.session.user.id,
              date,
              description,
              amount_eur: amount,
              reimbursement_status: 'pending',
              reimbursed_amount: 0,
              is_personal: false,
              source: 'AMEX',
            };
          }).filter(Boolean);
        }
      } else if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        // Handle XLS/XLSX files (reimbursements)
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        
        // Parse reimbursements from XLS
        const reimbursements: any[] = [];
        let currentPaymentDate = '';
        let currentPaymentRef = '';
        
        for (const row of jsonData) {
          // PAYMENT DATE is in column C (index 2)
          // PAYMENT REFERENCE / DETAILS is in column F (index 5)
          // AMOUNT IN EUROS is in column I (index 8)
          if (row[2] && typeof row[2] === 'string' && row[2].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            // This is a payment date row
            currentPaymentDate = row[2];
            currentPaymentRef = row[5] || '';
          } else if (row[5] && typeof row[5] === 'string' && row[5].match(/^\d+\s-/)) {
            // This is an expense detail row
            const parts = row[5].split(' - ');
            if (parts.length >= 3) {
              const expenseNumber = parts[0].trim();
              const expenseDate = parts[1].trim();
              const category = parts.slice(2).join(' - ').trim();
              const amount = parseFloat(row[8]);
              
              if (!isNaN(amount)) {
                // Convert date from DD/MM/YYYY to YYYY-MM-DD
                const [day, month, year] = expenseDate.split('/');
                const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                
                reimbursements.push({
                  user_id: sessionData.session.user.id,
                  payment_date: currentPaymentDate,
                  payment_reference: currentPaymentRef,
                  expense_number: expenseNumber,
                  expense_date: formattedDate,
                  category,
                  amount_eur: amount,
                });
              }
            }
          }
        }
        
        if (reimbursements.length > 0) {
          // Insert reimbursements
          const { error } = await supabase
            .from('reimbursements')
            .insert(reimbursements);

          if (error) throw error;

          toast({
            title: "Remboursements importés",
            description: `${reimbursements.length} remboursements importés`,
          });
          
          setShowUploadDialog(false);
          return;
        }
      }

      if (expenses.length === 0) {
        toast({
          title: "Aucune transaction trouvée",
          description: "Le fichier ne contient pas de transactions valides",
          variant: "destructive",
        });
        return;
      }

      // Check for duplicates
      const uniqueExpenses = await checkForDuplicates(expenses);
      const duplicateCount = expenses.length - uniqueExpenses.length;

      if (uniqueExpenses.length === 0) {
        toast({
          title: "Doublons détectés",
          description: `Toutes les ${expenses.length} transactions sont déjà présentes`,
          variant: "destructive",
        });
        return;
      }

      // Insert unique expenses
      const { error } = await supabase
        .from('expenses')
        .insert(uniqueExpenses);

      if (error) throw error;

      toast({
        title: "Import réussi",
        description: duplicateCount > 0 
          ? `${uniqueExpenses.length} transactions importées, ${duplicateCount} doublons ignorés`
          : `${uniqueExpenses.length} transactions importées`,
      });

      await loadExpenses();
      setShowUploadDialog(false);
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

  const handleDeleteExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setExpenses((prev) => prev.filter((expense) => expense.id !== id));
      
      toast({
        title: "Dépense supprimée",
        description: "La dépense a été supprimée avec succès",
      });
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la dépense",
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

    const matchesPersonal = showPersonal || !expense.isPersonal;
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
      <Navigation onUpload={() => setShowUploadDialog(true)} />
      
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Dépenses</h1>
            <p className="text-muted-foreground">
              Gérez vos dépenses professionnelles
            </p>
          </div>
        </div>

        {uploading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground bg-muted p-4 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Traitement du fichier en cours...</span>
          </div>
        )}
        
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <p className="text-muted-foreground">Aucune dépense enregistrée</p>
            <Button onClick={() => setShowUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Importer des dépenses
            </Button>
          </div>
        ) : (
          <>
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

            <ExpenseTable
              expenses={filteredExpenses}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
            />
          </>
        )}
      </div>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer des fichiers</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <ExpenseUpload onUpload={handleUpload} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
