import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ManualTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const ManualTransferDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: ManualTransferDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    transfer_date: new Date().toISOString().split('T')[0],
    amount_eur: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from('manual_transfers')
        .insert({
          user_id: user.id,
          transfer_date: formData.transfer_date,
          amount_eur: parseFloat(formData.amount_eur),
          description: formData.description || null,
        });

      if (error) throw error;

      toast({
        title: "Virement enregistré",
        description: "Le virement a été ajouté avec succès",
      });

      setFormData({
        transfer_date: new Date().toISOString().split('T')[0],
        amount_eur: "",
        description: "",
      });

      onSuccess();
    } catch (error) {
      console.error('Error creating transfer:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer le virement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer un virement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="transfer_date">Date du virement</Label>
            <Input
              id="transfer_date"
              type="date"
              value={formData.transfer_date}
              onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="amount_eur">Montant (€)</Label>
            <Input
              id="amount_eur"
              type="number"
              step="0.01"
              value={formData.amount_eur}
              onChange={(e) => setFormData({ ...formData, amount_eur: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description (optionnel)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Virement pour rétablir l'avance"
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
