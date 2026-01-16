import { useState } from "react";
import { Mail, Phone, Pencil, Search, MapPin, Globe, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerSearch } from "./CustomerSearch";
import { InlineCustomerForm } from "./InlineCustomerForm";
import { CustomerEditDialog } from "./CustomerEditDialog";
import { LANGUAGE_LABELS } from "@/lib/language-utils";
import type { Tables } from "@/integrations/supabase/types";

interface CustomerPayerCardProps {
  customer: Tables<"customers"> | null;
  onCustomerChange: (customer: Tables<"customers"> | null) => void;
}

export function CustomerPayerCard({
  customer,
  onCustomerChange,
}: CustomerPayerCardProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Show search when no customer selected
  if (!customer || isSearching) {
    return (
      <div className="h-full">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Auftraggeber</h3>
          {isSearching && customer && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsSearching(false)}
            >
              Abbrechen
            </Button>
          )}
        </div>
        {isCreating ? (
          <InlineCustomerForm
            onSuccess={(newCustomer) => {
              onCustomerChange(newCustomer);
              setIsCreating(false);
              setIsSearching(false);
            }}
            onCancel={() => setIsCreating(false)}
          />
        ) : (
          <CustomerSearch
            selectedCustomer={null}
            onSelect={(selected) => {
              onCustomerChange(selected);
              setIsSearching(false);
            }}
            onClear={() => {}}
            onCreateNew={() => setIsCreating(true)}
          />
        )}
      </div>
    );
  }

  // Show customer card with edit option
  return (
    <div className="h-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Auftraggeber</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3" />
            Bearbeiten
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setIsSearching(true)}
          >
            <Search className="h-3 w-3" />
            Wechseln
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-base font-medium">
          {customer.first_name} {customer.last_name}
        </p>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{customer.phone}</span>
            </div>
          )}
          {(customer.street || customer.city) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">
                {[
                  customer.street,
                  [customer.zip, customer.city].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>
          )}
          {customer.country && (
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{customer.country}</span>
            </div>
          )}
          {customer.language && (
            <div className="flex items-center gap-2">
              <span className="text-xs w-3.5 text-center">🌐</span>
              <span>{LANGUAGE_LABELS[customer.language] || customer.language}</span>
            </div>
          )}
          {customer.holiday_address && (
            <div className="flex items-center gap-2">
              <Home className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{customer.holiday_address}</span>
            </div>
          )}
        </div>
      </div>

      <CustomerEditDialog
        customer={customer}
        open={isEditing}
        onOpenChange={setIsEditing}
        onSaved={(updated) => onCustomerChange(updated)}
      />
    </div>
  );
}
