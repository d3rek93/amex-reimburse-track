import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, ChevronDown, ChevronRight, Unlink2, Search } from "lucide-react";
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

interface Reimbursement {
  id: string;
  payment_date: string;
  payment_reference: string;
  expense_number: string;
  expense_date: string;
  category: string;
  amount_eur: number;
  matched_expense_id: string | null;
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

const Reimbursements = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMatched, setShowMatched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedReimbursements, setExpandedReimbursements] = useState<Set<string>>(new Set());
  const [associatedExpenses, setAssociatedExpenses] = useState<Record<string, AssociatedExpense[]>>({});

  useEffect(() => {
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
  }, [navigate]);

  const loadReimbursements = async () => {
    try {
      const { data, error } = await supabase
        .from('reimbursements')
        .select('*')
        .order('payment_date', { ascending: false });

      if (error) throw error;

      setReimbursements(data || []);
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

  const matchedReimbursements = reimbursements.filter(r => r.matched_expense_id);
  const unmatchedReimbursements = reimbursements.filter(r => !r.matched_expense_id);
  
  const baseDisplayedReimbursements = showMatched 
    ? reimbursements 
    : unmatchedReimbursements;

  const displayedReimbursements = baseDisplayedReimbursements.filter((reimbursement) => {
    const matchesSearch =
      reimbursement.payment_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reimbursement.expense_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reimbursement.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation onUpload={() => {}} />
      
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Remboursements</h1>
          <p className="text-muted-foreground">
            {reimbursements.length} remboursements importés · {matchedReimbursements.length} associés · {unmatchedReimbursements.length} non associés
          </p>
        </div>

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
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-matched"
              checked={showMatched}
              onCheckedChange={(checked) => setShowMatched(checked as boolean)}
            />
            <Label htmlFor="show-matched" className="cursor-pointer text-sm whitespace-nowrap">
              Afficher les remboursements associés
            </Label>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date paiement</TableHead>
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
              {displayedReimbursements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Aucun remboursement à afficher
                  </TableCell>
                </TableRow>
              ) : (
                displayedReimbursements.map((reimbursement) => {
                  const isExpanded = expandedReimbursements.has(reimbursement.id);
                  const expenses = associatedExpenses[reimbursement.id] || [];
                  
                  return (
                    <>
                      <TableRow key={reimbursement.id}>
                        <TableCell>{new Date(reimbursement.payment_date).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>{new Date(reimbursement.expense_date).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="font-mono text-sm">{reimbursement.payment_reference}</TableCell>
                        <TableCell className="font-mono text-sm">{reimbursement.expense_number}</TableCell>
                        <TableCell>{reimbursement.category}</TableCell>
                        <TableCell className="text-right font-medium">{reimbursement.amount_eur.toFixed(2)} €</TableCell>
                        <TableCell>
                          {reimbursement.matched_expense_id ? (
                            <Button 
                              variant="link" 
                              className="p-0 h-auto flex items-center gap-1"
                              onClick={() => toggleExpanded(reimbursement)}
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
                      
                      {isExpanded && expenses.map((expense) => (
                        <TableRow key={`${reimbursement.id}-${expense.id}`} className="bg-muted/50">
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
                                  <Badge variant="secondary" className="ml-2">{expense.source}</Badge>
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
    </div>
  );
};

export default Reimbursements;
