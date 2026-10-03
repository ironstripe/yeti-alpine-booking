import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useConversationCounts } from "@/hooks/useConversations";
import {
  isNavigationItemActive,
  primaryBottomNavigationItems,
  secondaryNavigationItems,
} from "@/components/layout/navigation";

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: conversationCounts } = useConversationCounts();

  const isSecondaryActive = secondaryNavigationItems.some(
    (item) => isNavigationItemActive(location.pathname, item.url)
  );
  const unreadCount = conversationCounts?.unread ?? 0;

  const handleNavClick = (url: string) => {
    navigate(url);
    setMoreOpen(false);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border">
      {/* Safe area padding for iOS */}
      <div className="pb-safe">
        <ul className="flex items-center justify-around h-16">
          {primaryBottomNavigationItems.map((item) => {
            const isActive = isNavigationItemActive(location.pathname, item.url);
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
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "flex h-16 min-w-[64px] w-full flex-col items-center justify-center rounded-none text-xs font-medium transition-colors",
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
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-destructive" />
                    )}
                  </div>
                  <span className={cn(isSecondaryActive && "font-semibold")}>
                    Mehr
                  </span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="flex max-h-[70vh] flex-col rounded-t-2xl">
                <SheetHeader className="pb-4">
                  <SheetTitle className="text-left">Mehr</SheetTitle>
                </SheetHeader>

                <nav className="grid min-h-0 grid-cols-4 gap-2 overflow-y-auto pb-8">
                  {secondaryNavigationItems.map((item) => {
                    const isActive = isNavigationItemActive(location.pathname, item.url);
                    const badgeCount = item.hasDynamicBadge ? unreadCount : 0;
                    return (
                      <Button
                        type="button"
                        variant="ghost"
                        key={item.title}
                        onClick={() => handleNavClick(item.url)}
                        className={cn(
                          "flex min-h-[80px] h-auto flex-col items-center justify-center p-3 transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        <div className="relative">
                          <item.icon className="h-6 w-6 mb-2" />
                          {badgeCount > 0 && (
                            <span className="absolute -top-1 -right-2 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                              {badgeCount}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">
                          {item.title}
                        </span>
                      </Button>
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
