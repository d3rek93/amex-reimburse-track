import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, LogOut, Menu, Upload } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BankSyncDialog } from "@/components/BankSyncDialog";
import { ImportDialog } from "@/components/ImportDialog";
import { supabase } from "@/integrations/supabase/client";
import { useLedger, useLedgerActions } from "@/lib/ledger";
import { cn } from "@/lib/utils";

/** Every signed-in page: top bar, sign-in guard, import and bank dialogs. */
export function AppLayout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const { ledger } = useLedger();
  const { refresh } = useLedgerActions();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    document.title = `${title} – Notes de frais`;
  }, [title]);

  const toReview = ledger?.counts.toReview ?? 0;
  const items = [
    { to: "/", label: "Tableau de bord" },
    { to: "/reconcile", label: "Rapprochement", count: toReview },
    { to: "/expenses", label: "Dépenses" },
    { to: "/notes", label: "Notes Jetfly" },
  ];

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const links = (onClick?: () => void) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end
        onClick={onClick}
        className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-2"
        activeClassName="text-foreground bg-muted font-medium"
      >
        {item.label}
        {item.count ? (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center tabular-nums">
            {item.count}
          </span>
        ) : null}
      </NavLink>
    ));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
          <span className="font-semibold tracking-tight whitespace-nowrap">Notes de frais</span>
          <nav className="hidden md:flex items-center gap-1">{links()}</nav>
          <div className="ml-auto hidden md:flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Importer
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBankOpen(true)}>
              <Landmark className="h-4 w-4 mr-2" /> Banques
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto md:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 flex flex-col gap-1 pt-12">
              {links(() => setMenuOpen(false))}
              <div className="border-t my-3" />
              <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); setImportOpen(true); }}>
                <Upload className="h-4 w-4 mr-2" /> Importer
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); setBankOpen(true); }}>
                <Landmark className="h-4 w-4 mr-2" /> Banques
              </Button>
              <Button variant="ghost" className="justify-start" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {actions}
        </div>
        <div className={cn(!ready && "opacity-0")}>{ready ? children : null}</div>
      </main>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <BankSyncDialog open={bankOpen} onOpenChange={setBankOpen} onSynced={() => void refresh()} />
    </div>
  );
}
