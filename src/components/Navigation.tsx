import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, FileText, LogOut, BarChart3, Receipt, Upload, DollarSign, LayoutGrid, SplitSquareVertical, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

interface NavigationProps {
  onUpload?: () => void;
}

export const Navigation = ({ onUpload }: NavigationProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isCombinedView = location.pathname === "/";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleToggleView = () => {
    if (isCombinedView) {
      navigate("/expenses");
    } else {
      navigate("/");
    }
  };

  const menuItems = [
    { to: "/expenses", label: "Dépenses", icon: Receipt, hideInCombined: true },
    { to: "/reimbursements", label: "Remboursements", icon: DollarSign, hideInCombined: true },
    { to: "/advance", label: "Avance", icon: Wallet, hideInCombined: false },
    { to: "/stats", label: "Statistiques", icon: BarChart3, hideInCombined: false },
  ];

  return (
    <nav className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold hidden sm:block">
              Suivi des Frais Professionnels
            </h1>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            <Button
              variant={isCombinedView ? "default" : "ghost"}
              size="sm"
              onClick={handleToggleView}
              className="flex items-center gap-2"
            >
              {isCombinedView ? <SplitSquareVertical className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              {isCombinedView ? "Vue séparée" : "Vue combinée"}
            </Button>
            {menuItems
              .filter(item => !isCombinedView || !item.hideInCombined)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className="px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                  activeClassName="text-foreground bg-muted font-medium"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            {onUpload && (
              <Button variant="outline" size="sm" onClick={onUpload} className="ml-2">
                <Upload className="h-4 w-4 mr-2" />
                Importer
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="ml-2">
              <LogOut className="h-4 w-4 mr-2" />
              Déconnexion
            </Button>
          </div>

          {/* Mobile Navigation */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <div className="flex flex-col gap-4 mt-8">
                <Button
                  variant={isCombinedView ? "default" : "ghost"}
                  onClick={() => {
                    handleToggleView();
                    setOpen(false);
                  }}
                  className="justify-start"
                >
                  {isCombinedView ? <SplitSquareVertical className="h-5 w-5 mr-3" /> : <LayoutGrid className="h-5 w-5 mr-3" />}
                  {isCombinedView ? "Vue séparée" : "Vue combinée"}
                </Button>
                {menuItems
                  .filter(item => !isCombinedView || !item.hideInCombined)
                  .map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      className="px-4 py-3 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-3"
                      activeClassName="text-foreground bg-muted font-medium"
                      onClick={() => setOpen(false)}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </NavLink>
                  ))}
                {onUpload && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onUpload();
                      setOpen(false);
                    }}
                    className="justify-start"
                  >
                    <Upload className="h-5 w-5 mr-3" />
                    Importer
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  Déconnexion
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};
