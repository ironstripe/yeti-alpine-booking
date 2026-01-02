import { useState } from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { CustomerSearch } from "./CustomerSearch";
import { InlineCustomerForm } from "./InlineCustomerForm";
import { ParticipantSelection } from "./ParticipantSelection";
import { useBookingWizard } from "@/contexts/BookingWizardContext";

export function Step1CustomerParticipant() {
  const { state, setCustomer, toggleParticipant, addGuestParticipant } = useBookingWizard();
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  return (
    <div className="space-y-6">
      {/* Customer Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kunde</CardTitle>
        </CardHeader>
        <CardContent>
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
              selectedCustomer={state.customer}
              onSelect={setCustomer}
              onClear={() => setCustomer(null)}
              onCreateNew={() => setIsCreatingCustomer(true)}
            />
          )}
        </CardContent>
      </Card>

      {/* Participants Section - only show when customer is selected */}
      {state.customer && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Teilnehmer</CardTitle>
              {state.selectedParticipants.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{state.selectedParticipants.length} ausgewählt</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Wer nimmt am Kurs teil?
            </p>
          </CardHeader>
          <CardContent>
            <ParticipantSelection
              customerId={state.customer.id}
              selectedParticipants={state.selectedParticipants}
              onToggle={toggleParticipant}
              onAddParticipant={() => {
                // Participant was added to DB and will be toggled separately
              }}
              onAddGuest={addGuestParticipant}
            />
          </CardContent>
        </Card>
      )}

      {/* Prompt to select customer first */}
      {!state.customer && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 font-medium text-muted-foreground">
              Bitte wähle zuerst einen Kunden aus
            </p>
            <p className="text-sm text-muted-foreground">
              Danach kannst du die Teilnehmer für diese Buchung auswählen
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
