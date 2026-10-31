import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JetflyAppImport } from "@/components/JetflyAppImport";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpenseUpload } from "@/components/ExpenseUpload";
import { useToast } from "@/hooks/use-toast";
import { importFile } from "@/lib/importFile";
import { useLedgerActions } from "@/lib/ledger";

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const { refresh } = useLedgerActions();
  const [appOpen, setAppOpen] = useState(false);

  return (
    <>
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
        <div className="border-t pt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1 min-w-[12rem]">
            Un virement Jetfly reçu avant le relevé du mois ? Ajoute la capture de l'app Jetfly.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setAppOpen(true);
            }}
          >
            <Smartphone className="h-4 w-4 mr-2" /> Capture de l'app Jetfly
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <JetflyAppImport open={appOpen} onOpenChange={setAppOpen} />
    </>
  );
}
