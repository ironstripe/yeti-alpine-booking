import { useState, useEffect, useRef } from "react";
import { Search, User, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  useCustomerSearch,
  customerDisplayName,
  MIN_SEARCH_LENGTH,
  type CustomerSearchHit,
} from "@/hooks/useCustomerSearch";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

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
  const [isSelecting, setIsSelecting] = useState(false);
  const { data: customers = [], isLoading } = useCustomerSearch(searchQuery, 8);
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

  const handleSelect = async (hit: CustomerSearchHit) => {
    setIsSelecting(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", hit.id)
      .maybeSingle();
    setIsSelecting(false);

    if (error || !data) {
      toast.error("Kunde konnte nicht geladen werden");
      return;
    }

    onSelect(data);
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
                {selectedCustomer.customer_number && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {selectedCustomer.customer_number}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedCustomer.email}
                {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
          >
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
          placeholder="Name, Kundennummer, E-Mail, Telefon oder Teilnehmer..."
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
            type="button"
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
          {searchQuery.trim().length < MIN_SEARCH_LENGTH ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Mind. {MIN_SEARCH_LENGTH} Zeichen eingeben
            </div>
          ) : isLoading || isSelecting ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : customers.length > 0 ? (
            <ul className="max-h-60 overflow-auto py-1">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(customer)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate font-medium">
                        {customerDisplayName(customer)}
                        {customer.customer_number && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {customer.customer_number}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {customer.email}
                        {customer.match_reason && customer.match_reason !== "Namenstreffer" && (
                          <> · {customer.match_reason}</>
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
