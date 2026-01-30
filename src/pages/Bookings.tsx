/**
 * BUTTON PLACEMENT RULE:
 * 
 * The global Command Bar (Cmd+K) contains a persistent "Neue Buchung" button.
 * Page-level header buttons should ONLY be used for page-specific actions
 * that are DIFFERENT from "Neue Buchung".
 * 
 * Examples:
 * - Bookings page: NO page button (use global "Neue Buchung")
 * - Dashboard: NO page button (use global "Neue Buchung")
 * - Customers page: "Neuer Kunde" button (different action)
 * - Instructors page: "Neuer Skilehrer" button (different action)
 * - Trainings page: "Neues Training" button (different action)
 */
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout";
import { useDebounce } from "@/hooks/useDebounce";
import { useTickets, defaultFilters, TicketFilters, TicketWithDetails } from "@/hooks/useTickets";
import { BookingsFilters } from "@/components/bookings/BookingsFilters";
import { BookingsTable } from "@/components/bookings/BookingsTable";
import { BookingsTableSkeleton } from "@/components/bookings/BookingsTableSkeleton";
import { BookingsEmptyState } from "@/components/bookings/BookingsEmptyState";
import { BookingsBulkActions } from "@/components/bookings/BookingsBulkActions";
import { PaymentModal } from "@/components/bookings/PaymentModal";

const DEFAULT_COLUMNS = ["ticket", "customer", "course", "dateTime", "instructor", "total", "status"];

const Bookings = () => {
  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<TicketFilters>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [paymentModalTicket, setPaymentModalTicket] = useState<TicketWithDetails | null>(null);

  // Debounced search
  const debouncedSearch = useDebounce(searchInput, 300);

  // Fetch tickets with filters
  const { data: tickets, isLoading } = useTickets({
    ...filters,
    search: debouncedSearch,
  });

  const hasActiveFilters = useMemo(() => {
    return (
      filters.status.length > 0 ||
      filters.productType.length > 0 ||
      filters.paymentStatus.length > 0 ||
      filters.paymentMethod.length > 0 ||
      filters.dateFrom !== undefined ||
      filters.dateTo !== undefined ||
      debouncedSearch.length > 0
    );
  }, [filters, debouncedSearch]);

  const clearFilters = () => {
    setSearchInput("");
    setFilters(defaultFilters);
  };

  return (
    <>
      <PageHeader
        title="Buchungen"
        description="Verwalte alle Buchungen und Tickets"
      />

      <BookingsFilters
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        filters={filters}
        onFiltersChange={setFilters}
        visibleColumns={visibleColumns}
        onColumnsChange={setVisibleColumns}
      />

      {isLoading ? (
        <BookingsTableSkeleton />
      ) : tickets && tickets.length > 0 ? (
        <BookingsTable
          tickets={tickets}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          visibleColumns={visibleColumns}
          onRecordPayment={setPaymentModalTicket}
        />
      ) : (
        <BookingsEmptyState
          hasFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />
      )}

      {selectedIds.size > 0 && (
        <BookingsBulkActions
          count={selectedIds.size}
          selectedIds={selectedIds}
        />
      )}

      <PaymentModal
        ticket={paymentModalTicket}
        onClose={() => setPaymentModalTicket(null)}
      />
    </>
  );
};

export default Bookings;
