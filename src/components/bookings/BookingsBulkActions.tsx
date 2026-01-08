import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Printer, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface BookingsBulkActionsProps {
  count: number;
  selectedIds: Set<string>;
}

export function BookingsBulkActions({ count, selectedIds }: BookingsBulkActionsProps) {
  const handlePrint = () => {
    toast.info(`${count} Tickets werden gedruckt...`);
    window.print();
  };

  const handleStatusChange = (status: string) => {
    toast.info(`Status für ${count} Buchungen wird auf "${status}" geändert...`);
    // TODO: Implement bulk status update
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-4">
        <span className="text-sm font-medium">
          {count} Buchung{count !== 1 ? "en" : ""} ausgewählt
        </span>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Tickets drucken
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Status ändern
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleStatusChange("confirmed")}>
                Bestätigt
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("cancelled")}>
                Storniert
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
