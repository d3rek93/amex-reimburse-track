import { Card } from "@/components/ui/card";
import { Expense } from "./ExpenseTable";
import { TrendingUp, Clock, CheckCircle } from "lucide-react";
import { ExpenseCharts } from "./ExpenseCharts";
import { AdvanceSummaryCard } from "./AdvanceSummaryCard";

interface BalanceReference {
  amount_eur: number;
  reference_date: string;
}

interface ExpenseStatsProps {
  expenses: Expense[];
  reimbursements: any[];
  manualTransfers: any[];
  balanceReference: BalanceReference | null;
  onTransferAdded: () => void;
  onBalanceReferenceUpdated: () => void;
}

export const ExpenseStats = ({ expenses, reimbursements, manualTransfers, balanceReference, onTransferAdded, onBalanceReferenceUpdated }: ExpenseStatsProps) => {
  const professionalExpenses = expenses.filter((e) => !e.isPersonal);
  
  // Filter out cancelled reimbursements
  const activeReimbursements = reimbursements.filter((r) => r.status !== 'cancelled');

  // --- Calcul des écarts approuvés (par groupe logique) ---
  // 1) Construire les groupes logiques de numéros de notes à partir des dépenses (comme sur la page remboursements)
  const numberGraph: Record<string, Set<string>> = {};

  professionalExpenses.forEach((exp) => {
    if (!exp.expenseNumber) return;

    const numbers = Array.isArray(exp.expenseNumber)
      ? exp.expenseNumber.filter(Boolean)
      : [exp.expenseNumber];

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

  // 2) Trouver les composantes connexes = groupes logiques
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

  // 3) Additionner les montants de dépenses par groupe logique
  professionalExpenses.forEach((exp) => {
    if (!exp.expenseNumber) return;

    const numbers = Array.isArray(exp.expenseNumber)
      ? exp.expenseNumber.filter(Boolean)
      : [exp.expenseNumber];

    if (numbers.length === 0) return;

    const groupKey = numberToGroup[numbers[0]] || numbers.sort().join('|');

    if (!groupTotals[groupKey]) {
      groupTotals[groupKey] = {
        expenseNumbers: Array.from(new Set(numbers)).sort(),
        totalExpenseAmount: 0,
      };
    }

    groupTotals[groupKey].totalExpenseAmount += exp.amountEur;
  });

  // 4) Calculer les totaux de remboursements par groupe logique, uniquement pour les écarts approuvés
  const reimbursementsByGroupKeyApproved = new Map<string, number>();

  activeReimbursements
    .filter((r) => r.discrepancy_approved)
    .forEach((r) => {
      const groupKey = numberToGroup[r.expense_number] || r.expense_number;
      const current = reimbursementsByGroupKeyApproved.get(groupKey) || 0;
      reimbursementsByGroupKeyApproved.set(groupKey, current + r.amount_eur);
    });

  // 5) Somme des écarts signés (remboursements - dépenses) sur tous les groupes approuvés
  const discrepancyApprovedTotal = Array.from(reimbursementsByGroupKeyApproved.entries()).reduce(
    (sum, [groupKey, totalReimbursement]) => {
      const groupInfo = groupTotals[groupKey];
      if (!groupInfo) return sum;

      const diff = totalReimbursement - groupInfo.totalExpenseAmount;
      return sum + diff;
    },
    0
  );
  
  // Calculate total reimbursed from active reimbursements only
  const totalReimbursed = activeReimbursements.reduce((sum, r) => sum + r.amount_eur, 0);
  
  const totalAmount = professionalExpenses.reduce((sum, e) => sum + e.amountEur, 0);
  const pending = professionalExpenses.filter((e) => e.reimbursementStatus === "pending").length;
  const complete = professionalExpenses.filter((e) => e.reimbursementStatus === "complete").length;

  // Calculate totals by source dynamically
  const sourceMap = new Map<string, { total: number; count: number }>();
  
  professionalExpenses.forEach((expense) => {
    const source = expense.source || "Non spécifié";
    const current = sourceMap.get(source) || { total: 0, count: 0 };
    sourceMap.set(source, {
      total: current.total + expense.amountEur,
      count: current.count + 1,
    });
  });

  const sourceStats = Array.from(sourceMap.entries())
    .map(([source, data]) => ({
      label: source,
      value: `${data.total.toFixed(2)} €`,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count);

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

  return (
    <div className="space-y-6">
      {/* Advance Balance Card */}
      <AdvanceSummaryCard />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
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
      
      <ExpenseCharts expenses={expenses} reimbursements={reimbursements} />
      
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Dépenses par source</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
