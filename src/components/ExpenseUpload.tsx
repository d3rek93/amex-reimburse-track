import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ExpenseUploadProps {
  onUpload: (file: File) => void | Promise<void>;
  /** Called once after the whole batch has been processed. */
  onComplete?: () => void;
}

const ACCEPTED = /\.(pdf|csv|xls|xlsx)$/i;

export const ExpenseUpload = ({ onUpload, onComplete }: ExpenseUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { toast } = useToast();

  // Files go one at a time so each import sees what the previous one stored
  // (duplicate checks, automatic matching).
  const uploadAll = async (list: FileList | File[]) => {
    const files = Array.from(list);
    const valid = files.filter((f) => ACCEPTED.test(f.name));
    const rejected = files.length - valid.length;
    if (rejected > 0) {
      toast({
        title: "Fichier(s) ignoré(s)",
        description: `${rejected} fichier(s) non reconnu(s) : seuls PDF, CSV et XLS/XLSX sont acceptés`,
        variant: "destructive",
      });
    }
    if (valid.length === 0) return;

    let failed = 0;
    setProgress({ done: 0, total: valid.length });
    for (const [i, file] of valid.entries()) {
      try {
        await onUpload(file);
      } catch (err) {
        failed += 1;
        toast({
          title: `Échec : ${file.name}`,
          description: (err as Error).message ?? "Import impossible",
          variant: "destructive",
        });
      }
      setProgress({ done: i + 1, total: valid.length });
    }
    setProgress(null);
    onComplete?.();

    if (valid.length > 1) {
      toast({
        title: "Import terminé",
        description:
          `${valid.length - failed} fichier(s) traité(s) sur ${valid.length}` +
          (failed ? ` · ${failed} en échec` : ""),
      });
    }
  };

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
    if (progress) return;
    void uploadAll(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void uploadAll(files);
    // Allow picking the same files again later.
    e.target.value = "";
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
          {progress ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-primary" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">
            {progress
              ? `Import en cours… ${progress.done}/${progress.total}`
              : "Importer des relevés"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            PDF/CSV pour les dépenses, XLS pour les remboursements · plusieurs fichiers possibles
          </p>
        </div>
        <input
          type="file"
          accept=".pdf,.csv,.xls,.xlsx"
          multiple
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
          disabled={!!progress}
        />
        <label htmlFor="file-upload">
          <Button type="button" asChild disabled={!!progress}>
            <span>Parcourir les fichiers</span>
          </Button>
        </label>
      </div>
    </Card>
  );
};
