import { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";
import { MobileHeader } from "./MobileHeader";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { CommandBarTrigger } from "@/components/CommandBarTrigger";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";

interface AppLayoutProps {
  children?: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row w-full bg-background">
      {/* Desktop Sidebar */}
      <AppSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen md:min-h-0">
        {/* Mobile Header */}
        <MobileHeader />

        {/* Desktop Header with Command Bar and Notifications */}
        <div className="hidden md:flex h-14 border-b border-border items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-4">
            <CommandBarTrigger />
            <Button
              size="sm"
              onClick={() => navigate("/bookings/new")}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Neue Buchung
            </Button>
          </div>
          <NotificationBell />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-auto min-h-0">
          <div className={cn(
            "h-full",
            !['/scheduler'].includes(location.pathname) && "p-4 md:p-6 pb-24 md:pb-6"
          )}>
            {children ?? <Outlet />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Connection Status Indicator */}
      <ConnectionStatus />
    </div>
  );
}
