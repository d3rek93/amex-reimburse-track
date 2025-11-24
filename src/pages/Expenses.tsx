import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { ExpenseUpload } from "@/components/ExpenseUpload";
import { ExpenseTable, Expense } from "@/components/ExpenseTable";
import { ExpenseFilters } from "@/components/ExpenseFilters";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, RefreshCw } from "lucide-react";
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
  const [showPending, setShowPending] = useState(true);
  const [showPartial, setShowPartial] = useState(true);
  const [showComplete, setShowComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);

  useEffect(() => {
    // Check for expense parameter in URL
    const params = new URLSearchParams(window.location.search);
    const expenseId = params.get('expense');
    if (expenseId) {
      setHighlightedExpenseId(expenseId);
      // Clear URL parameter
      window.history.replaceState({}, '', window.location.pathname);
      // Clear highlight after 3 seconds
      setTimeout(() => setHighlightedExpenseId(null), 3000);
    }
  }, []);

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
        expenseNumber: expense.expense_number as string[] | undefined,
        reimbursementStatus: expense.reimbursement_status as "pending" | "partial" | "complete",
        reimbursedAmount: expense.reimbursed_amount,
        isPersonal: expense.is_personal,
        source: (expense.source as "AMEX" | "Boursobank" | "Manuel") || "AMEX",
        consideredComplete: expense.considered_complete ?? false,
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
            
            // Include VISA ULTIM CARTE transactions and any transaction with "orange" in label
            const isVisaUltim = accountLabel === 'VISA ULTIM' && label.startsWith('CARTE');
            const isOrange = label.toLowerCase().includes('orange');
            
            if (!isVisaUltim && !isOrange) return null;
            
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
        
        // Get existing reimbursements for duplicate check
        const { data: existingReimbursements } = await supabase
          .from('reimbursements')
          .select('payment_date, expense_date, amount_eur, expense_number');
        
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

            // Check for duplicate before adding
            const isDuplicate = existingReimbursements?.some((existing) => 
              existing.payment_date === currentPaymentDate &&
              existing.expense_date === expenseDate &&
              Math.abs(existing.amount_eur - amount) < 0.01 &&
              existing.expense_number === expenseNumber
            );

            if (!isDuplicate) {
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
        }
        
        if (reimbursements.length > 0) {
          const { error } = await supabase
            .from('reimbursements')
            .insert(reimbursements);

          if (error) throw error;

          // Auto-match reimbursements with expenses
          const matchedCount = await matchReimbursementsWithExpenses(reimbursements.length);

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
      if (updates.consideredComplete !== undefined) dbUpdates.considered_complete = updates.consideredComplete;

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

  const matchReimbursementsWithExpenses = async (limitCount?: number) => {
    const { data: allExpenses } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });

    if (!allExpenses) return 0;

    const reimbursementsQuery = supabase
      .from('reimbursements')
      .select('*')
      .order('created_at', { ascending: false });

    if (limitCount) {
      reimbursementsQuery.limit(limitCount);
    }

    const { data: reimbursementsData } = await reimbursementsQuery;
    if (!reimbursementsData) return 0;

    // Group reimbursements by expense_number and sum amounts
    const groupedReimbursements = new Map<string, typeof reimbursementsData>();
    const ungroupedReimbursements: typeof reimbursementsData = [];

    for (const reimbursement of reimbursementsData) {
      if (reimbursement.expense_number) {
        if (!groupedReimbursements.has(reimbursement.expense_number)) {
          groupedReimbursements.set(reimbursement.expense_number, []);
        }
        groupedReimbursements.get(reimbursement.expense_number)!.push(reimbursement);
      } else {
        ungroupedReimbursements.push(reimbursement);
      }
    }

    let matchedCount = 0;

    // Process grouped reimbursements (with same expense_number)
    for (const [expenseNumber, reimbursements] of groupedReimbursements) {
      const totalAmount = reimbursements.reduce((sum, r) => sum + r.amount_eur, 0);
      const isGsmGroup = reimbursements.every(r => r.category?.toLowerCase().includes('gsm'));
      const allMatched = reimbursements.every(r => r.matched_expense_id);
      
      // For non-GSM groups, skip if everything is already matched
      if (allMatched && !isGsmGroup) continue;

      // Try single expense match based on explicit expense_number first
      const matchingExpense = allExpenses.find((exp) => {
        const amountMatch = Math.abs(exp.amount_eur - totalAmount) < 0.01;
        const hasExpenseNumber = Array.isArray(exp.expense_number) 
          ? exp.expense_number.includes(expenseNumber)
          : exp.expense_number === expenseNumber;
        
        return amountMatch && hasExpenseNumber;
      });

      if (matchingExpense) {
        for (const reimbursement of reimbursements) {
          await supabase
            .from('reimbursements')
            .update({ matched_expense_id: matchingExpense.id })
            .eq('id', reimbursement.id);
        }

        await supabase
          .from('expenses')
          .update({
            reimbursed_amount: totalAmount,
            reimbursement_status: 'complete',
          })
          .eq('id', matchingExpense.id);

        matchedCount += reimbursements.length;
        continue;
      }

      // Special case: GSM reimbursements matching Orange expenses by month + amount
      if (isGsmGroup) {
        const referenceReimbursement = reimbursements[0];
        const reimbDate = new Date(referenceReimbursement.expense_date);

        const orangeExpense = allExpenses.find((exp) => {
          const isOrange = exp.description?.toUpperCase().includes('ORANGE');
          if (!isOrange) return false;

          const amountMatch = Math.abs(exp.amount_eur - totalAmount) < 0.01;
          const expDate = new Date(exp.date);
          const sameMonth = expDate.getMonth() === reimbDate.getMonth() &&
                            expDate.getFullYear() === reimbDate.getFullYear();

          return amountMatch && sameMonth;
        });

        if (orangeExpense) {
          const currentNumbers = Array.isArray(orangeExpense.expense_number)
            ? orangeExpense.expense_number
            : orangeExpense.expense_number
              ? [orangeExpense.expense_number]
              : [];

          const newNumbers = currentNumbers.includes(expenseNumber)
            ? currentNumbers
            : [...currentNumbers, expenseNumber];

          for (const reimbursement of reimbursements) {
            await supabase
              .from('reimbursements')
              .update({ matched_expense_id: orangeExpense.id })
              .eq('id', reimbursement.id);
          }

          await supabase
            .from('expenses')
            .update({
              reimbursed_amount: totalAmount,
              reimbursement_status: 'complete',
              expense_number: newNumbers.length > 0 ? newNumbers : [expenseNumber],
              source: 'Prélèvement',
            })
            .eq('id', orangeExpense.id);

          matchedCount += reimbursements.length;
          continue;
        }
      }

      // Try matching with 2 expenses
      for (let i = 0; i < allExpenses.length; i++) {
        for (let j = i + 1; j < allExpenses.length; j++) {
          const exp1 = allExpenses[i];
          const exp2 = allExpenses[j];
          
          const combinedAmount = exp1.amount_eur + exp2.amount_eur;
          const amountMatch = Math.abs(combinedAmount - totalAmount) < 0.01;
          
          if (!amountMatch) continue;

          const exp1HasNumber = Array.isArray(exp1.expense_number) 
            ? exp1.expense_number.includes(expenseNumber)
            : exp1.expense_number === expenseNumber;
          const exp2HasNumber = Array.isArray(exp2.expense_number) 
            ? exp2.expense_number.includes(expenseNumber)
            : exp2.expense_number === expenseNumber;

          if (!exp1HasNumber || !exp2HasNumber) continue;

          // Match found with 2 expenses
          for (const reimbursement of reimbursements) {
            await supabase
              .from('reimbursements')
              .update({ matched_expense_id: exp1.id })
              .eq('id', reimbursement.id);
          }

          await supabase
            .from('expenses')
            .update({
              reimbursed_amount: exp1.amount_eur,
              reimbursement_status: 'complete',
            })
            .eq('id', exp1.id);

          await supabase
            .from('expenses')
            .update({
              reimbursed_amount: exp2.amount_eur,
              reimbursement_status: 'complete',
            })
            .eq('id', exp2.id);

          matchedCount += reimbursements.length;
          break;
        }
      }
    }

    // Process individual reimbursements (without expense_number or not grouped)
    for (const reimbursement of ungroupedReimbursements) {
      // Skip if already matched
      if (reimbursement.matched_expense_id) continue;

      // Check if it's a GSM reimbursement
      const isGsmReimbursement = reimbursement.category?.toLowerCase().includes('gsm');

      // Try single expense match first
      const matchingExpense = allExpenses.find((exp) => {
        const amountMatch = Math.abs(exp.amount_eur - reimbursement.amount_eur) < 0.01;
        
        const expDate = new Date(exp.date);
        const reimbDate = new Date(reimbursement.expense_date);
        
        // Check if expense is an Orange payment
        const isOrangeExpense = exp.description?.toUpperCase().includes('ORANGE');
        
        let dateMatch;
        if (isGsmReimbursement && isOrangeExpense) {
          // For GSM reimbursements matching Orange expenses, use same month
          dateMatch = expDate.getMonth() === reimbDate.getMonth() && 
                     expDate.getFullYear() === reimbDate.getFullYear();
        } else {
          // Standard 5-day window for other expenses
          const daysDiff = Math.abs((expDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
          dateMatch = daysDiff <= 5;
        }
        
        return amountMatch && dateMatch;
      });

      if (matchingExpense) {
        const currentNumbers = Array.isArray(matchingExpense.expense_number) 
          ? matchingExpense.expense_number 
          : matchingExpense.expense_number 
            ? [matchingExpense.expense_number] 
            : [];
        
        const newNumbers = reimbursement.expense_number && !currentNumbers.includes(reimbursement.expense_number)
          ? [...currentNumbers, reimbursement.expense_number]
          : currentNumbers.length > 0 ? currentNumbers : null;

        const isOrangeExpense = matchingExpense.description?.toUpperCase().includes('ORANGE');
        
        const updateData: any = {
          reimbursed_amount: reimbursement.amount_eur,
          reimbursement_status: 'complete',
          expense_number: newNumbers,
        };

        // Tag Orange expenses as "Prélèvement" when matched with GSM reimbursement
        if (isGsmReimbursement && isOrangeExpense) {
          updateData.source = 'Prélèvement';
        }

        await supabase
          .from('expenses')
          .update(updateData)
          .eq('id', matchingExpense.id);

        await supabase
          .from('reimbursements')
          .update({ matched_expense_id: matchingExpense.id })
          .eq('id', reimbursement.id);

        matchedCount++;
        continue;
      }

      // Try matching with 2 expenses
      for (let i = 0; i < allExpenses.length; i++) {
        for (let j = i + 1; j < allExpenses.length; j++) {
          const exp1 = allExpenses[i];
          const exp2 = allExpenses[j];
          
          const combinedAmount = exp1.amount_eur + exp2.amount_eur;
          const amountMatch = Math.abs(combinedAmount - reimbursement.amount_eur) < 0.01;
          
          if (!amountMatch) continue;

          const reimbDate = new Date(reimbursement.expense_date);
          const exp1Date = new Date(exp1.date);
          const exp2Date = new Date(exp2.date);
          
          const isOrangeExpense1 = exp1.description?.toUpperCase().includes('ORANGE');
          const isOrangeExpense2 = exp2.description?.toUpperCase().includes('ORANGE');
          
          let dateMatch1, dateMatch2;
          if (isGsmReimbursement && (isOrangeExpense1 || isOrangeExpense2)) {
            // For GSM reimbursements matching Orange expenses, use same month
            dateMatch1 = exp1Date.getMonth() === reimbDate.getMonth() && 
                        exp1Date.getFullYear() === reimbDate.getFullYear();
            dateMatch2 = exp2Date.getMonth() === reimbDate.getMonth() && 
                        exp2Date.getFullYear() === reimbDate.getFullYear();
          } else {
            // Standard 5-day window for other expenses
            const daysDiff1 = Math.abs((exp1Date.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
            const daysDiff2 = Math.abs((exp2Date.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
            dateMatch1 = daysDiff1 <= 5;
            dateMatch2 = daysDiff2 <= 5;
          }
          
          if (!dateMatch1 || !dateMatch2) continue;

          // Match found with 2 expenses
          const exp1Numbers = Array.isArray(exp1.expense_number) ? exp1.expense_number : exp1.expense_number ? [exp1.expense_number] : [];
          const exp2Numbers = Array.isArray(exp2.expense_number) ? exp2.expense_number : exp2.expense_number ? [exp2.expense_number] : [];
          
          const newNumbers1 = reimbursement.expense_number && !exp1Numbers.includes(reimbursement.expense_number)
            ? [...exp1Numbers, reimbursement.expense_number]
            : exp1Numbers.length > 0 ? exp1Numbers : null;
          
          const newNumbers2 = reimbursement.expense_number && !exp2Numbers.includes(reimbursement.expense_number)
            ? [...exp2Numbers, reimbursement.expense_number]
            : exp2Numbers.length > 0 ? exp2Numbers : null;

          const updateData1: any = {
            reimbursed_amount: exp1.amount_eur,
            reimbursement_status: 'complete',
            expense_number: newNumbers1,
          };

          const updateData2: any = {
            reimbursed_amount: exp2.amount_eur,
            reimbursement_status: 'complete',
            expense_number: newNumbers2,
          };

          // Tag Orange expenses as "Prélèvement" when matched with GSM reimbursement
          if (isGsmReimbursement && isOrangeExpense1) {
            updateData1.source = 'Prélèvement';
          }
          if (isGsmReimbursement && isOrangeExpense2) {
            updateData2.source = 'Prélèvement';
          }

          await supabase
            .from('expenses')
            .update(updateData1)
            .eq('id', exp1.id);

          await supabase
            .from('expenses')
            .update(updateData2)
            .eq('id', exp2.id);

          await supabase
            .from('reimbursements')
            .update({ matched_expense_id: exp1.id })
            .eq('id', reimbursement.id);

          matchedCount++;
          break;
        }
      }
    }

    // Check expenses with expense_numbers and mark reimbursements as matched
    for (const expense of allExpenses) {
      if (!expense.expense_number || !Array.isArray(expense.expense_number)) continue;

      for (const expNum of expense.expense_number) {
        const relatedReimbursements = reimbursementsData.filter(
          r => r.expense_number === expNum && !r.matched_expense_id
        );

        if (relatedReimbursements.length === 0) continue;

        const totalReimbursed = relatedReimbursements.reduce((sum, r) => sum + r.amount_eur, 0);

        // If 100% of expense is covered by reimbursements, OR if expense is marked as considered_complete, mark them as matched
        const isFullyReimbursed = Math.abs(totalReimbursed - expense.amount_eur) < 0.01;
        const isConsideredComplete = expense.considered_complete && expense.reimbursement_status === 'complete';
        
        if (isFullyReimbursed || isConsideredComplete) {
          for (const reimbursement of relatedReimbursements) {
            await supabase
              .from('reimbursements')
              .update({ matched_expense_id: expense.id })
              .eq('id', reimbursement.id);
            matchedCount++;
          }
        }
      }
    }

    // Fix-up pass: ensure all expenses linked to reimbursements are consistent
    for (const expense of allExpenses) {
      const relatedReimbursements = reimbursementsData.filter(
        (r) => r.matched_expense_id === expense.id
      );
      if (relatedReimbursements.length === 0) continue;

      const updateData: any = {};
      let needsUpdate = false;

      // 1) Reimbursement status must be complete
      if (expense.reimbursement_status !== 'complete') {
        updateData.reimbursement_status = 'complete';
        needsUpdate = true;
      }

      // 2) Reimbursed amount = sum of related reimbursements
      const totalMatchedAmount = relatedReimbursements.reduce(
        (sum, r) => sum + Number(r.amount_eur),
        0
      );
      if (Math.abs(Number(expense.reimbursed_amount) - totalMatchedAmount) > 0.01) {
        updateData.reimbursed_amount = totalMatchedAmount;
        needsUpdate = true;
      }

      // 3) Expense numbers = union of all reimbursement expense_numbers
      const currentNumbers = Array.isArray(expense.expense_number)
        ? expense.expense_number
        : expense.expense_number
        ? [expense.expense_number]
        : [];

      const numbersToAdd = relatedReimbursements
        .map((r) => r.expense_number)
        .filter((num): num is string => !!num);

      const mergedNumbers = Array.from(new Set([...currentNumbers, ...numbersToAdd]));
      if (
        mergedNumbers.length > 0 &&
        mergedNumbers.join(',') !== currentNumbers.join(',')
      ) {
        updateData.expense_number = mergedNumbers;
        needsUpdate = true;
      }

      // 4) Special case: any GSM reimbursement + ORANGE expense -> source = "Prélèvement"
      const hasGsmReimbursement = relatedReimbursements.some((r) =>
        r.category?.toLowerCase().includes('gsm')
      );
      const isOrangeExpense = expense.description?.toUpperCase().includes('ORANGE');
      if (hasGsmReimbursement && isOrangeExpense && expense.source !== 'Prélèvement') {
        updateData.source = 'Prélèvement';
        needsUpdate = true;
      }

      if (needsUpdate) {
        await supabase
          .from('expenses')
          .update(updateData)
          .eq('id', expense.id);
      }
    }

    return matchedCount;
  };

  const handleRefreshMatching = async () => {
    setRefreshing(true);
    try {
      const matchedCount = await matchReimbursementsWithExpenses();
      
      toast({
        title: "Matching terminé",
        description: `${matchedCount} remboursement(s) associé(s) aux dépenses`,
      });

      await loadExpenses();
    } catch (error) {
      console.error('Error refreshing matching:', error);
      toast({
        title: "Erreur",
        description: "Impossible de rafraîchir les correspondances",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch =
      expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.expenseNumber?.some(num => num.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const expenseDate = new Date(expense.date);
    const matchesStartDate = !startDate || expenseDate >= new Date(startDate);
    const matchesEndDate = !endDate || expenseDate <= new Date(endDate);

    const matchesPersonal = showPersonal || !expense.isPersonal;
    
    const matchesStatus = 
      (showPending && expense.reimbursementStatus === "pending") ||
      (showPartial && expense.reimbursementStatus === "partial") ||
      (showComplete && expense.reimbursementStatus === "complete");

    return matchesSearch && matchesStartDate && matchesEndDate && matchesPersonal && matchesStatus;
  });

  const handleResetFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setShowPersonal(false);
    setShowPending(true);
    setShowPartial(true);
    setShowComplete(false);
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
          <Button 
            onClick={handleRefreshMatching} 
            disabled={refreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Rafraîchir les correspondances
          </Button>
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
              showPending={showPending}
              showPartial={showPartial}
              showComplete={showComplete}
              onShowPersonalChange={setShowPersonal}
              onShowPendingChange={setShowPending}
              onShowPartialChange={setShowPartial}
              onShowCompleteChange={setShowComplete}
              onReset={handleResetFilters}
            />

            <ExpenseTable
              expenses={filteredExpenses}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              highlightedExpenseId={highlightedExpenseId}
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
