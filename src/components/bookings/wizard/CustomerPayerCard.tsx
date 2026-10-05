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

  const openCustomerSearch = () => {
    setIsCreating(false);
    setIsSearching(true);
  };

  const cancelCustomerSearch = () => {
    setIsCreating(false);
    setIsSearching(false);
  };

  // Show search when no customer selected
  if (!customer || isSearching) {
    return (
      <div className="h-full">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-foreground">Zahlungspflichtiger Kunde</h3>
            <p className="text-sm text-muted-foreground">Wer bezahlt die Buchung?</p>
            <p className="text-sm text-muted-foreground">Diese Person kann selbst teilnehmen oder für andere buchen.</p>
          </div>
          {isSearching && customer && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="control-target text-xs"
              onClick={cancelCustomerSearch}
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
            autoFocus
            onSelect={(selected) => {
              onCustomerChange(selected);
              setIsCreating(false);
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-foreground">Zahlungspflichtiger Kunde</h3>
          <p className="text-sm text-muted-foreground">Wer bezahlt die Buchung?</p>
          <p className="text-sm text-muted-foreground">Diese Person kann selbst teilnehmen oder für andere buchen.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="control-target gap-1 px-2 text-xs"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3" />
            Bearbeiten
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="control-target gap-1 px-2 text-xs"
            onClick={openCustomerSearch}
          >
            <Search className="h-3 w-3" />
            Kunde wechseln
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="break-words text-base font-medium">
          {customer.first_name} {customer.last_name}
        </p>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <div className="flex min-w-0 items-start gap-2">
            <Mail className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex min-w-0 items-start gap-2">
              <Phone className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{customer.phone}</span>
            </div>
          )}
          {(customer.street || customer.city) && (
            <div className="flex min-w-0 items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
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
            <div className="flex min-w-0 items-start gap-2">
              <Globe className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{customer.country}</span>
            </div>
          )}
          {customer.language && (
            <div className="flex min-w-0 items-start gap-2">
              <span className="text-xs w-3.5 text-center">🌐</span>
              <span>{LANGUAGE_LABELS[customer.language] || customer.language}</span>
            </div>
          )}
          {customer.holiday_address && (
            <div className="flex min-w-0 items-start gap-2">
              <Home className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{customer.holiday_address}</span>
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
