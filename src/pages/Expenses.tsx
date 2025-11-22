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

const excelSerialToDateString = (serial: number): string => {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const ms = serial * 24 * 60 * 60 * 1000;
  const date = new Date(excelEpoch.getTime() + ms);
  return date.toISOString().slice(0, 10);
};
 
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
        
        const reimbursements: any[] = [];
        let currentPaymentDate: string | null = null;
        let currentPaymentRef: string | null = null;
        
        for (const row of jsonData) {
          if (!Array.isArray(row)) continue;

          const colC = row[2]; // PAYMENT DATE (Excel serial)
          const colF = row[5]; // PAYMENT REFERENCE / DETAILS
          const colI = row[8]; // AMOUNT IN EUROS

          const rowText = row
            .filter((cell) => cell !== null && cell !== undefined)
            .join(' ');

          if (typeof rowText === 'string' && rowText.includes('Total paid by')) {
            break;
          }

          const rawAmount = colI;
          const amount = typeof rawAmount === 'number'
            ? rawAmount
            : parseFloat(String(rawAmount).replace(',', '.'));

          if (isNaN(amount)) {
            // Rule 1: ignore lines without a valid amount
            continue;
          }

          // Rule 2: Parent payment line - new reimbursement batch
          if (typeof colC === 'number') {
            currentPaymentDate = excelSerialToDateString(colC);
            currentPaymentRef = typeof colF === 'string' ? colF.trim() : String(colF ?? '').trim();
            continue;
          }

          const hasNoDate = colC === null || colC === undefined || colC === '';
          const hasDetails = typeof colF === 'string' && colF.trim().length > 0;

          // Rule 3: Child expense line belonging to current payment
          if (hasNoDate && hasDetails && currentPaymentDate && currentPaymentRef) {
            const originalDescription = colF.trim();

            // Try to parse: "ID - DD/MM/YYYY - Category - SubCategory"
            const detailMatch = originalDescription.match(
              /^(\d+)\s*-\s*([0-9/]+)\s*-\s*([^\-]+?)(?:\s*-\s*(.+))?$/
            );

            let expenseNumber = '';
            let expenseDate = currentPaymentDate;
            let category = 'Unknown';

            if (detailMatch) {
              expenseNumber = detailMatch[1].trim();
              const rawDate = detailMatch[2].trim(); // DD/MM/YYYY
              const [day, month, year] = rawDate.split('/');
              if (day && month && year) {
                expenseDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }
              category = detailMatch[3].trim();
            }

            reimbursements.push({
              user_id: sessionData.session.user.id,
              payment_date: currentPaymentDate,
              payment_reference: currentPaymentRef,
              expense_number: expenseNumber,
              expense_date: expenseDate,
              category,
              amount_eur: amount,
            });
          }
        }
        
        if (reimbursements.length > 0) {
          const { error } = await supabase
            .from('reimbursements')
            .insert(reimbursements);

          if (error) throw error;

          // Auto-match reimbursements with expenses
          let matchedCount = 0;
          const { data: allExpenses } = await supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false });

          if (allExpenses) {
            const insertedReimbursements = await supabase
              .from('reimbursements')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(reimbursements.length);

            if (insertedReimbursements.data) {
              for (const reimbursement of insertedReimbursements.data) {
                // Find matching expense by amount, date (±5 days), and optionally expense_number
                const matchingExpense = allExpenses.find((exp) => {
                  const amountMatch = Math.abs(exp.amount_eur - reimbursement.amount_eur) < 0.01;
                  
                  const expDate = new Date(exp.date);
                  const reimbDate = new Date(reimbursement.expense_date);
                  const daysDiff = Math.abs((expDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
                  const dateMatch = daysDiff <= 5;
                  
                  const expenseNumberMatch = !reimbursement.expense_number || 
                    !exp.expense_number || 
                    exp.expense_number === reimbursement.expense_number;
                  
                  return amountMatch && dateMatch && expenseNumberMatch;
                });

                if (matchingExpense) {
                  // Update expense with reimbursement info
                  await supabase
                    .from('expenses')
                    .update({
                      reimbursed_amount: reimbursement.amount_eur,
                      reimbursement_status: 'complete',
                      expense_number: reimbursement.expense_number || matchingExpense.expense_number,
                    })
                    .eq('id', matchingExpense.id);

                  // Update reimbursement with matched expense id
                  await supabase
                    .from('reimbursements')
                    .update({ matched_expense_id: matchingExpense.id })
                    .eq('id', reimbursement.id);

                  matchedCount++;
                }
              }
            }
          }

          toast({
            title: 'Remboursements importés',
            description: `${reimbursements.length} remboursements importés, ${matchedCount} automatiquement associés`,
          });
          
          await loadExpenses();
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
