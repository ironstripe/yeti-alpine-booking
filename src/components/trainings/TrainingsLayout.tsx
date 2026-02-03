import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Package, Calendar, Users2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const trainingTabs = [
  { title: "Kursvorlagen", url: "/trainings", icon: Package },
  { title: "Wochenplanung", url: "/trainings/planning", icon: Calendar },
  { title: "Kapazität", url: "/trainings/capacity", icon: Users2 },
];

interface TrainingsLayoutProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function TrainingsLayout({ children, actions }: TrainingsLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab based on current path
  const getActiveTab = () => {
    if (location.pathname.startsWith("/trainings/capacity")) return "/trainings/capacity";
    if (location.pathname.startsWith("/trainings/planning")) return "/trainings/planning";
    if (location.pathname === "/trainings" || location.pathname.startsWith("/trainings/")) {
      // Check if it's the base trainings page or a sub-route like /trainings/:id/instances
      const isDetailPage = /^\/trainings\/[^/]+/.test(location.pathname) && 
        !location.pathname.startsWith("/trainings/planning") && 
        !location.pathname.startsWith("/trainings/capacity");
      if (location.pathname === "/trainings" || isDetailPage) return "/trainings";
    }
    return "/trainings";
  };

  const activeTab = getActiveTab();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trainings"
        description="Verwalte Kursvorlagen, Lehrerzuweisungen und Kapazität"
        actions={actions}
      />

      <Tabs value={activeTab} onValueChange={(value) => navigate(value)}>
        <TabsList>
          {trainingTabs.map((tab) => (
            <TabsTrigger key={tab.url} value={tab.url} className="gap-2">
              <tab.icon className="h-4 w-4" />
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {children}
    </div>
  );
}
