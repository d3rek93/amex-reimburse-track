import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2, Check, X } from "lucide-react";

export interface Expense {
  id: string;
  date: string;
  description: string;
  originalAmount?: number;
  originalCurrency?: string;
  conversionFees?: number;
  amountEur: number;
  expenseNumber?: string;
  reimbursementStatus: "pending" | "partial" | "complete";
  reimbursedAmount: number;
  isPersonal: boolean;
  source: "AMEX" | "Boursobank" | "Manuel";
}

interface ExpenseTableProps {
  expenses: Expense[];
  onUpdateExpense: (id: string, updates: Partial<Expense>) => void;
}

export const ExpenseTable = ({ expenses, onUpdateExpense }: ExpenseTableProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [partialAmounts, setPartialAmounts] = useState<Record<string, number>>({});

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setEditValue(expense.expenseNumber || "");
  };

  const handleSave = (id: string) => {
    onUpdateExpense(id, { expenseNumber: editValue });
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
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Montant original</TableHead>
            <TableHead>Frais conv.</TableHead>
            <TableHead>Montant EUR</TableHead>
            <TableHead>N° Note de frais</TableHead>
            <TableHead>Remboursement</TableHead>
            <TableHead>Montant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id} className={expense.isPersonal ? "opacity-50" : ""}>
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
              <TableCell className="font-semibold">{expense.amountEur.toFixed(2)} €</TableCell>
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
                    <span>{expense.expenseNumber || "-"}</span>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
