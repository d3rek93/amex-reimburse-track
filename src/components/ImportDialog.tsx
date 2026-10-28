import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpenseUpload } from "@/components/ExpenseUpload";
import { useToast } from "@/hooks/use-toast";
import { importFile } from "@/lib/importFile";
import { useLedgerActions } from "@/lib/ledger";

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const { refresh } = useLedgerActions();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer des fichiers</DialogTitle>
          <DialogDescription>
            Relevés Jetfly (XLS) pour les notes de frais. Relevés AMEX (CSV ou PDF) et Boursobank (CSV) seulement si la
            synchronisation bancaire ne suffit pas.
          </DialogDescription>
        </DialogHeader>
        <ExpenseUpload
          onUpload={async (file) => {
            const outcome = await importFile(file);
            toast({ title: outcome.title, description: outcome.detail });
          }}
          onComplete={() => {
            void refresh();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
