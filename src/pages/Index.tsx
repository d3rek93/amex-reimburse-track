import { useState } from "react";
import { ExpenseUpload } from "@/components/ExpenseUpload";
import { ExpenseTable, Expense } from "@/components/ExpenseTable";
import { ExpenseFilters } from "@/components/ExpenseFilters";
import { ExpenseStats } from "@/components/ExpenseStats";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

const Index = () => {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleUpload = (file: File) => {
    // Mock data for demonstration - will be replaced with actual PDF parsing
    const mockExpenses: Expense[] = [
      {
        id: "1",
        date: "2025-09-25",
        description: "3CPAYMENT*MAMA SHELTER LUXEMBOURG",
        amountEur: 204.0,
        expenseNumber: "",
        reimbursementStatus: "pending",
        reimbursedAmount: 0,
        isPersonal: false,
      },
      {
        id: "2",
        date: "2025-09-29",
        description: "UBER TRIP",
        amountEur: 29.28,
        expenseNumber: "",
        reimbursementStatus: "pending",
        reimbursedAmount: 0,
        isPersonal: false,
      },
      {
        id: "3",
        date: "2025-10-04",
        description: "3CPAYMENT*MOEVENPICK GE WEGGIS",
        originalAmount: 173.75,
        originalCurrency: "CHF",
        conversionFees: 17.67,
        amountEur: 191.42,
        expenseNumber: "",
        reimbursementStatus: "pending",
        reimbursedAmount: 0,
        isPersonal: false,
      },
      {
        id: "4",
        date: "2025-10-07",
        description: "LUFTHANSA.COM",
        originalAmount: 654.82,
        originalCurrency: "USD",
        conversionFees: 49.58,
        amountEur: 645.28,
        expenseNumber: "",
        reimbursementStatus: "pending",
        reimbursedAmount: 0,
        isPersonal: false,
      },
      {
        id: "5",
        date: "2025-10-11",
        description: "THE CONNAUGHT",
        originalAmount: 473.75,
        originalCurrency: "GBP",
        conversionFees: 90.43,
        amountEur: 564.18,
        expenseNumber: "",
        reimbursementStatus: "pending",
        reimbursedAmount: 0,
        isPersonal: false,
      },
    ];

    setExpenses(mockExpenses);
    toast({
      title: "Relevé importé avec succès",
      description: `${mockExpenses.length} transactions détectées`,
    });
  };

  const handleUpdateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses((prev) =>
      prev.map((expense) => (expense.id === id ? { ...expense, ...updates } : expense))
    );
  };

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch =
      expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.expenseNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const expenseDate = new Date(expense.date);
    const matchesStartDate = !startDate || expenseDate >= new Date(startDate);
    const matchesEndDate = !endDate || expenseDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const handleResetFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-8">
        <header className="flex items-center gap-3">
          <div className="rounded-lg bg-primary p-3">
            <FileText className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Suivi des Notes de Frais
            </h1>
            <p className="text-muted-foreground">
              Gérez vos remboursements AMEX en toute simplicité
            </p>
          </div>
        </header>

        {expenses.length === 0 ? (
          <ExpenseUpload onUpload={handleUpload} />
        ) : (
          <>
            <ExpenseStats expenses={expenses} />
            
            <ExpenseFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onReset={handleResetFilters}
            />

            <ExpenseTable
              expenses={filteredExpenses}
              onUpdateExpense={handleUpdateExpense}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
