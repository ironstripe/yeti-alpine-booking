import { useState } from "react";
import { Mail, Phone, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerSearch } from "./CustomerSearch";
import { InlineCustomerForm } from "./InlineCustomerForm";
import { CustomerEditDialog } from "./CustomerEditDialog";
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
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              <span>{customer.phone}</span>
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
