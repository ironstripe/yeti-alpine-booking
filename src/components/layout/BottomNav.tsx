import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Calendar,
  LayoutGrid,
  Users,
  MoreHorizontal,
  UserCheck,
  GraduationCap,
  FileText,
  Calculator,
  ShoppingCart,
  Gift,
  BarChart3,
  X,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Primary nav items (shown in bottom bar)
const primaryNavItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Buchungen", url: "/bookings", icon: Calendar },
  { title: "Stundenplan", url: "/scheduler", icon: LayoutGrid },
  { title: "Kunden", url: "/customers", icon: Users },
];

// Secondary nav items (shown in "Mehr" drawer)
const secondaryNavItems = [
  { title: "Posteingang", url: "/inbox", icon: Inbox, badge: 3 },
  { title: "Skilehrer", url: "/instructors", icon: UserCheck },
  { title: "Trainings", url: "/trainings", icon: GraduationCap },
  { title: "Shop", url: "/shop", icon: ShoppingCart },
  { title: "Gutscheine", url: "/vouchers", icon: Gift },
  { title: "Berichte", url: "/reports", icon: BarChart3 },
  { title: "Listen", url: "/lists", icon: FileText },
  { title: "Tagesabschluss", url: "/reconciliation", icon: Calculator },
];

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isSecondaryActive = secondaryNavItems.some(
    (item) => location.pathname === item.url
  );

  const handleNavClick = (url: string) => {
    navigate(url);
    setMoreOpen(false);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border">
      {/* Safe area padding for iOS */}
      <div className="pb-safe">
        <ul className="flex items-center justify-around h-16">
          {primaryNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <li key={item.title} className="flex-1">
                <NavLink
                  to={item.url}
                  className={cn(
                    "flex flex-col items-center justify-center h-16 text-xs font-medium transition-colors min-w-[64px]",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="relative">
                    <item.icon
                      className={cn(
                        "h-5 w-5 mb-1",
                        isActive && "text-primary"
                      )}
                    />
                  </div>
                  <span className={cn(isActive && "font-semibold")}>
                    {item.title}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-1 w-8 h-0.5 bg-primary rounded-full" />
                  )}
                </NavLink>
              </li>
            );
          })}

          {/* More Button */}
          <li className="flex-1">
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-16 text-xs font-medium transition-colors min-w-[64px]",
                    isSecondaryActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="relative">
                    <MoreHorizontal
                      className={cn(
                        "h-5 w-5 mb-1",
                        isSecondaryActive && "text-primary"
                      )}
                    />
                    {/* Badge indicator for items in more menu */}
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-destructive" />
                  </div>
                  <span className={cn(isSecondaryActive && "font-semibold")}>
                    Mehr
                  </span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl">
                <SheetHeader className="pb-4">
                  <SheetTitle className="text-left">Mehr</SheetTitle>
                </SheetHeader>

                <nav className="grid grid-cols-4 gap-2 pb-8">
                  {secondaryNavItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <button
                        key={item.title}
                        onClick={() => handleNavClick(item.url)}
                        className={cn(
                          "flex flex-col items-center justify-center p-3 rounded-xl transition-colors min-h-[80px]",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        <div className="relative">
                          <item.icon className="h-6 w-6 mb-2" />
                          {item.badge && (
                            <span className="absolute -top-1 -right-2 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">
                          {item.title}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </div>
    </nav>
  );
}
