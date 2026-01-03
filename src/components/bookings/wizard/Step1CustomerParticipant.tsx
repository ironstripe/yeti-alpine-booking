import { useState } from "react";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { CustomerPayerCard } from "./CustomerPayerCard";
import { ParticipantListCard } from "./ParticipantListCard";
import { CustomerSearch } from "./CustomerSearch";
import { InlineCustomerForm } from "./InlineCustomerForm";
import { useBookingWizard } from "@/contexts/BookingWizardContext";

export function Step1CustomerParticipant() {
  const { 
    state, 
    setCustomer, 
    toggleParticipant, 
    addGuestParticipant,
    setLunchDaysForParticipant,
  } = useBookingWizard();
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  
  const isGroupBooking = state.productType === "group";

  // If no customer selected, show full-width search
  if (!state.customer) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Kunde auswählen</h3>
            {isCreatingCustomer ? (
              <InlineCustomerForm
                onSuccess={(customer) => {
                  setCustomer(customer);
                  setIsCreatingCustomer(false);
                }}
                onCancel={() => setIsCreatingCustomer(false)}
              />
            ) : (
              <CustomerSearch
                selectedCustomer={null}
                onSelect={setCustomer}
                onClear={() => {}}
                onCreateNew={() => setIsCreatingCustomer(true)}
              />
            )}
          </CardContent>
        </Card>

        {/* Prompt */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Bitte wähle zuerst einen Kunden aus
            </p>
            <p className="text-xs text-muted-foreground">
              Danach kannst du die Teilnehmer für diese Buchung auswählen
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Two-column high-density layout
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left Column - Payer (40%) */}
      <Card className="lg:col-span-2 bg-slate-50 dark:bg-slate-900/50">
        <CardContent className="p-4">
          <CustomerPayerCard
            customer={state.customer}
            onCustomerChange={setCustomer}
          />
        </CardContent>
      </Card>

      {/* Right Column - Participants (60%) */}
      <Card className="lg:col-span-3">
        <CardContent className="p-4">
          <ParticipantListCard
            customerId={state.customer.id}
            selectedParticipants={state.selectedParticipants}
            onToggle={toggleParticipant}
            onAddParticipant={() => {}}
            isGroupBooking={isGroupBooking}
            selectedDates={state.selectedDates}
            lunchSelections={state.lunchSelections}
            onLunchDaysChange={setLunchDaysForParticipant}
          />
        </CardContent>
      </Card>
    </div>
  );
}
