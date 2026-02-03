import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useSchedulerCustomerSearch, type SchedulerCustomer } from "@/hooks/useSchedulerCustomerSearch";
import { toast } from "sonner";

interface SchedulerSearchDialogProps {
  instructorOptions: { id: string; name: string }[];
  onInstructorSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SchedulerSearchDialog({
  instructorOptions,
  onInstructorSelect,
  open,
  onOpenChange,
}: SchedulerSearchDialogProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: customers = [], isLoading: customersLoading } = useSchedulerCustomerSearch(searchQuery);

  // Filter instructors by search query
  const filteredInstructors = instructorOptions.filter((instructor) =>
    instructor.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  const handleInstructorSelect = (instructor: { id: string; name: string }) => {
    onOpenChange(false);
    onInstructorSelect(instructor.id);
  };

  const handleCustomerSelect = (customer: SchedulerCustomer) => {
    onOpenChange(false);
    toast.info(`${customer.first_name || ""} ${customer.last_name} ausgewählt`);
    navigate(`/bookings/new?customerId=${customer.id}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Lehrer, Kunde oder Buchung suchen..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searchQuery.length < 2
            ? "Mind. 2 Zeichen eingeben"
            : customersLoading
              ? "Suche..."
              : "Keine Ergebnisse gefunden"
          }
        </CommandEmpty>
        
        {filteredInstructors.length > 0 && (
          <CommandGroup heading="Lehrer">
            {filteredInstructors.slice(0, 5).map((instructor) => (
              <CommandItem
                key={instructor.id}
                value={`instructor-${instructor.id}`}
                onSelect={() => handleInstructorSelect(instructor)}
              >
                <span>🎿</span>
                <span className="ml-2">{instructor.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        
        {customers.length > 0 && (
          <CommandGroup heading="Kunden">
            {customers.slice(0, 5).map((customer) => (
              <CommandItem
                key={customer.id}
                value={`customer-${customer.id}`}
                onSelect={() => handleCustomerSelect(customer)}
              >
                <div className="flex flex-col">
                  <span>{customer.first_name} {customer.last_name}</span>
                  <span className="text-xs text-muted-foreground">{customer.email}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

interface SchedulerSearchTriggerProps {
  onClick: () => void;
}

export function SchedulerSearchTrigger({ onClick }: SchedulerSearchTriggerProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 w-8 p-0 md:w-[130px] md:px-3 md:justify-start"
      onClick={onClick}
    >
      <Search className="h-4 w-4 md:mr-2" />
      <span className="hidden md:inline text-xs text-muted-foreground">Suchen...</span>
    </Button>
  );
}
