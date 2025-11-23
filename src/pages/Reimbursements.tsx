import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";
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

const Reimbursements = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMatched, setShowMatched] = useState(false);

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

  const handleDeleteReimbursement = async (id: string) => {
    try {
      const { error } = await supabase
        .from('reimbursements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setReimbursements((prev) => prev.filter((r) => r.id !== id));
      
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
  
  const displayedReimbursements = showMatched 
    ? reimbursements 
    : unmatchedReimbursements;

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
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-matched"
              checked={showMatched}
              onCheckedChange={(checked) => setShowMatched(checked as boolean)}
            />
            <Label htmlFor="show-matched" className="cursor-pointer text-sm">
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
                displayedReimbursements.map((reimbursement) => (
                  <TableRow key={reimbursement.id}>
                    <TableCell>{new Date(reimbursement.payment_date).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>{new Date(reimbursement.expense_date).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell className="font-mono text-sm">{reimbursement.payment_reference}</TableCell>
                    <TableCell className="font-mono text-sm">{reimbursement.expense_number}</TableCell>
                    <TableCell>{reimbursement.category}</TableCell>
                    <TableCell className="text-right font-medium">{reimbursement.amount_eur.toFixed(2)} €</TableCell>
                    <TableCell>
                      {reimbursement.matched_expense_id ? (
                        <Badge variant="default">Associé</Badge>
                      ) : (
                        <Badge variant="destructive">Non associé</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default Reimbursements;
