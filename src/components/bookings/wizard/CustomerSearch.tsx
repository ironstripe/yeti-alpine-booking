import { useState, useEffect, useRef } from "react";
import { Search, User, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCustomers, type CustomerWithCount } from "@/hooks/useCustomers";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface CustomerSearchProps {
  selectedCustomer: Tables<"customers"> | null;
  onSelect: (customer: Tables<"customers">) => void;
  onClear: () => void;
  onCreateNew: () => void;
}

export function CustomerSearch({
  selectedCustomer,
  onSelect,
  onClear,
  onCreateNew,
}: CustomerSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data: customers, isLoading } = useCustomers(debouncedSearch);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (customer: CustomerWithCount) => {
    // Convert CustomerWithCount to Tables<"customers">
    const fullCustomer: Tables<"customers"> = {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      created_at: customer.created_at,
      city: null,
      country: null,
      kulanz_score: null,
      language: null,
      marketing_consent: null,
      notes: null,
      preferred_channel: null,
      street: null,
      zip: null,
      holiday_address: "",
      additional_phones: [],
      additional_emails: [],
    };
    onSelect(fullCustomer);
    setSearchQuery("");
    setIsOpen(false);
  };

  if (selectedCustomer) {
    return (
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">
                {selectedCustomer.first_name} {selectedCustomer.last_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedCustomer.email}
                {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Ändern
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Kunde suchen..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-10"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && searchQuery.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : customers && customers.length > 0 ? (
            <ul className="max-h-60 overflow-auto py-1">
              {customers.slice(0, 5).map((customer) => (
                <li key={customer.id}>
                  <button
                    onClick={() => handleSelect(customer)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate font-medium">
                        {customer.first_name} {customer.last_name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {customer.email}
                        {customer.participant_count > 0 && (
                          <> · {customer.participant_count} Teilnehmer</>
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Keine Kunden gefunden
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Oder:{" "}
        <button
          type="button"
          onClick={onCreateNew}
          className="font-medium text-primary hover:underline"
        >
          + Neuen Kunden erstellen
        </button>
      </p>
    </div>
  );
}
