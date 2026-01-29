import { useNavigate } from "react-router-dom";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Building2, GraduationCap } from "lucide-react";

const roleConfig: Record<AppRole, { label: string; buttonLabel: string; icon: React.ElementType; route: string }> = {
  admin: {
    label: "Administrator",
    buttonLabel: "Als Administrator anmelden",
    icon: Shield,
    route: "/",
  },
  office: {
    label: "Büro",
    buttonLabel: "Als Büro-Mitarbeiter anmelden",
    icon: Building2,
    route: "/",
  },
  teacher: {
    label: "Skilehrer",
    buttonLabel: "Als Skilehrer anmelden",
    icon: GraduationCap,
    route: "/instructor",
  },
};

export function RoleSwitcherModal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, loading } = useUserRole();
  const { activeRole, setActiveRole } = useActiveRole();

  // Don't show if not logged in, still loading, single role, or role already selected
  const shouldShow = user && !loading && roles.length > 1 && !activeRole;

  const handleSelectRole = (role: AppRole) => {
    setActiveRole(role);
    const config = roleConfig[role];
    navigate(config.route, { replace: true });
  };

  if (!shouldShow) return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Rolle auswählen</DialogTitle>
          <DialogDescription>
            Sie haben mehrere Rollen. Bitte wählen Sie, mit welcher Rolle Sie sich anmelden möchten.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 pt-4">
          {roles.map((role) => {
            const config = roleConfig[role];
            const Icon = config.icon;
            
            return (
              <Button
                key={role}
                variant="outline"
                className="h-auto py-4 px-4 justify-start gap-4"
                onClick={() => handleSelectRole(role)}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">{config.label}</div>
                  <div className="text-sm text-muted-foreground">{config.buttonLabel}</div>
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
