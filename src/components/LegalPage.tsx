import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LegalPageProps {
  title: string;
  intro?: string;
  updatedAt: string;
  children: ReactNode;
}

export const LegalPage = ({ title, intro, updatedAt, children }: LegalPageProps) => (
  <div className="min-h-screen bg-background">
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold">Suivi des Frais Professionnels</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour à l'application
            </Link>
          </Button>
        </div>
      </div>
    </header>

    <main className="container mx-auto px-4 py-10 max-w-3xl">
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mt-2">Dernière mise à jour : {updatedAt}</p>
      {intro ? (
        <p className="mt-6 leading-relaxed text-muted-foreground">{intro}</p>
      ) : null}
      <div className="mt-10 space-y-10">{children}</div>
    </main>

    <footer className="border-t bg-card mt-16">
      <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Suivi des Frais Professionnels</span>
        <nav className="flex items-center gap-5">
          <Link
            to="/privacy"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Politique de confidentialité
          </Link>
          <Link
            to="/terms"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Conditions d'utilisation
          </Link>
        </nav>
      </div>
    </footer>
  </div>
);

export const LegalSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section>
    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-foreground">
      {children}
    </div>
  </section>
);
