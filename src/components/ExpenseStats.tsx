import { Card } from "@/components/ui/card";
import { Expense } from "./ExpenseTable";
import { TrendingUp, Clock, CheckCircle, XCircle } from "lucide-react";

interface ExpenseStatsProps {
  expenses: Expense[];
  reimbursements: any[];
}

export const ExpenseStats = ({ expenses, reimbursements }: ExpenseStatsProps) => {
  const professionalExpenses = expenses.filter((e) => !e.isPersonal);
  
  // Filter out cancelled reimbursements
  const activeReimbursements = reimbursements.filter((r) => r.status !== 'cancelled');
  
  // Calculate actual discrepancy amounts for approved discrepancies
  const discrepancyApprovedTotal = reimbursements
    .filter((r) => r.discrepancy_approved)
    .reduce((sum, r) => {
      // Find all expenses with matching expense_number
      const relatedExpenses = professionalExpenses.filter((e) => {
        if (!e.expenseNumber) return false;
        const numbers = Array.isArray(e.expenseNumber) ? e.expenseNumber : [e.expenseNumber];
        return numbers.includes(r.expense_number);
      });
      
      // Calculate total expenses for this group
      const totalExpenses = relatedExpenses.reduce((s, e) => s + e.amountEur, 0);
      
      // Find all reimbursements with the same expense_number
      const relatedReimbursements = activeReimbursements.filter(
        (reim) => reim.expense_number === r.expense_number
      );
      const totalReimbursements = relatedReimbursements.reduce((s, reim) => s + reim.amount_eur, 0);
      
      // Calculate the discrepancy (difference)
      const discrepancy = Math.abs(totalExpenses - totalReimbursements);
      
      return sum + discrepancy;
    }, 0);
  
  // Calculate total reimbursed from active reimbursements only
  const totalReimbursed = activeReimbursements.reduce((sum, r) => sum + r.amount_eur, 0);
  
  const totalAmount = professionalExpenses.reduce((sum, e) => sum + e.amountEur, 0);
  const pending = professionalExpenses.filter((e) => e.reimbursementStatus === "pending").length;
  const complete = professionalExpenses.filter((e) => e.reimbursementStatus === "complete").length;

  // Calculate totals by source
  const amexTotal = professionalExpenses
    .filter((e) => e.source === "AMEX")
    .reduce((sum, e) => sum + e.amountEur, 0);
  const boursobankTotal = professionalExpenses
    .filter((e) => e.source === "Boursobank")
    .reduce((sum, e) => sum + e.amountEur, 0);

  const stats = [
    {
      label: "Total des dépenses",
      value: `${totalAmount.toFixed(2)} €`,
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Total remboursé",
      value: `${totalReimbursed.toFixed(2)} €`,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "En attente",
      value: `${(totalAmount - totalReimbursed).toFixed(2)} €`,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Écarts approuvés",
      value: `${discrepancyApprovedTotal.toFixed(2)} €`,
      icon: CheckCircle,
      color: "text-info",
      bgColor: "bg-info/10",
    },
  ];

  const sourceStats = [
    {
      label: "AMEX",
      value: `${amexTotal.toFixed(2)} €`,
      count: professionalExpenses.filter((e) => e.source === "AMEX").length,
    },
    {
      label: "Boursobank",
      value: `${boursobankTotal.toFixed(2)} €`,
      count: professionalExpenses.filter((e) => e.source === "Boursobank").length,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
              <div className={`rounded-full p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Dépenses par source</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sourceStats.map((source, index) => (
            <div key={index} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm text-muted-foreground">{source.label}</p>
                <p className="text-xl font-bold">{source.value}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Transactions</p>
                <p className="text-lg font-semibold">{source.count}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
