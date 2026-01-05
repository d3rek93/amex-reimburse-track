import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface BalanceReference {
  amount_eur: number;
  reference_date: string;
}

interface SetBalanceReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentReference: BalanceReference | null;
  onSuccess: () => void;
}

export const SetBalanceReferenceDialog = ({
  open,
  onOpenChange,
  currentReference,
  onSuccess,
}: SetBalanceReferenceDialogProps) => {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && currentReference) {
      setAmount(currentReference.amount_eur.toString());
      setDate(currentReference.reference_date);
    } else if (open) {
      setAmount("");
      setDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, currentReference]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue)) {
      toast.error("Veuillez entrer un montant valide");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Vous devez être connecté");
        return;
      }

      // Check if user already has a balance reference
      const { data: existing } = await supabase
        .from("balance_references")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("balance_references")
          .update({
            amount_eur: amountValue,
            reference_date: date,
          })
          .eq("id", existing.id);

        if (error) throw error;
        toast.success("Solde de référence mis à jour");
      } else {
        // Insert new
        const { error } = await supabase
          .from("balance_references")
          .insert({
            user_id: user.id,
            amount_eur: amountValue,
            reference_date: date,
          });

        if (error) throw error;
        toast.success("Solde de référence défini");
      }

      onSuccess();
    } catch (error: any) {
      console.error("Error saving balance reference:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Définir le solde de référence</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Solde actuel du compte (€)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 182.31"
              required
            />
            <p className="text-xs text-muted-foreground">
              Entrez le solde réel de votre compte bancaire dédié aux frais pro.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date de référence</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              L'app calculera les mouvements à partir de cette date.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
