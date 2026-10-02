import { useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { NewCustomerModal } from "@/components/customers/NewCustomerModal";

const Customers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInput = searchParams.get("q") ?? "";
  const setSearchInput = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("q", value);
      else next.delete("q");
      return next;
    }, { replace: true });
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 300);
  const { data: customers, isLoading, error } = useCustomers(debouncedSearch);
  const returnTo = `/customers${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

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
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
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
          <CustomerTable customers={customers} returnTo={returnTo} />
          <CustomerCards customers={customers} returnTo={returnTo} />
        </>
      ) : (
        <CustomerEmptyState
          searchQuery={debouncedSearch}
          onClearSearch={() => setSearchInput("")}
          onCreateCustomer={() => setIsModalOpen(true)}
        />
      )}

      <NewCustomerModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
};

export default Customers;
