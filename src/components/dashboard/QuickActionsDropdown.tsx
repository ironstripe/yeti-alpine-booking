import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, CalendarPlus, UserPlus, MessageSquare, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function QuickActionsDropdown() {
  const navigate = useNavigate();

  const actions = [
    {
      label: "Neue Buchung erstellen",
      icon: CalendarPlus,
      onClick: () => navigate("/bookings/new"),
    },
    {
      label: "Neuen Kunden anlegen",
      icon: UserPlus,
      onClick: () => navigate("/customers?new=true"),
    },
    {
      label: "Nachricht senden",
      icon: MessageSquare,
      onClick: () => navigate("/inbox"),
    },
    {
      label: "Tagesabschluss starten",
      icon: FileCheck,
      onClick: () => navigate("/reconciliation"),
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Schnellaktionen
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {actions.map((action) => (
          <DropdownMenuItem 
            key={action.label}
            onClick={action.onClick}
            className="cursor-pointer"
          >
            <action.icon className="h-4 w-4 mr-2" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
