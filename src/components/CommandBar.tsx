import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  User,
  Calendar,
  Plus,
  FileText,
  UserPlus,
  GraduationCap,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/useDebounce";
import {
  searchCustomers,
  searchBookings,
  searchInstructors,
  searchParticipants,
} from "@/lib/search";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 200);
  const navigate = useNavigate();

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} commandProps={{ shouldFilter: false }}>
      <CommandInput
        placeholder="Suchen nach Kunden, Buchungen, Lehrern, Teilnehmern..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>

        {/* Quick Actions - Always visible when no query */}
        {!query && (
          <CommandGroup heading="Schnellaktionen">
            <CommandItem onSelect={() => handleSelect("/bookings/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Neue Buchung erstellen
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/customers?new=true")}>
              <UserPlus className="mr-2 h-4 w-4" />
              Neuen Kunden anlegen
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/lists")}>
              <FileText className="mr-2 h-4 w-4" />
              Listen & Dokumente
            </CommandItem>
          </CommandGroup>
        )}

        {/* Search Results */}
        {debouncedQuery.length >= 2 && (
          <>
            <CustomerResults query={debouncedQuery} onSelect={handleSelect} />
            <ParticipantResults query={debouncedQuery} onSelect={handleSelect} />
            <BookingResults query={debouncedQuery} onSelect={handleSelect} />
            <InstructorResults query={debouncedQuery} onSelect={handleSelect} />
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function CustomerResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (path: string) => void;
}) {
  const { data: customers, isLoading } = useQuery({
    queryKey: ["command-customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.length >= 2,
  });

  if (isLoading || !customers?.length) return null;

  return (
    <CommandGroup heading="Kunden">
      {customers.map((customer) => (
        <CommandItem
          key={customer.id}
          onSelect={() => onSelect(`/customers/${customer.id}`)}
          className="flex items-center gap-3"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">
              {customer.first_name} {customer.last_name}
            </span>
            <span className="text-xs text-muted-foreground">
              {customer.phone || customer.email}
            </span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function BookingResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (path: string) => void;
}) {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["command-booking-search", query],
    queryFn: () => searchBookings(query),
    enabled: query.length >= 2,
  });

  if (isLoading || !bookings?.length) return null;

  return (
    <CommandGroup heading="Buchungen">
      {bookings.map((booking) => (
        <CommandItem
          key={booking.id}
          onSelect={() => onSelect(`/bookings/${booking.id}`)}
          className="flex items-center gap-3"
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">{booking.ticket_number}</span>
            <span className="text-xs text-muted-foreground">
              {booking.customer_name}
              {booking.start_date &&
                ` · ${format(new Date(booking.start_date), "dd.MM.yyyy", { locale: de })}`}
            </span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function InstructorResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (path: string) => void;
}) {
  const { data: instructors, isLoading } = useQuery({
    queryKey: ["command-instructor-search", query],
    queryFn: () => searchInstructors(query),
    enabled: query.length >= 2,
  });

  if (isLoading || !instructors?.length) return null;

  return (
    <CommandGroup heading="Skilehrer">
      {instructors.map((instructor) => (
        <CommandItem
          key={instructor.id}
          onSelect={() => onSelect(`/instructors/${instructor.id}`)}
          className="flex items-center gap-3"
        >
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">
              {instructor.first_name} {instructor.last_name}
            </span>
            <span className="text-xs text-muted-foreground">
              {instructor.phone || instructor.email}
            </span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function ParticipantResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (path: string) => void;
}) {
  const { data: participants, isLoading } = useQuery({
    queryKey: ["command-participant-search", query],
    queryFn: () => searchParticipants(query),
    enabled: query.length >= 2,
  });

  if (isLoading || !participants?.length) return null;

  return (
    <CommandGroup heading="Teilnehmer">
      {participants.map((participant) => (
        <CommandItem
          key={participant.id}
          onSelect={() => onSelect(`/customers/${participant.customer_id}`)}
          className="flex items-center gap-3"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">
              {participant.first_name} {participant.last_name}
            </span>
            <span className="text-xs text-muted-foreground">
              Teilnehmer bei {participant.customer_name}
            </span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
