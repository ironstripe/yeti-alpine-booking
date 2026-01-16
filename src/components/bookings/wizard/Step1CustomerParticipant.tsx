import { useState } from "react";
import { Users, Lock, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

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
    setVegetarianForParticipant,
  } = useBookingWizard();
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  
  const isGroupBooking = state.productType === "group";
  const isEditMode = state.isEditMode;

  // If no customer selected (and not in edit mode), show full-width search
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
    <div className="space-y-4">
      {/* Edit mode info banner */}
      {isEditMode && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Im Bearbeitungsmodus können Teilnehmer hinzugefügt oder entfernt werden. 
            Der Kunde kann nicht geändert werden.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left Column - Payer (40%) */}
        <Card className="lg:col-span-2 bg-slate-50 dark:bg-slate-900/50">
          <CardContent className="p-4">
            {isEditMode && (
              <Badge variant="secondary" className="mb-2">
                <Lock className="h-3 w-3 mr-1" />
                Gesperrt
              </Badge>
            )}
            <CustomerPayerCard
              customer={state.customer}
              onCustomerChange={isEditMode ? undefined : setCustomer}
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
              vegetarianSelections={state.vegetarianSelections}
              onVegetarianChange={setVegetarianForParticipant}
              isEditMode={isEditMode}
              originalParticipantIds={state.originalParticipantIds}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
