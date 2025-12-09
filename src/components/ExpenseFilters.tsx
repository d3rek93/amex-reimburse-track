import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Calendar, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { startOfMonth, endOfMonth, subMonths, startOfYear, format } from "date-fns";

interface ExpenseFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  showPersonal: boolean;
  showPending: boolean;
  showPartial: boolean;
  showComplete: boolean;
  onShowPersonalChange: (show: boolean) => void;
  onShowPendingChange: (show: boolean) => void;
  onShowPartialChange: (show: boolean) => void;
  onShowCompleteChange: (show: boolean) => void;
  onReset: () => void;
}

type QuickFilterType = "current" | "previous" | "3months" | "6months" | "year" | null;

export const ExpenseFilters = ({
  searchQuery,
  onSearchChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  showPersonal,
  showPending,
  showPartial,
  showComplete,
  onShowPersonalChange,
  onShowPendingChange,
  onShowPartialChange,
  onShowCompleteChange,
  onReset,
}: ExpenseFiltersProps) => {
  const getActiveQuickFilter = (): QuickFilterType => {
    const today = new Date();
    const currentMonthStart = format(startOfMonth(today), "yyyy-MM-dd");
    const currentMonthEnd = format(endOfMonth(today), "yyyy-MM-dd");
    const prevMonthStart = format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const prevMonthEnd = format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
    const threeMonthsStart = format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd");
    const sixMonthsStart = format(startOfMonth(subMonths(today, 5)), "yyyy-MM-dd");
    const yearStart = format(startOfYear(today), "yyyy-MM-dd");

    if (startDate === currentMonthStart && endDate === currentMonthEnd) return "current";
    if (startDate === prevMonthStart && endDate === prevMonthEnd) return "previous";
    if (startDate === threeMonthsStart && endDate === currentMonthEnd) return "3months";
    if (startDate === sixMonthsStart && endDate === currentMonthEnd) return "6months";
    if (startDate === yearStart && endDate === currentMonthEnd) return "year";
    return null;
  };

  const applyQuickFilter = (filter: QuickFilterType) => {
    const today = new Date();
    const currentMonthEnd = format(endOfMonth(today), "yyyy-MM-dd");

    switch (filter) {
      case "current":
        onStartDateChange(format(startOfMonth(today), "yyyy-MM-dd"));
        onEndDateChange(currentMonthEnd);
        break;
      case "previous":
        onStartDateChange(format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd"));
        onEndDateChange(format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd"));
        break;
      case "3months":
        onStartDateChange(format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"));
        onEndDateChange(currentMonthEnd);
        break;
      case "6months":
        onStartDateChange(format(startOfMonth(subMonths(today, 5)), "yyyy-MM-dd"));
        onEndDateChange(currentMonthEnd);
        break;
      case "year":
        onStartDateChange(format(startOfYear(today), "yyyy-MM-dd"));
        onEndDateChange(currentMonthEnd);
        break;
    }
  };

  const activeFilter = getActiveQuickFilter();

  const quickFilters = [
    { key: "current" as const, label: "Ce mois" },
    { key: "previous" as const, label: "Mois précédent" },
    { key: "3months" as const, label: "3 derniers mois" },
    { key: "6months" as const, label: "6 derniers mois" },
    { key: "year" as const, label: "Cette année" },
  ];

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4">
        {/* Quick filters */}
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((filter) => (
            <Button
              key={filter.key}
              variant={activeFilter === filter.key ? "default" : "outline"}
              size="sm"
              onClick={() => applyQuickFilter(filter.key)}
              className="text-xs"
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une transaction..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 items-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-40"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={onReset}>
            <Filter className="h-4 w-4 mr-2" />
            Réinitialiser
          </Button>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium">Filtres de visibilité</div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-personal"
                checked={showPersonal}
                onCheckedChange={(checked) => onShowPersonalChange(checked as boolean)}
              />
              <Label htmlFor="show-personal" className="cursor-pointer text-sm">
                Dépenses personnelles
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-pending"
                checked={showPending}
                onCheckedChange={(checked) => onShowPendingChange(checked as boolean)}
              />
              <Label htmlFor="show-pending" className="cursor-pointer text-sm">
                Non remboursées
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-partial"
                checked={showPartial}
                onCheckedChange={(checked) => onShowPartialChange(checked as boolean)}
              />
              <Label htmlFor="show-partial" className="cursor-pointer text-sm">
                Partiellement remboursées
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-complete"
                checked={showComplete}
                onCheckedChange={(checked) => onShowCompleteChange(checked as boolean)}
              />
              <Label htmlFor="show-complete" className="cursor-pointer text-sm">
                Complètement remboursées
              </Label>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};