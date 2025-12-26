import { NavLink, useLocation } from "react-router-dom";
import { Home, Inbox, Calendar, Users, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Inbox", url: "/inbox", icon: Inbox, badge: 3 },
  { title: "Bookings", url: "/bookings", icon: Calendar },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Instructors", url: "/instructors", icon: UserCheck },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border safe-area-inset-bottom">
      <ul className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <li key={item.title} className="relative">
              <NavLink
                to={item.url}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-14 text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-nav-inactive hover:text-foreground"
                )}
              >
                <div className="relative">
                  <item.icon className={cn("h-5 w-5 mb-1", isActive && "text-primary")} />
                  {item.badge && (
                    <span className="absolute -top-1 -right-2 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold rounded-full bg-badge-red text-badge-red-foreground">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span>{item.title}</span>
                {isActive && (
                  <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}