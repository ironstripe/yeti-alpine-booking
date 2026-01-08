import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Mail, Bell, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/layout";
import { PageHeader } from "@/components/layout/PageHeader";

const settingsNav = [
  { title: "E-Mail Vorlagen", url: "/settings/emails", icon: Mail },
  { title: "Benachrichtigungen", url: "/settings/notifications", icon: Bell },
  { title: "System", url: "/settings/system", icon: Settings2 },
];

interface SettingsLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
}

export function SettingsLayout({ children, title, description }: SettingsLayoutProps) {
  const location = useLocation();

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader title="Einstellungen" />

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <nav className="lg:w-64 shrink-0">
            <div className="bg-card rounded-lg border border-border p-2 space-y-1">
              {settingsNav.map((item) => {
                const isActive = location.pathname.startsWith(item.url);
                return (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{title}</h2>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
