import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
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

        {unmatchedReimbursements.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Non associés</h2>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedReimbursements.map((reimbursement) => (
                    <TableRow key={reimbursement.id}>
                      <TableCell>{new Date(reimbursement.payment_date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>{new Date(reimbursement.expense_date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="font-mono text-sm">{reimbursement.payment_reference}</TableCell>
                      <TableCell className="font-mono text-sm">{reimbursement.expense_number}</TableCell>
                      <TableCell>{reimbursement.category}</TableCell>
                      <TableCell className="text-right font-medium">{reimbursement.amount_eur.toFixed(2)} €</TableCell>
                      <TableCell>
                        <Badge variant="destructive">Non associé</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {matchedReimbursements.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Associés</h2>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedReimbursements.map((reimbursement) => (
                    <TableRow key={reimbursement.id}>
                      <TableCell>{new Date(reimbursement.payment_date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>{new Date(reimbursement.expense_date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="font-mono text-sm">{reimbursement.payment_reference}</TableCell>
                      <TableCell className="font-mono text-sm">{reimbursement.expense_number}</TableCell>
                      <TableCell>{reimbursement.category}</TableCell>
                      <TableCell className="text-right font-medium">{reimbursement.amount_eur.toFixed(2)} €</TableCell>
                      <TableCell>
                        <Badge variant="default">Associé</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reimbursements;
