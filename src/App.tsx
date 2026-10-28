import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Reconcile from "./pages/Reconcile";
import ExpensesPage from "./pages/ExpensesPage";
import NotesPage from "./pages/NotesPage";
import AdvanceDetails from "./pages/AdvanceDetails";
import Auth from "./pages/Auth";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import BankCallback from "./pages/BankCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reconcile" element={<Reconcile />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/stats" element={<Navigate to="/" replace />} />
          <Route path="/reimbursements" element={<Navigate to="/notes" replace />} />
          <Route path="/advance" element={<AdvanceDetails />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/bank-callback" element={<BankCallback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
