import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ExpenseUploadProps {
  onUpload: (file: File) => void;
}

export const ExpenseUpload = ({ onUpload }: ExpenseUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/pdf" || file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx'))) {
      onUpload(file);
    } else {
      toast({
        title: "Fichier invalide",
        description: "Veuillez télécharger un fichier PDF, CSV ou XLS",
        variant: "destructive",
      });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <Card
      className={`p-8 border-2 border-dashed transition-colors cursor-pointer ${
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">
            Importer des relevés
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            PDF/CSV pour les dépenses, XLS pour les remboursements
          </p>
        </div>
        <input
          type="file"
          accept=".pdf,.csv,.xls,.xlsx"
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload">
          <Button type="button" asChild>
            <span>Parcourir les fichiers</span>
          </Button>
        </label>
      </div>
    </Card>
  );
};
