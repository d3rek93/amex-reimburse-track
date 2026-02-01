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
 
interface ExpensesProps {
  embedded?: boolean;
}

const Expenses = ({ embedded = false }: ExpensesProps = {}) => {
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
    // Check for URL parameters
    const params = new URLSearchParams(window.location.search);
    const expenseId = params.get('expense');
    const openUpload = params.get('openUpload');
    
    if (expenseId) {
      setHighlightedExpenseId(expenseId);
      // Clear highlight after 3 seconds
      setTimeout(() => setHighlightedExpenseId(null), 3000);
    }
    
    if (openUpload === 'true') {
      setShowUploadDialog(true);
    }
    
    // Clear URL parameters
    if (expenseId || openUpload) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (embedded) {
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
        if (currentSession) {
          loadExpenses();
        }
        setLoading(false);
      });
      return;
    }

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
  }, [navigate, embedded]);

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
        reimbursementStatus: expense.reimbursement_status as "pending" | "partial" | "complete" | "not_applicable",
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
          
          // Collect transfers to add
          const transfers: { date: string; amount: number; description: string }[] = [];
          
          // Get header to find categoryParent and category column indices
          const headerLine = lines[0];
          const headerColumns = headerLine.split(';').map(col => col.replace(/^"?|"?$/g, '').trim());
          const categoryParentIndex = headerColumns.findIndex(h => h === 'categoryParent');
          const categoryIndex = headerColumns.findIndex(h => h === 'category');
          
          expenses = dataLines.map(line => {
            const columns = line.split(';').map(col => col.replace(/^"?|"?$/g, '').trim());
            
            if (columns.length < 11) return null;
            
            const dateOp = columns[0];
            const label = columns[2];
            const amountStr = columns[6];
            const accountLabel = columns[9];
            const categoryParent = categoryParentIndex >= 0 ? columns[categoryParentIndex] : '';
            const category = categoryIndex >= 0 ? columns[categoryIndex] : '';
            
            // Exclude deferred debit card transactions
            if (category === 'Prélèvements cartes débit différé et cartes crédit conso') {
              return null;
            }
            
            // Check for internal credit movements (transfers in)
            if (categoryParent === 'Mouvements internes créditeurs') {
              const amount = parseFloat(amountStr.replace(/\s/g, '').replace(',', '.'));
              if (!isNaN(amount)) {
                transfers.push({
                  date: dateOp,
                  amount: Math.abs(amount),
                  description: 'Virement entrant Boursobank',
                });
              }
              return null;
            }
            
            // Check for internal debit movements (transfers out - negative)
            if (categoryParent === 'Mouvements internes débiteurs') {
              const amount = parseFloat(amountStr.replace(/\s/g, '').replace(',', '.'));
              if (!isNaN(amount)) {
                transfers.push({
                  date: dateOp,
                  amount: -Math.abs(amount),
                  description: 'Virement sortant Boursobank',
                });
              }
              return null;
            }
            
            // Include VISA ULTIM CARTE transactions (CARTE can be anywhere in label) and any transaction with "orange" in label
            const isVisaUltim = accountLabel === 'VISA ULTIM' && label.toUpperCase().includes('CARTE');
            const isOrange = label.toLowerCase().includes('orange');
            
            if (!isVisaUltim && !isOrange) return null;
            
            const amount = Math.abs(parseFloat(amountStr.replace(',', '.')));
            
            if (isNaN(amount)) return null;
            
            // Determine source based on description
            const source = label.toUpperCase().includes('PRLV') ? 'Prélèvement' : 'Boursobank';
            
            return {
              user_id: sessionData.session.user.id,
              date: dateOp,
              description: label,
              amount_eur: amount,
              reimbursement_status: 'pending',
              reimbursed_amount: 0,
              is_personal: false,
              source: source,
            };
          }).filter(Boolean);
          
          // Insert transfers if any (check for duplicates)
          if (transfers.length > 0) {
            const { data: existingTransfers } = await supabase
              .from('manual_transfers')
              .select('transfer_date, amount_eur, description');
            
            const uniqueTransfers = transfers.filter(t => {
              return !existingTransfers?.some(existing => 
                existing.transfer_date === t.date &&
                Math.abs(existing.amount_eur - t.amount) < 0.01 &&
                existing.description === t.description
              );
            });
            
            if (uniqueTransfers.length > 0) {
              const { error: transferError } = await supabase
                .from('manual_transfers')
                .insert(uniqueTransfers.map(t => ({
                  user_id: sessionData.session.user.id,
                  transfer_date: t.date,
                  amount_eur: t.amount,
                  description: t.description,
                })));
              
              if (transferError) {
                console.error('Error inserting transfers:', transferError);
              } else {
                toast({
                  title: "Virements importés",
                  description: `${uniqueTransfers.length} virement(s) Boursobank importé(s)`,
                });
              }
            }
          }
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
            
            // Determine source based on description
            const source = description.toUpperCase().includes('PRLV') ? 'Prélèvement' : 'AMEX';
            
            return {
              user_id: sessionData.session.user.id,
              date,
              description,
              amount_eur: amount,
              reimbursement_status: 'pending',
              reimbursed_amount: 0,
              is_personal: false,
              source: source,
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
      
      // Track if we're removing expense numbers to detach reimbursements
      const expense = expenses.find(e => e.id === id);
      const oldNumbers = expense?.expenseNumber || [];
      
      if (updates.expenseNumber !== undefined) {
        dbUpdates.expense_number = updates.expenseNumber;
        
        // If numbers are being removed, detach the associated reimbursements
        const newNumbers = updates.expenseNumber || [];
        const removedNumbers = oldNumbers.filter(num => !newNumbers.includes(num));
        
        if (removedNumbers.length > 0) {
          // Detach reimbursements with these expense numbers
          for (const num of removedNumbers) {
            await supabase
              .from('reimbursements')
              .update({ matched_expense_id: null })
              .eq('expense_number', num)
              .eq('matched_expense_id', id);
          }
          
          // Reset expense status if no numbers left
          if (newNumbers.length === 0) {
            dbUpdates.reimbursement_status = 'pending';
            dbUpdates.reimbursed_amount = 0;
          }
        }
      }
      
      if (updates.reimbursementStatus !== undefined) dbUpdates.reimbursement_status = updates.reimbursementStatus;
      if (updates.reimbursedAmount !== undefined) dbUpdates.reimbursed_amount = updates.reimbursedAmount;
      if (updates.isPersonal !== undefined) {
        dbUpdates.is_personal = updates.isPersonal;
        // When marking as personal, change status to "not_applicable"
        // When unmarking as personal, reset to "pending"
        dbUpdates.reimbursement_status = updates.isPersonal ? 'not_applicable' : 'pending';
        if (!updates.isPersonal) {
          dbUpdates.reimbursed_amount = 0;
        }
        
        // Detach all reimbursements when marking as personal
        if (updates.isPersonal && oldNumbers.length > 0) {
          for (const num of oldNumbers) {
            await supabase
              .from('reimbursements')
              .update({ matched_expense_id: null })
              .eq('expense_number', num)
              .eq('matched_expense_id', id);
          }
        }
      }
      if (updates.consideredComplete !== undefined) dbUpdates.considered_complete = updates.consideredComplete;

      const { error } = await supabase
        .from('expenses')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      setExpenses((prev) =>
        prev.map((expense) => {
          if (expense.id === id) {
            const updatedExpense = { ...expense, ...updates };
            // Apply automatic status change for personal expenses
            if (updates.isPersonal !== undefined) {
              updatedExpense.reimbursementStatus = updates.isPersonal ? 'not_applicable' : 'pending';
              if (!updates.isPersonal) {
                updatedExpense.reimbursedAmount = 0;
              }
            }
            return updatedExpense;
          }
          return expense;
        })
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
      
      // Check if reimbursements cancel each other out (total ≈ 0)
      if (Math.abs(totalAmount) < 0.01) {
        console.log(`[Cancelled] Reimbursement ${expenseNumber} cancels out (total: ${totalAmount})`);
        // Mark all reimbursements in this group as cancelled
        for (const reimbursement of reimbursements) {
          await supabase
            .from('reimbursements')
            .update({ 
              status: 'cancelled',
              matched_expense_id: null 
            })
            .eq('id', reimbursement.id);
        }
        matchedCount += reimbursements.length;
        continue;
      }
      
      const allMatched = reimbursements.every(r => r.matched_expense_id);
      
      if (allMatched) continue;

      // Get the most recent expense_date from the group
      const groupExpenseDate = reimbursements.reduce((latest, r) => {
        return new Date(r.expense_date) > new Date(latest) ? r.expense_date : latest;
      }, reimbursements[0].expense_date);

      // Try single expense match
      const matchingExpense = allExpenses.find((exp) => {
        if (exp.is_personal) return false;
        
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

      // Check for manual or explicit association: any expense with this number
      const expenseWithNumber = allExpenses.find((exp) => {
        if (exp.is_personal) return false;
        
        const hasThisNumber = Array.isArray(exp.expense_number)
          ? exp.expense_number.includes(expenseNumber)
          : exp.expense_number === expenseNumber;
        
        return hasThisNumber;
      });
 
      if (expenseWithNumber) {
        // Respect explicit association by expense number even if amounts differ
        for (const reimbursement of reimbursements) {
          await supabase
            .from('reimbursements')
            .update({ matched_expense_id: expenseWithNumber.id })
            .eq('id', reimbursement.id);
        }
 
        // Update expense with reimbursement info, but don't override an existing reimbursed_amount > 0
        const finalReimbursedAmount = (expenseWithNumber.reimbursed_amount ?? 0) > 0 
          ? expenseWithNumber.reimbursed_amount 
          : totalAmount;
 
        await supabase
          .from('expenses')
          .update({
            reimbursed_amount: finalReimbursedAmount,
            reimbursement_status: 'complete',
          })
          .eq('id', expenseWithNumber.id);
 
        matchedCount += reimbursements.length;
        continue;
      }

      // Automatic matching based on amount and date for grouped reimbursements
      // Priority: exact date match first, then within ± 5 days
      const reimbDate = new Date(groupExpenseDate);
      console.log(`[Auto-match] Checking reimbursement ${expenseNumber}, amount: ${totalAmount}, date: ${groupExpenseDate}`);
      
      // Find all potential matches with same amount
      const potentialMatches = allExpenses.filter((exp) => {
        if (exp.is_personal) return false;
        
        // Check if expense is already matched to avoid double-matching
        const isAlreadyMatched = reimbursementsData.some(r => 
          r.matched_expense_id === exp.id && r.expense_number !== expenseNumber
        );
        if (isAlreadyMatched) return false;

        // Amount must match closely
        const amountMatch = Math.abs(exp.amount_eur - totalAmount) < 0.01;
        return amountMatch;
      });

      // Sort by date proximity (closest first)
      potentialMatches.sort((a, b) => {
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        const aDiff = Math.abs((aDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
        const bDiff = Math.abs((bDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
        return aDiff - bDiff;
      });

      // Find best match within date tolerance
      const autoMatchExpense = potentialMatches.find((exp) => {
        const expDate = new Date(exp.date);
        const daysDiff = Math.abs((expDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
        const dateMatch = daysDiff <= 5;

        if (dateMatch) {
          console.log(`[Auto-match] Found candidate: ${exp.description}, amount: ${exp.amount_eur}, date: ${exp.date}, daysDiff: ${daysDiff}`);
        }

        return dateMatch;
      });

      if (autoMatchExpense) {
        console.log(`[Auto-match] Matching ${expenseNumber} with expense ${autoMatchExpense.id}`);
        // Auto-associate this grouped reimbursement with the found expense
        const currentNumbers = Array.isArray(autoMatchExpense.expense_number)
          ? autoMatchExpense.expense_number
          : autoMatchExpense.expense_number
            ? [autoMatchExpense.expense_number]
            : [];

        const newNumbers = [...new Set([...currentNumbers, expenseNumber])];

        for (const reimbursement of reimbursements) {
          await supabase
            .from('reimbursements')
            .update({ matched_expense_id: autoMatchExpense.id })
            .eq('id', reimbursement.id);
        }

        await supabase
          .from('expenses')
          .update({
            reimbursed_amount: totalAmount,
            reimbursement_status: 'complete',
            expense_number: newNumbers,
          })
          .eq('id', autoMatchExpense.id);

        matchedCount += reimbursements.length;
        continue;
      } else {
        console.log(`[Auto-match] No automatic match found for ${expenseNumber}`);
      }

      // Special matching for GSM reimbursements → ORANGE expenses
      const isGsmGroup = reimbursements.every(r => r.category?.toLowerCase().includes('gsm'));
      if (isGsmGroup) {
        // Use the most recent expense_date from the group
        const reimbDate = new Date(groupExpenseDate);

        const orangeExpense = allExpenses.find((exp) => {
          if (exp.is_personal) return false;
          
          // Check if expense is already matched to a different reimbursement group
          const isAlreadyMatched = reimbursementsData.some(r => 
            r.matched_expense_id === exp.id && r.expense_number !== expenseNumber
          );
          if (isAlreadyMatched) return false;
          
          const isOrange = exp.description?.toUpperCase().includes('PRLV SEPA ORANGE SA');
          if (!isOrange) return false;

          const amountMatch = Math.abs(exp.amount_eur - totalAmount) < 0.01;
          
          // Expense date is typically ~10 days AFTER reimbursement date
          const expDate = new Date(exp.date);
          const daysDiff = (expDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24);
          const dateMatch = daysDiff >= 0 && daysDiff <= 15; // Allow 0-15 days after

          return amountMatch && dateMatch;
        });

        if (orangeExpense) {
          const currentNumbers = Array.isArray(orangeExpense.expense_number)
            ? orangeExpense.expense_number
            : orangeExpense.expense_number
              ? [orangeExpense.expense_number]
              : [];

          const newNumbers = [...new Set([...currentNumbers, expenseNumber])];

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
              expense_number: newNumbers,
              source: 'Prélèvement',
            })
            .eq('id', orangeExpense.id);

          matchedCount += reimbursements.length;
          continue;
        }
      }

      // Try matching by amount and payment date
      const groupPaymentDate = reimbursements[0].payment_date;
      
      // Find all potential matches with same amount
      const potentialMatchesByPayment = allExpenses.filter((exp) => {
        if (exp.is_personal) return false;
        
        // Check if expense is already matched to a different reimbursement group
        const isAlreadyMatched = reimbursementsData.some(r => 
          r.matched_expense_id === exp.id && r.expense_number !== expenseNumber
        );
        if (isAlreadyMatched) return false;
        
        const amountMatch = Math.abs(exp.amount_eur - totalAmount) < 0.01;
        return amountMatch;
      });

      // Sort by date proximity to payment date
      potentialMatchesByPayment.sort((a, b) => {
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        const paymentDate = new Date(groupPaymentDate);
        const aDiff = Math.abs((aDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
        const bDiff = Math.abs((bDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
        return aDiff - bDiff;
      });

      const matchingExpenseByDate = potentialMatchesByPayment.find((exp) => {
        const expDate = new Date(exp.date);
        const paymentDate = new Date(groupPaymentDate);
        const daysDiff = Math.abs((expDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff <= 5;
      });

      if (matchingExpenseByDate) {
        const currentNumbers = Array.isArray(matchingExpenseByDate.expense_number)
          ? matchingExpenseByDate.expense_number
          : matchingExpenseByDate.expense_number
            ? [matchingExpenseByDate.expense_number]
            : [];

        const newNumbers = [...new Set([...currentNumbers, expenseNumber])];

        for (const reimbursement of reimbursements) {
          await supabase
            .from('reimbursements')
            .update({ matched_expense_id: matchingExpenseByDate.id })
            .eq('id', reimbursement.id);
        }

        await supabase
          .from('expenses')
          .update({
            reimbursed_amount: totalAmount,
            reimbursement_status: 'complete',
            expense_number: newNumbers,
          })
          .eq('id', matchingExpenseByDate.id);

        matchedCount += reimbursements.length;
        continue;
      }

      // Try matching with 2 expenses
      for (let i = 0; i < allExpenses.length; i++) {
        for (let j = i + 1; j < allExpenses.length; j++) {
          const exp1 = allExpenses[i];
          const exp2 = allExpenses[j];
          
          if (exp1.is_personal || exp2.is_personal) continue;
          
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

      // Try single expense match first
      const matchingExpense = allExpenses.find((exp) => {
        if (exp.is_personal) return false;
        
        const amountMatch = Math.abs(exp.amount_eur - reimbursement.amount_eur) < 0.01;
        
        const expDate = new Date(exp.date);
        const reimbDate = new Date(reimbursement.expense_date);
        const daysDiff = Math.abs((expDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
        const dateMatch = daysDiff <= 5;
        
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

        await supabase
          .from('expenses')
          .update({
            reimbursed_amount: reimbursement.amount_eur,
            reimbursement_status: 'complete',
            expense_number: newNumbers,
          })
          .eq('id', matchingExpense.id);

        await supabase
          .from('reimbursements')
          .update({ matched_expense_id: matchingExpense.id })
          .eq('id', reimbursement.id);

        matchedCount++;
        continue;
      }

      // Special matching for GSM reimbursements → ORANGE expenses
      const isGsmReimbursement = reimbursement.category?.toLowerCase().includes('gsm');
      if (isGsmReimbursement) {
        const reimbDate = new Date(reimbursement.expense_date);

        const orangeExpense = allExpenses.find((exp) => {
          if (exp.is_personal) return false;
          
          const isOrange = exp.description?.toUpperCase().includes('PRLV SEPA ORANGE SA');
          if (!isOrange) return false;

          const amountMatch = Math.abs(exp.amount_eur - reimbursement.amount_eur) < 0.01;
          
          // Expense date is typically ~10 days AFTER reimbursement date
          const expDate = new Date(exp.date);
          const daysDiff = (expDate.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24);
          const dateMatch = daysDiff >= 0 && daysDiff <= 15; // Allow 0-15 days after

          return amountMatch && dateMatch;
        });

        if (orangeExpense) {
          const currentNumbers = Array.isArray(orangeExpense.expense_number)
            ? orangeExpense.expense_number
            : orangeExpense.expense_number
              ? [orangeExpense.expense_number]
              : [];

          const newNumbers = reimbursement.expense_number && !currentNumbers.includes(reimbursement.expense_number)
            ? [...currentNumbers, reimbursement.expense_number]
            : currentNumbers.length > 0 ? currentNumbers : [reimbursement.expense_number];

          await supabase
            .from('expenses')
            .update({
              reimbursed_amount: reimbursement.amount_eur,
              reimbursement_status: 'complete',
              expense_number: newNumbers,
              source: 'Prélèvement',
            })
            .eq('id', orangeExpense.id);

          await supabase
            .from('reimbursements')
            .update({ matched_expense_id: orangeExpense.id })
            .eq('id', reimbursement.id);

          matchedCount++;
          continue;
        }
      }

      // Try matching with 2 expenses
      for (let i = 0; i < allExpenses.length; i++) {
        for (let j = i + 1; j < allExpenses.length; j++) {
          const exp1 = allExpenses[i];
          const exp2 = allExpenses[j];
          
          if (exp1.is_personal || exp2.is_personal) continue;
          
          const combinedAmount = exp1.amount_eur + exp2.amount_eur;
          const amountMatch = Math.abs(combinedAmount - reimbursement.amount_eur) < 0.01;
          
          if (!amountMatch) continue;

          const reimbDate = new Date(reimbursement.expense_date);
          const exp1Date = new Date(exp1.date);
          const exp2Date = new Date(exp2.date);
          const daysDiff1 = Math.abs((exp1Date.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysDiff2 = Math.abs((exp2Date.getTime() - reimbDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff1 > 5 || daysDiff2 > 5) continue;

          // Match found with 2 expenses
          const exp1Numbers = Array.isArray(exp1.expense_number) ? exp1.expense_number : exp1.expense_number ? [exp1.expense_number] : [];
          const exp2Numbers = Array.isArray(exp2.expense_number) ? exp2.expense_number : exp2.expense_number ? [exp2.expense_number] : [];
          
          const newNumbers1 = reimbursement.expense_number && !exp1Numbers.includes(reimbursement.expense_number)
            ? [...exp1Numbers, reimbursement.expense_number]
            : exp1Numbers.length > 0 ? exp1Numbers : null;
          
          const newNumbers2 = reimbursement.expense_number && !exp2Numbers.includes(reimbursement.expense_number)
            ? [...exp2Numbers, reimbursement.expense_number]
            : exp2Numbers.length > 0 ? exp2Numbers : null;

          await supabase
            .from('expenses')
            .update({
              reimbursed_amount: exp1.amount_eur,
              reimbursement_status: 'complete',
              expense_number: newNumbers1,
            })
            .eq('id', exp1.id);

          await supabase
            .from('expenses')
            .update({
              reimbursed_amount: exp2.amount_eur,
              reimbursement_status: 'complete',
              expense_number: newNumbers2,
            })
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
      if (expense.is_personal) continue;
      if (!expense.expense_number || !Array.isArray(expense.expense_number)) continue;

      for (const expNum of expense.expense_number) {
        const relatedReimbursements = reimbursementsData.filter(
          r => r.expense_number === expNum && !r.matched_expense_id
        );

        if (relatedReimbursements.length === 0) continue;

        const totalReimbursed = relatedReimbursements.reduce((sum, r) => sum + r.amount_eur, 0);

        // If 100% of expense is covered by reimbursements, mark them as matched
        if (Math.abs(totalReimbursed - expense.amount_eur) < 0.01) {
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

    // Fix-up pass: update source to "Prélèvement" for expenses with "PRLV" in description
    for (const expense of allExpenses) {
      if (expense.description?.toUpperCase().includes('PRLV') && expense.source !== 'Prélèvement') {
        await supabase
          .from('expenses')
          .update({ source: 'Prélèvement' })
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

    // Personal filter: show only personal expenses if checkbox is checked
    const matchesPersonal = !showPersonal || expense.isPersonal;
    
    // Status filter: show only if at least one checkbox is checked AND matches
    // If no status checkboxes are checked, show all
    // When status filters are active, exclude personal expenses (they can't be reimbursed)
    const hasAnyStatusFilter = showPending || showPartial || showComplete;
    const matchesStatus = !hasAnyStatusFilter || 
      (showPending && expense.reimbursementStatus === "pending" && !expense.isPersonal) ||
      (showPartial && expense.reimbursementStatus === "partial" && !expense.isPersonal) ||
      (showComplete && expense.reimbursementStatus === "complete" && !expense.isPersonal);

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
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      {!embedded && <Navigation onUpload={() => setShowUploadDialog(true)} />}
      
      <div className={embedded ? "h-full p-4 space-y-4" : "container mx-auto py-8 px-4 space-y-6"}>
        {!embedded && (
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
        )}

        {embedded && (
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Dépenses</h2>
            <Button 
              onClick={handleRefreshMatching} 
              disabled={refreshing}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Rafraîchir
            </Button>
          </div>
        )}

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
