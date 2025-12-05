import { Card } from "@/components/ui/card";
import { Expense } from "./ExpenseTable";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ExpenseChartsProps {
  expenses: Expense[];
  reimbursements: any[];
}

export const ExpenseCharts = ({ expenses, reimbursements }: ExpenseChartsProps) => {
  const professionalExpenses = expenses.filter((e) => !e.isPersonal);
  const activeReimbursements = reimbursements.filter((r) => r.status !== 'cancelled');

  // Monthly expenses and reimbursements
  const monthlyData = professionalExpenses.reduce((acc, expense) => {
    const month = expense.date.substring(0, 7); // YYYY-MM
    if (!acc[month]) {
      acc[month] = { month, expenses: 0, reimbursements: 0 };
    }
    acc[month].expenses += expense.amountEur;
    return acc;
  }, {} as Record<string, { month: string; expenses: number; reimbursements: number }>);

  activeReimbursements.forEach((reimb) => {
    const month = reimb.payment_date.substring(0, 7);
    if (monthlyData[month]) {
      monthlyData[month].reimbursements += reimb.amount_eur;
    }
  });

  const monthlyChartData = Object.values(monthlyData)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      month: new Date(item.month + "-01").toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      Dépenses: parseFloat(item.expenses.toFixed(2)),
      Remboursements: parseFloat(item.reimbursements.toFixed(2)),
    }));

  // Source breakdown - dynamically build from all sources
  const sourceMap = new Map<string, number>();
  
  professionalExpenses.forEach((expense) => {
    const source = expense.source || "Non spécifié";
    const current = sourceMap.get(source) || 0;
    sourceMap.set(source, current + expense.amountEur);
  });

  const sourceData = Array.from(sourceMap.entries())
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const COLORS = [
    'hsl(var(--primary))', 
    'hsl(var(--success))', 
    'hsl(var(--info))',
    'hsl(var(--warning))',
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))'
  ];

  // Status breakdown
  const statusData = [
    {
      name: "En attente",
      value: professionalExpenses.filter((e) => e.reimbursementStatus === "pending").length,
    },
    {
      name: "Partiel",
      value: professionalExpenses.filter((e) => e.reimbursementStatus === "partial").length,
    },
    {
      name: "Remboursé",
      value: professionalExpenses.filter((e) => e.reimbursementStatus === "complete").length,
    },
  ].filter((item) => item.value > 0);

  const STATUS_COLORS = ['hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--success))'];

  return (
    <div className="space-y-6">
      {/* Monthly trend */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Évolution mensuelle</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend />
            <Line type="monotone" dataKey="Dépenses" stroke="hsl(var(--primary))" strokeWidth={2} />
            <Line type="monotone" dataKey="Remboursements" stroke="hsl(var(--success))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Source breakdown - Donut chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Répartition par source</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sourceData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                fill="hsl(var(--primary))"
                dataKey="value"
                strokeWidth={2}
                stroke="hsl(var(--card))"
              >
                {sourceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number) => `${value.toFixed(2)} €`}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => value}
              />
              {/* Center label */}
              <text
                x="50%"
                y="45%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground"
                style={{ fontSize: '24px', fontWeight: 'bold' }}
              >
                {sourceData.reduce((acc, item) => acc + item.value, 0).toFixed(0)} €
              </text>
              <text
                x="50%"
                y="55%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                style={{ fontSize: '12px' }}
              >
                Total dépenses
              </text>
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Status breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Statut des remboursements</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))">
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
};
