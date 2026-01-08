import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  Home,
  Inbox,
  Calendar,
  Users,
  UserCheck,
  GraduationCap,
  LayoutGrid,
  FileText,
  Calculator,
  ShoppingCart,
  Gift,
  BarChart3,
} from "lucide-react";

const allNavItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Inbox", url: "/inbox", icon: Inbox, badge: 3 },
  { title: "Buchungen", url: "/bookings", icon: Calendar },
  { title: "Stundenplan", url: "/scheduler", icon: LayoutGrid },
  { title: "Kunden", url: "/customers", icon: Users },
  { title: "Skilehrer", url: "/instructors", icon: UserCheck },
  { title: "Trainings", url: "/trainings", icon: GraduationCap },
  { title: "Shop", url: "/shop", icon: ShoppingCart },
  { title: "Gutscheine", url: "/vouchers", icon: Gift },
  { title: "Berichte", url: "/reports", icon: BarChart3 },
  { title: "Listen", url: "/lists", icon: FileText },
  { title: "Tagesabschluss", url: "/reconciliation", icon: Calculator },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/inbox": "Inbox",
  "/bookings": "Buchungen",
  "/scheduler": "Stundenplan",
  "/customers": "Kunden",
  "/instructors": "Skilehrer",
  "/trainings": "Trainings",
  "/shop": "Shop",
  "/vouchers": "Gutscheine",
  "/reports": "Berichte",
  "/lists": "Listen",
  "/reconciliation": "Tagesabschluss",
};

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const currentPageTitle = pageTitles[location.pathname] || "YETY";

  const handleNavClick = (url: string) => {
    navigate(url);
    setOpen(false);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  };

  const getUserInitials = () => {
    if (!user?.email) return "??";
    const parts = user.email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 md:hidden bg-card border-b border-border h-14 flex items-center justify-between px-4 safe-area-inset-top">
      {/* Left: Menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="h-14 px-4 border-b border-border flex flex-row items-center justify-between">
            <SheetTitle className="font-display font-bold text-xl text-primary">
              YETY
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 py-2 overflow-y-auto max-h-[calc(100vh-140px)]">
            <ul className="space-y-1 px-2">
              {allNavItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <li key={item.title}>
                    <button
                      onClick={() => handleNavClick(item.url)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[48px]",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1 text-left">{item.title}</span>
                      {item.badge && (
                        <span className="flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-destructive text-destructive-foreground">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-border p-4 bg-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-medium">{getUserInitials()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.email?.split("@")[0]}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                disabled={loggingOut}
                className="h-10 w-10 shrink-0"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Center: Page Title */}
      <h1 className="font-display font-semibold text-base">
        {currentPageTitle}
      </h1>

      {/* Right: Notifications & User */}
      <div className="flex items-center gap-1">
        <NotificationBell />
        <Button variant="ghost" size="icon" className="h-10 w-10">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs font-medium">{getUserInitials()}</span>
          </div>
        </Button>
      </div>
    </header>
  );
}
