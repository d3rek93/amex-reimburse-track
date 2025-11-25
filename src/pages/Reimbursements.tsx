import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, ChevronDown, ChevronRight, Unlink2, Search, Plus, ArrowUpDown } from "lucide-react";
import { Session } from "@supabase/supabase-js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { ManualExpenseDialog } from "@/components/ManualExpenseDialog";

interface Reimbursement {
  id: string;
  payment_date: string;
  payment_reference: string;
  expense_number: string;
  expense_date: string;
  category: string;
  amount_eur: number;
  matched_expense_id: string | null;
  status: string;
  discrepancy_approved: boolean;
}

interface ReimbursementGroup {
  expense_number: string;
  reimbursements: Reimbursement[];
  total_amount: number;
  payment_date: string;
  expense_date: string;
  category: string;
  all_matched: boolean;
}

interface AssociatedExpense {
  id: string;
  date: string;
  description: string;
  amount_eur: number;
  expense_number: string[] | null;
  reimbursement_status: string;
  reimbursed_amount: number;
  source: string;
}

interface GroupExpenseData {
  expenses: AssociatedExpense[];
  totalExpenseAmount: number;
}

interface ReimbursementsProps {
  embedded?: boolean;
}

const Reimbursements = ({ embedded = false }: ReimbursementsProps = {}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnmatched, setShowUnmatched] = useState(true);
  const [showMatched, setShowMatched] = useState(false);
  const [showWithDiscrepancy, setShowWithDiscrepancy] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showDiscrepancyApproved, setShowDiscrepancyApproved] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedReimbursements, setExpandedReimbursements] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [associatedExpenses, setAssociatedExpenses] = useState<Record<string, AssociatedExpense[]>>({});
  const [groupExpenseData, setGroupExpenseData] = useState<Record<string, GroupExpenseData>>({});
  const [expenseNumberToGroupKey, setExpenseNumberToGroupKey] = useState<Record<string, string>>({});
  const [expenseGroupTotals, setExpenseGroupTotals] = useState<Record<string, { expenseNumbers: string[]; totalExpenseAmount: number }>>({});
  const [manualExpenseDialog, setManualExpenseDialog] = useState<{
    open: boolean;
    reimbursement: Reimbursement | null;
  }>({ open: false, reimbursement: null });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (embedded) {
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
        if (currentSession) {
          loadReimbursements();
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
        loadReimbursements();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, embedded]);

  const loadReimbursements = async () => {
    try {
      const { data, error } = await supabase
        .from('reimbursements')
        .select('*')
        .order('payment_date', { ascending: false });

      if (error) throw error;

      setReimbursements(data || []);
      
      // Load all expenses to calculate amount differences
      await loadAllExpensesForGroups(data || []);
    } catch (error) {
      console.error('Error loading reimbursements:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les remboursements",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAllExpensesForGroups = async (reimbursementsList: Reimbursement[]) => {
    try {
      // Get all expenses
      const { data: allExpenses, error } = await supabase
        .from('expenses')
        .select('*');

      if (error) throw error;

      // Build logical groups of expense numbers using connected components (excluding personal expenses)
      const numberGraph: Record<string, Set<string>> = {};

      // First pass: build graph connections between expense numbers that appear together
      (allExpenses || []).forEach((exp) => {
        if (exp.is_personal || !exp.expense_number) return;

        const numbers = Array.isArray(exp.expense_number)
          ? exp.expense_number.filter(Boolean)
          : [exp.expense_number];

        if (numbers.length === 0) return;

        numbers.forEach((num) => {
          if (!numberGraph[num]) numberGraph[num] = new Set();
          numbers.forEach((other) => {
            if (other !== num) {
              numberGraph[num].add(other);
            }
          });
        });
      });

      // Second pass: find connected components (each component is a logical expense group)
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

          const neighbors = numberGraph[current];
          if (neighbors) {
            neighbors.forEach((neighbor) => {
              if (!visited.has(neighbor)) stack.push(neighbor);
            });
          }
        }

        return component.sort();
      };

      Object.keys(numberGraph).forEach((num) => {
        if (visited.has(num)) return;
        const component = buildComponent(num);
        const groupKey = component.join('|');

        groupTotals[groupKey] = {
          expenseNumbers: component,
          totalExpenseAmount: 0,
        };

        component.forEach((n) => {
          numberToGroup[n] = groupKey;
        });
      });

      // Third pass: accumulate expense amounts per logical group
      (allExpenses || []).forEach((exp) => {
        if (exp.is_personal || !exp.expense_number) return;

        const numbers = Array.isArray(exp.expense_number)
          ? exp.expense_number.filter(Boolean)
          : [exp.expense_number];

        if (numbers.length === 0) return;

        const groupKey = numberToGroup[numbers[0]] || numbers.sort().join('|');

        if (!groupTotals[groupKey]) {
          groupTotals[groupKey] = {
            expenseNumbers: Array.from(new Set(numbers)).sort(),
            totalExpenseAmount: 0,
          };
        }

        groupTotals[groupKey].totalExpenseAmount += exp.amount_eur;
      });

      setExpenseGroupTotals(groupTotals);
      setExpenseNumberToGroupKey(numberToGroup);
      const expenseNumbers = new Set(reimbursementsList.map((r) => r.expense_number));
      const groupData: Record<string, GroupExpenseData> = {};
      const expensesMap: Record<string, AssociatedExpense[]> = {};

      // For each expense number, find matching expenses (excluding personal expenses)
      expenseNumbers.forEach((expenseNumber) => {
        const matchingExpenses = (allExpenses || []).filter(
          (exp) =>
            !exp.is_personal &&
            (
              Array.isArray(exp.expense_number)
                ? exp.expense_number.includes(expenseNumber)
                : exp.expense_number === expenseNumber
            ),
        );

        const totalExpenseAmount = matchingExpenses.reduce((sum, exp) => sum + exp.amount_eur, 0);

        groupData[expenseNumber] = {
          expenses: matchingExpenses,
          totalExpenseAmount,
        };

        // Also store by first reimbursement ID for easy access
        const firstReimbursement = reimbursementsList.find((r) => r.expense_number === expenseNumber);
        if (firstReimbursement && matchingExpenses.length > 0) {
          expensesMap[firstReimbursement.id] = matchingExpenses;
        }
      });

      setGroupExpenseData(groupData);
      setAssociatedExpenses(expensesMap);
    } catch (error) {
      console.error('Error loading expenses for groups:', error);
    }
  };

  const loadAssociatedExpenses = async (reimbursementId: string, matchedExpenseId: string) => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', matchedExpenseId);

      if (error) throw error;

      setAssociatedExpenses(prev => ({
        ...prev,
        [reimbursementId]: data || []
      }));
    } catch (error) {
      console.error('Error loading associated expenses:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les dépenses associées",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = async (reimbursement: Reimbursement) => {
    const newExpanded = new Set(expandedReimbursements);
    
    if (newExpanded.has(reimbursement.id)) {
      newExpanded.delete(reimbursement.id);
    } else {
      newExpanded.add(reimbursement.id);
      if (reimbursement.matched_expense_id && !associatedExpenses[reimbursement.id]) {
        await loadAssociatedExpenses(reimbursement.id, reimbursement.matched_expense_id);
      }
    }
    
    setExpandedReimbursements(newExpanded);
  };

  const toggleGroupExpanded = (expenseNumber: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(expenseNumber)) {
      newExpanded.delete(expenseNumber);
    } else {
      newExpanded.add(expenseNumber);
    }
    setExpandedGroups(newExpanded);
  };

  const handleDeleteReimbursement = async (id: string) => {
    try {
      const { error } = await supabase
        .from('reimbursements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setReimbursements((prev) => prev.filter((r) => r.id !== id));
      setAssociatedExpenses((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      
      toast({
        title: "Remboursement supprimé",
        description: "Le remboursement a été supprimé avec succès",
      });
    } catch (error) {
      console.error('Error deleting reimbursement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le remboursement",
        variant: "destructive",
      });
    }
  };

  const handleUnmatchReimbursement = async (reimbursement: Reimbursement) => {
    try {
      const { id, matched_expense_id } = reimbursement;

      if (matched_expense_id) {
        const { error: expenseError } = await supabase
          .from('expenses')
          .update({
            reimbursement_status: 'pending',
            reimbursed_amount: 0,
            expense_number: null,
            considered_complete: false,
          })
          .eq('id', matched_expense_id);

        if (expenseError) throw expenseError;
      }

      const { error } = await supabase
        .from('reimbursements')
        .update({ matched_expense_id: null })
        .eq('id', id);

      if (error) throw error;

      setReimbursements((prev) =>
        prev.map((r) => (r.id === id ? { ...r, matched_expense_id: null } : r))
      );

      setAssociatedExpenses((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });

      toast({
        title: "Association supprimée",
        description: "Le remboursement a été repassé en non associé et la dépense mise à jour",
      });
    } catch (error) {
      console.error('Error unmatching reimbursement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de retirer l'association du remboursement",
        variant: "destructive",
      });
    }
  };

  const handleApproveDiscrepancy = async (expenseNumber: string, approved: boolean) => {
    try {
      // Update all reimbursements with this expense_number
      const { error } = await supabase
        .from('reimbursements')
        .update({ discrepancy_approved: approved })
        .eq('expense_number', expenseNumber);

      if (error) throw error;

      // Update local state
      setReimbursements((prev) =>
        prev.map((r) => 
          r.expense_number === expenseNumber 
            ? { ...r, discrepancy_approved: approved } 
            : r
        )
      );

      toast({
        title: approved ? "Écart approuvé" : "Approbation annulée",
        description: approved 
          ? "L'écart a été marqué comme approuvé" 
          : "L'approbation de l'écart a été retirée",
      });
    } catch (error) {
      console.error('Error approving discrepancy:', error);
      toast({
        title: "Erreur",
        description: "Impossible de modifier le statut de l'écart",
        variant: "destructive",
      });
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

  const matchedReimbursements = reimbursements.filter(r => r.matched_expense_id && r.status !== 'cancelled');
  const unmatchedReimbursements = reimbursements.filter(r => !r.matched_expense_id && r.status !== 'cancelled');
  const cancelledReimbursements = reimbursements.filter(r => r.status === 'cancelled');
  const discrepancyApprovedReimbursements = reimbursements.filter(r => r.discrepancy_approved);
  
  // Group reimbursements by logical expense group (based on shared expense numbers) to calculate discrepancies
  const reimbursementsByGroupKey = new Map<string, number>();
  reimbursements
    .filter((r) => r.status !== 'cancelled')
    .forEach((r) => {
      const groupKey = expenseNumberToGroupKey[r.expense_number] || r.expense_number;
      const current = reimbursementsByGroupKey.get(groupKey) || 0;
      reimbursementsByGroupKey.set(groupKey, current + r.amount_eur);
    });

  // Calculate which logical groups have discrepancies (excluding approved ones)
  const groupKeysWithDiscrepancy = new Set<string>();
  reimbursementsByGroupKey.forEach((totalReimbursement, groupKey) => {
    const groupInfo = expenseGroupTotals[groupKey];
    if (groupInfo) {
      const hasDiscrepancy = Math.abs(groupInfo.totalExpenseAmount - totalReimbursement) > 0.01;
      // Check if any reimbursement in this group has approved the discrepancy
      const hasApprovedDiscrepancy = reimbursements.some(
        (r) => (expenseNumberToGroupKey[r.expense_number] || r.expense_number) === groupKey && r.discrepancy_approved
      );
      if (hasDiscrepancy && !hasApprovedDiscrepancy) {
        groupKeysWithDiscrepancy.add(groupKey);
      }
    }
  });
  
  const reimbursementsWithDiscrepancy = reimbursements.filter((r) => {
    const groupKey = expenseNumberToGroupKey[r.expense_number] || r.expense_number;
    return groupKeysWithDiscrepancy.has(groupKey);
  });

  const filteredReimbursements = reimbursements.filter((reimbursement) => {
    // Apply status filters
    const isMatched = !!reimbursement.matched_expense_id && reimbursement.status !== 'cancelled';
    const isCancelled = reimbursement.status === 'cancelled';
    const isUnmatched = !reimbursement.matched_expense_id && reimbursement.status !== 'cancelled';
    const groupKey = expenseNumberToGroupKey[reimbursement.expense_number] || reimbursement.expense_number;
    const hasDiscrepancy = groupKeysWithDiscrepancy.has(groupKey);
    const isDiscrepancyApproved = reimbursement.discrepancy_approved;
    
    const statusMatch = 
      (showUnmatched && isUnmatched) ||
      (showMatched && isMatched) ||
      (showWithDiscrepancy && hasDiscrepancy) ||
      (showCancelled && isCancelled) ||
      (showDiscrepancyApproved && isDiscrepancyApproved);
    
    if (!statusMatch) return false;
    const matchesSearch =
      reimbursement.payment_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reimbursement.expense_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reimbursement.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  // Group reimbursements by expense_number
  const groupedReimbursements = new Map<string, ReimbursementGroup>();
  
  filteredReimbursements.forEach((reimbursement) => {
    const expenseNum = reimbursement.expense_number;
    
    if (!groupedReimbursements.has(expenseNum)) {
      groupedReimbursements.set(expenseNum, {
        expense_number: expenseNum,
        reimbursements: [],
        total_amount: 0,
        payment_date: reimbursement.payment_date,
        expense_date: reimbursement.expense_date,
        category: reimbursement.category,
        all_matched: true,
      });
    }
    
    const group = groupedReimbursements.get(expenseNum)!;
    group.reimbursements.push(reimbursement);
    group.total_amount += reimbursement.amount_eur;
    
    if (!reimbursement.matched_expense_id) {
      group.all_matched = false;
    }
    
    // Keep the most recent expense date
    if (new Date(reimbursement.expense_date) > new Date(group.expense_date)) {
      group.expense_date = reimbursement.expense_date;
    }
  });

  const reimbursementGroups = Array.from(groupedReimbursements.values()).sort((a, b) => {
    if (sortOrder === "asc") {
      return a.payment_date.localeCompare(b.payment_date);
    }
    return b.payment_date.localeCompare(a.payment_date);
  });

  return (
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      {!embedded && <Navigation onUpload={() => {}} />}
      
      <div className={embedded ? "h-full p-4 space-y-4" : "container mx-auto py-8 px-4 space-y-6"}>
        {!embedded ? (
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Remboursements</h1>
            <p className="text-muted-foreground">
              {reimbursements.length} remboursements importés · {matchedReimbursements.length} associés · {unmatchedReimbursements.length} non associés · {cancelledReimbursements.length} annulés · {discrepancyApprovedReimbursements.length} écarts approuvés
            </p>
          </div>
        ) : (
          <h2 className="text-xl font-bold">Remboursements</h2>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-6 bg-card p-4 rounded-lg border">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par référence, n° note ou catégorie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-6 bg-card p-4 rounded-lg border">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-unmatched"
                checked={showUnmatched}
                onCheckedChange={(checked) => setShowUnmatched(checked as boolean)}
              />
              <Label htmlFor="show-unmatched" className="cursor-pointer text-sm whitespace-nowrap">
                Non associés ({unmatchedReimbursements.length})
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-matched"
                checked={showMatched}
                onCheckedChange={(checked) => setShowMatched(checked as boolean)}
              />
              <Label htmlFor="show-matched" className="cursor-pointer text-sm whitespace-nowrap">
                Associés ({matchedReimbursements.length})
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-discrepancy"
                checked={showWithDiscrepancy}
                onCheckedChange={(checked) => setShowWithDiscrepancy(checked as boolean)}
              />
              <Label htmlFor="show-discrepancy" className="cursor-pointer text-sm whitespace-nowrap">
                Avec écart ({reimbursementsWithDiscrepancy.length})
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-cancelled"
                checked={showCancelled}
                onCheckedChange={(checked) => setShowCancelled(checked as boolean)}
              />
              <Label htmlFor="show-cancelled" className="cursor-pointer text-sm whitespace-nowrap">
                Annulés ({cancelledReimbursements.length})
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-discrepancy-approved"
                checked={showDiscrepancyApproved}
                onCheckedChange={(checked) => setShowDiscrepancyApproved(checked as boolean)}
              />
              <Label htmlFor="show-discrepancy-approved" className="cursor-pointer text-sm whitespace-nowrap">
                Écart approuvé ({discrepancyApprovedReimbursements.length})
              </Label>
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="h-8 gap-1"
                  >
                    Date paiement
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Date dépense</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead>N° note</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reimbursementGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Aucun remboursement à afficher
                  </TableCell>
                </TableRow>
              ) : (
                reimbursementGroups.map((group) => {
                  const isGroupExpanded = expandedGroups.has(group.expense_number);
                  const hasMultiple = group.reimbursements.length > 1;
                  const firstReimbursement = group.reimbursements[0];
                  const isExpanded = expandedReimbursements.has(firstReimbursement.id);
                  const expenses = associatedExpenses[firstReimbursement.id] || [];
                  
                  // Use totals at logical group level (all related expense numbers together)
                  const groupKeyForRow = expenseNumberToGroupKey[group.expense_number] || group.expense_number;
                  const groupInfo = expenseGroupTotals[groupKeyForRow];
                  const totalReimbursementForGroup = reimbursementsByGroupKey.get(groupKeyForRow) || 0;
                  const hasAmountMismatch =
                    !!groupInfo &&
                    Math.abs(groupInfo.totalExpenseAmount - totalReimbursementForGroup) > 0.01;
                  
                  const rowClassName = hasMultiple 
                    ? "font-semibold" + (hasAmountMismatch ? " bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/30" : "")
                    : (hasAmountMismatch ? "bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/30" : "");
                  
                  return (
                    <>
                      {/* Main group row */}
                      <TableRow key={`group-${group.expense_number}`} className={rowClassName}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {hasMultiple && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => toggleGroupExpanded(group.expense_number)}
                              >
                                {isGroupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            )}
                            {new Date(group.payment_date).toLocaleDateString('fr-FR')}
                            {hasMultiple && <Badge variant="secondary" className="ml-2">{group.reimbursements.length} paiements</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(group.expense_date).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {hasMultiple ? "Multiple" : firstReimbursement.payment_reference}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{group.expense_number}</TableCell>
                        <TableCell>{group.category}</TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <span>{group.total_amount.toFixed(2)} €</span>
                            {hasAmountMismatch && groupInfo && (
                              <>
                                <Badge variant="outline" className="bg-orange-500 text-white border-orange-600">
                                  Δ {(totalReimbursementForGroup - groupInfo.totalExpenseAmount).toFixed(2)} €
                                </Badge>
                                <div className="flex items-center gap-2 ml-2">
                                  <Checkbox
                                    id={`approve-${group.expense_number}`}
                                    checked={group.reimbursements[0].discrepancy_approved}
                                    onCheckedChange={(checked) => handleApproveDiscrepancy(group.expense_number, checked as boolean)}
                                  />
                                  <Label 
                                    htmlFor={`approve-${group.expense_number}`} 
                                    className="cursor-pointer text-xs text-muted-foreground whitespace-nowrap"
                                  >
                                    Accepter l'écart
                                  </Label>
                                </div>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {group.reimbursements[0].status === 'cancelled' ? (
                            <Badge variant="secondary" className="bg-gray-400 text-white">Annulé</Badge>
                          ) : group.all_matched ? (
                            <Button 
                              variant="link" 
                              className="p-0 h-auto flex items-center gap-1"
                              onClick={() => toggleExpanded(firstReimbursement)}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <Badge variant="default" className="cursor-pointer">Associé</Badge>
                            </Button>
                          ) : (
                            <Badge variant="destructive">Non associé</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!hasMultiple && !firstReimbursement.matched_expense_id && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setManualExpenseDialog({ open: true, reimbursement: firstReimbursement })}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Dépense manuelle
                              </Button>
                            )}
                            {!hasMultiple && firstReimbursement.matched_expense_id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Unlink2 className="h-4 w-4 mr-1" />
                                    Dissocier
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Retirer l'association</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Ce remboursement sera repassé en non associé et la dépense liée redeviendra non remboursée sans numéro de note de frais.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleUnmatchReimbursement(firstReimbursement)}
                                    >
                                      Confirmer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            {!hasMultiple && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Êtes-vous sûr de vouloir supprimer ce remboursement ? Cette action est irréversible.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteReimbursement(firstReimbursement.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Supprimer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* Individual reimbursement details (when group is expanded) */}
                      {hasMultiple && isGroupExpanded && group.reimbursements.map((reimbursement, index) => (
                        <TableRow key={reimbursement.id} className="bg-muted/30">
                          <TableCell className="pl-12 text-sm">
                            {new Date(reimbursement.payment_date).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(reimbursement.expense_date).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {reimbursement.payment_reference}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{index + 1}
                          </TableCell>
                          <TableCell className="text-sm">{reimbursement.category}</TableCell>
                          <TableCell className="text-right text-sm">
                            {reimbursement.amount_eur.toFixed(2)} €
                          </TableCell>
                          <TableCell>
                            {reimbursement.matched_expense_id ? (
                              <Badge variant="outline" className="text-xs">Associé</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-destructive">Non associé</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {reimbursement.matched_expense_id && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <Unlink2 className="h-4 w-4 mr-1" />
                                      Dissocier
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Retirer l'association</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Ce remboursement sera repassé en non associé et la dépense liée redeviendra non remboursée sans numéro de note de frais.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleUnmatchReimbursement(reimbursement)}
                                      >
                                        Confirmer
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Êtes-vous sûr de vouloir supprimer ce remboursement ? Cette action est irréversible.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteReimbursement(reimbursement.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Supprimer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Associated expense details */}
                      {isExpanded && expenses.map((expense) => (
                        <TableRow key={`${firstReimbursement.id}-${expense.id}`} className="bg-muted/50">
                          <TableCell colSpan={8} className="pl-12">
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex-1 grid grid-cols-6 gap-4">
                                <div>
                                  <span className="text-muted-foreground">Date:</span>
                                  <span className="ml-2 font-medium">{new Date(expense.date).toLocaleDateString('fr-FR')}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Description:</span>
                                  <span className="ml-2">{expense.description}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Montant:</span>
                                  <span className="ml-2 font-medium">{expense.amount_eur.toFixed(2)} €</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Source:</span>
                                  <Badge className="ml-2" variant="secondary">{expense.source}</Badge>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">N° note:</span>
                                  <span className="ml-2 font-mono text-xs">{expense.expense_number?.join(', ') || '-'}</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {manualExpenseDialog.reimbursement && (
        <ManualExpenseDialog
          open={manualExpenseDialog.open}
          onOpenChange={(open) => setManualExpenseDialog({ open, reimbursement: null })}
          reimbursement={manualExpenseDialog.reimbursement}
          onSuccess={loadReimbursements}
        />
      )}
    </div>
  );
};

export default Reimbursements;
