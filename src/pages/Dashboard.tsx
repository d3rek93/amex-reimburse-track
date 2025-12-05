import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Session } from "@supabase/supabase-js";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import Expenses from "./Expenses";
import Reimbursements from "./Reimbursements";

const Dashboard = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        if (!currentSession) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (!currentSession) {
        navigate("/auth");
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading || !session) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <Navigation onUpload={() => navigate('/expenses?openUpload=true')} />
      
      {isMobile ? (
        <div className="p-4">
          <Tabs defaultValue="expenses" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expenses">Dépenses</TabsTrigger>
              <TabsTrigger value="reimbursements">Remboursements</TabsTrigger>
            </TabsList>
            <TabsContent value="expenses" className="mt-4">
              <Expenses embedded />
            </TabsContent>
            <TabsContent value="reimbursements" className="mt-4">
              <Reimbursements embedded />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="h-[calc(100vh-4rem)]">
          <ResizablePanelGroup direction="horizontal" className="w-full">
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full overflow-auto">
                <Expenses embedded />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full overflow-auto">
                <Reimbursements embedded />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
