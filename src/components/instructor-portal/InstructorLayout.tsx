import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Home, Calendar, Hand, User, Menu, X, Bell, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

interface InstructorLayoutProps {
  children: ReactNode;
}

const navItems = [
  { title: "Heute", url: "/instructor", icon: Home },
  { title: "Plan", url: "/instructor/schedule", icon: Calendar },
  { title: "Abwesend", url: "/instructor/availability", icon: Hand },
  { title: "Profil", url: "/instructor/profile", icon: User },
];

export function InstructorLayout({ children }: InstructorLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, loading: authLoading } = useAuth();
  const { isTeacher, isAdminOrOffice, loading: roleLoading, instructorId } = useUserRole();

  // Redirect non-teachers to main app (unless admin/office)
  useEffect(() => {
    if (!authLoading && !roleLoading && user) {
      if (!isTeacher && !isAdminOrOffice) {
        navigate("/login");
      }
    }
  }, [isTeacher, isAdminOrOffice, authLoading, roleLoading, user, navigate]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  const isActive = (path: string) => {
    if (path === "/instructor") {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/instructor":
        return "Mein Tag";
      case "/instructor/schedule":
        return "Mein Stundenplan";
      case "/instructor/availability":
        return "Meine Verfügbarkeit";
      case "/instructor/profile":
        return "Mein Profil";
      default:
        if (location.pathname.startsWith("/instructor/booking/")) {
          return "Buchungsdetails";
        }
        return "YETY";
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background border-b h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="p-6 border-b">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user?.email}</p>
                    <p className="text-sm text-muted-foreground">Skilehrer</p>
                  </div>
                </div>
              </div>
              <nav className="p-4 space-y-1">
                {navItems.map((item) => (
                  <SheetClose asChild key={item.url}>
                    <button
                      onClick={() => navigate(item.url)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                        isActive(item.url)
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </button>
                  </SheetClose>
                ))}
                <div className="pt-4 border-t mt-4">
                  <SheetClose asChild>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Abmelden</span>
                    </button>
                  </SheetClose>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
          <h1 className="font-semibold text-lg">{getPageTitle()}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 relative">
            <Bell className="h-5 w-5" />
          </Button>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20">
        <div className="p-4 max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const active = isActive(item.url);
            return (
              <button
                key={item.url}
                onClick={() => navigate(item.url)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-full h-full touch-target transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "text-primary")} />
                <span className="text-xs font-medium">{item.title}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
