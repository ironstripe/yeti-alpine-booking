import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/useDebounce";
import { useCustomers } from "@/hooks/useCustomers";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { CustomerCards } from "@/components/customers/CustomerCards";
import { CustomerEmptyState } from "@/components/customers/CustomerEmptyState";
import {
  CustomerTableSkeleton,
  CustomerCardSkeleton,
} from "@/components/customers/CustomerTableSkeleton";

const Customers = () => {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const { data: customers, isLoading, error } = useCustomers(debouncedSearch);

  const handleCreateCustomer = () => {
    toast.info("Funktion kommt bald");
  };

  if (error) {
    return (
      <>
        <PageHeader
          title="Kunden"
          description="Verwalte alle Kunden und ihre Familien"
        />
        <div className="text-destructive">
          Fehler beim Laden der Kunden: {error.message}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Kunden"
        description="Verwalte alle Kunden und ihre Familien"
        actions={
          <Button size="sm" onClick={handleCreateCustomer}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Kunde
          </Button>
        }
      />

      <div className="mb-6">
        <CustomerSearchInput value={searchInput} onChange={setSearchInput} />
      </div>

      {isLoading ? (
        <>
          <CustomerTableSkeleton />
          <CustomerCardSkeleton />
        </>
      ) : customers && customers.length > 0 ? (
        <>
          <CustomerTable customers={customers} />
          <CustomerCards customers={customers} />
        </>
      ) : (
        <CustomerEmptyState
          searchQuery={debouncedSearch}
          onClearSearch={() => setSearchInput("")}
          onCreateCustomer={handleCreateCustomer}
        />
      )}
    </>
  );
};

export default Customers;
