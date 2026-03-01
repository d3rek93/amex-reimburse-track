import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2, Check, X, Trash2, ArrowUpDown } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export interface Expense {
  id: string;
  date: string;
  description: string;
  originalAmount?: number;
  originalCurrency?: string;
  conversionFees?: number;
  amountEur: number;
  expenseNumber?: string[];
  reimbursementStatus: "pending" | "partial" | "complete" | "not_applicable";
  reimbursedAmount: number;
  isPersonal: boolean;
  source: "AMEX" | "Boursobank" | "Manuel";
  consideredComplete?: boolean;
}

interface ExpenseTableProps {
  expenses: Expense[];
  onUpdateExpense: (id: string, updates: Partial<Expense>) => void;
  onDeleteExpense?: (id: string) => void;
  highlightedExpenseId?: string | null;
}

export const ExpenseTable = ({ expenses, onUpdateExpense, onDeleteExpense, highlightedExpenseId }: ExpenseTableProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [partialAmounts, setPartialAmounts] = useState<Record<string, number>>({});
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedExpenses = [...expenses].sort((a, b) => {
    if (sortOrder === "asc") {
      return a.date.localeCompare(b.date);
    }
    return b.date.localeCompare(a.date);
  });

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setEditValue(expense.expenseNumber?.join(", ") || "");
  };

  const handleSave = async (id: string) => {
    const numbers = editValue
      .split(",")
      .map(n => n.trim())
      .filter(n => n.length > 0);
    
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    
    // If removing expense numbers, we need to detach reimbursements
    const oldNumbers = expense.expenseNumber || [];
    const newNumbers = numbers.length > 0 ? numbers : undefined;
    const removedNumbers = oldNumbers.filter(num => !numbers.includes(num));
    
    // First update the expense
    onUpdateExpense(id, { expenseNumber: newNumbers });
    
    // Then detach reimbursements for removed numbers
    if (removedNumbers.length > 0) {
      // Import supabase at component level if needed, or pass as prop
      // For now, we'll handle this in the parent component
      onUpdateExpense(id, { 
        expenseNumber: newNumbers,
        reimbursedAmount: 0,
        reimbursementStatus: 'pending'
      });
    }
    
    setEditingId(null);
  };

  const handleReimbursementChange = (expense: Expense, value: string) => {
    if (value === "complete") {
      onUpdateExpense(expense.id, {
        reimbursementStatus: "complete",
        reimbursedAmount: expense.amountEur,
      });
    } else if (value === "partial") {
      const amount = partialAmounts[expense.id] || 0;
      onUpdateExpense(expense.id, {
        reimbursementStatus: "partial",
        reimbursedAmount: amount,
      });
    } else {
      onUpdateExpense(expense.id, {
        reimbursementStatus: "pending",
        reimbursedAmount: 0,
      });
    }
  };

  const handlePartialAmountChange = (expenseId: string, amount: number) => {
    setPartialAmounts(prev => ({ ...prev, [expenseId]: amount }));
    const expense = expenses.find(e => e.id === expenseId);
    if (expense) {
      onUpdateExpense(expenseId, {
        reimbursementStatus: "partial",
        reimbursedAmount: amount,
      });
    }
  };

  const getStatusBadge = (status: Expense["reimbursementStatus"]) => {
    const variants = {
      pending: { label: "En attente", className: "bg-warning text-warning-foreground" },
      partial: { label: "Partiel", className: "bg-warning/70 text-warning-foreground" },
      complete: { label: "Remboursé", className: "bg-success text-success-foreground" },
      not_applicable: { label: "Non concerné", className: "bg-muted text-muted-foreground" },
    };
    const variant = variants[status];
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Personnel</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="h-8 gap-1"
              >
                Date
                <ArrowUpDown className="h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Montant original</TableHead>
            <TableHead>Frais conv.</TableHead>
            <TableHead>Montant EUR</TableHead>
            <TableHead>N° Note de frais</TableHead>
            <TableHead>Remboursement</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Max remb.</TableHead>
            {onDeleteExpense && <TableHead className="w-20">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedExpenses.map((expense) => (
            <TableRow 
              key={expense.id} 
              className={`
                ${expense.isPersonal ? "opacity-50" : ""} 
                ${highlightedExpenseId === expense.id ? "bg-primary/10 animate-pulse" : ""}
              `}
            >
              <TableCell>
                <Checkbox
                  checked={expense.isPersonal}
                  onCheckedChange={(checked) =>
                    onUpdateExpense(expense.id, { isPersonal: checked as boolean })
                  }
                />
              </TableCell>
              <TableCell>
                <Badge variant={expense.source === "AMEX" ? "default" : "secondary"}>
                  {expense.source}
                </Badge>
              </TableCell>
              <TableCell className="font-medium">{expense.date}</TableCell>
              <TableCell>{expense.description}</TableCell>
              <TableCell>
                {expense.originalCurrency && expense.originalAmount
                  ? `${expense.originalAmount.toFixed(2)} ${expense.originalCurrency}`
                  : "-"}
              </TableCell>
              <TableCell>
                {expense.conversionFees ? `${expense.conversionFees.toFixed(2)} €` : "-"}
              </TableCell>
              <TableCell className="font-semibold">
                {editingAmountId === expense.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={editAmountValue}
                      onChange={(e) => setEditAmountValue(e.target.value)}
                      className="h-8 w-24"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(editAmountValue);
                          if (!isNaN(val) && val >= 0) {
                            onUpdateExpense(expense.id, { amountEur: val });
                          }
                          setEditingAmountId(null);
                        } else if (e.key === 'Escape') {
                          setEditingAmountId(null);
                        }
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={() => {
                      const val = parseFloat(editAmountValue);
                      if (!isNaN(val) && val >= 0) {
                        onUpdateExpense(expense.id, { amountEur: val });
                      }
                      setEditingAmountId(null);
                    }}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingAmountId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={() => {
                      setEditingAmountId(expense.id);
                      setEditAmountValue(expense.amountEur.toString());
                    }}
                    title="Cliquer pour modifier"
                  >
                    {expense.amountEur.toFixed(2)} €
                  </span>
                )}
              </TableCell>
              <TableCell>
                {editingId === expense.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8 w-32"
                      placeholder="N° note"
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleSave(expense.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>{expense.expenseNumber?.join(", ") || "-"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(expense)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Select
                  value={expense.reimbursementStatus}
                  onValueChange={(value) => handleReimbursementChange(expense, value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Non remboursé</SelectItem>
                    <SelectItem value="partial">Remboursé partiellement</SelectItem>
                    <SelectItem value="complete">Remboursé</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {expense.reimbursementStatus === "partial" ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={partialAmounts[expense.id] ?? expense.reimbursedAmount}
                    onChange={(e) =>
                      handlePartialAmountChange(expense.id, parseFloat(e.target.value) || 0)
                    }
                    className="h-8 w-24"
                    placeholder="Montant"
                  />
                ) : expense.reimbursementStatus === "complete" ? (
                  <span className="text-muted-foreground">{expense.amountEur.toFixed(2)} €</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                {expense.reimbursementStatus === "partial" && (
                  <Checkbox
                    checked={expense.consideredComplete || false}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onUpdateExpense(expense.id, { 
                          consideredComplete: true,
                          reimbursementStatus: "complete"
                        });
                      } else {
                        onUpdateExpense(expense.id, { 
                          consideredComplete: false,
                          reimbursementStatus: "partial"
                        });
                      }
                    }}
                    title="Remboursement maximum atteint"
                  />
                )}
              </TableCell>
              {onDeleteExpense && (
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                        <AlertDialogDescription>
                          Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeleteExpense(expense.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
