import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ManualExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reimbursement: {
    id: string;
    expense_number: string;
    amount_eur: number;
    expense_date: string;
    category: string;
  };
  onSuccess: () => void;
}

export const ManualExpenseDialog = ({ open, onOpenChange, reimbursement, onSuccess }: ManualExpenseDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    description: reimbursement.category,
    source: "",
    date: reimbursement.expense_date,
    amount: reimbursement.amount_eur.toString(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.source.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez indiquer la source de paiement",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Create the manual expense
      const { data: newExpense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          date: formData.date,
          description: formData.description,
          amount_eur: parseFloat(formData.amount),
          source: formData.source,
          expense_number: [reimbursement.expense_number],
          reimbursement_status: 'complete',
          reimbursed_amount: parseFloat(formData.amount),
          is_personal: false,
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      // Update the reimbursement to mark it as matched
      const { error: reimbursementError } = await supabase
        .from('reimbursements')
        .update({ matched_expense_id: newExpense.id })
        .eq('id', reimbursement.id);

      if (reimbursementError) throw reimbursementError;

      toast({
        title: "Dépense créée",
        description: "La dépense manuelle a été créée et associée au remboursement",
      });

      onSuccess();
      onOpenChange(false);
      setFormData({
        description: "",
        source: "",
        date: "",
        amount: "",
      });
    } catch (error) {
      console.error('Error creating manual expense:', error);
      toast({
        title: "Erreur",
        description: "Impossible de créer la dépense manuelle",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Ajouter une dépense manuelle</DialogTitle>
          <DialogDescription>
            Créez une dépense manuelle qui sera automatiquement associée au remboursement n°{reimbursement.expense_number}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source">Source de paiement *</Label>
              <Input
                id="source"
                placeholder="Ex: Carte personnelle, Espèces, etc."
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description de la dépense"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="amount">Montant (€)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer la dépense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
