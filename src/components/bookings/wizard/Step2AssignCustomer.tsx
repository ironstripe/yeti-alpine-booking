import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShoppingCart, Users, UserCheck, AlertTriangle } from "lucide-react";
import { CustomerPayerCard } from "./CustomerPayerCard";
import { useParticipantOwnership } from "@/hooks/useParticipantOwnership";

export function Step2AssignCustomer() {
  const { state, setCustomer, getAllCartItems, setCartItemParticipants, setCurrentStep } = useBookingWizard();
  const cartItems = getAllCartItems();
  const activeItem = state.cartItems.find((item) => item.id === state.activeCartItemId);
  const linkedIds = activeItem?.assignedParticipantIds ?? [];
  // New people stay local until the booking is saved; the server creates them in the SAME
  // transaction as the booking (no early writes, no duplicates on retry).
  const newPeople = linkedIds.filter((id) => id.startsWith("local-") || id.startsWith("guest-")).length;
  const { foreign } = useParticipantOwnership(linkedIds, state.customerId);

  const isExistingCustomerPrefill = !!state.customer && !!state.conversationId;

  const removeForeign = () => {
    if (!activeItem) return;
    const foreignIds = new Set(foreign.map((f) => f.id));
    setCartItemParticipants(activeItem.id, linkedIds.filter((id) => !foreignIds.has(id)));
    setCurrentStep(1);
  };

  return (
    <div className="space-y-4">
      {isExistingCustomerPrefill && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-start gap-2">
            <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 break-words text-sm text-primary">
              Bestandskunde erkannt. Kundendaten wurden automatisch übernommen.
            </span>
          </CardContent>
        </Card>
      )}

      {newPeople > 0 && (
        <Card className="bg-muted/40">
          <CardContent className="p-3 flex items-start gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words text-sm">
              {newPeople} neue{newPeople === 1 ? "r" : ""} Teilnehmer {newPeople === 1 ? "wird" : "werden"} beim Speichern der Buchung dem gewählten Kunden zugeordnet.
            </span>
          </CardContent>
        </Card>
      )}

      {foreign.length > 0 && (
        <Alert variant="destructive" data-testid="foreign-participants">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-medium">Teilnehmer gehören zu einem anderen Kunden</p>
            <ul className="list-disc pl-5 text-sm">
              {foreign.map((f) => <li key={f.id}>{f.name}{f.ownerName ? ` (Kunde ${f.ownerName})` : ""}</li>)}
            </ul>
            <p className="text-sm">
              Bestehende Teilnehmer werden nicht automatisch auf einen anderen Kunden übertragen. Entweder den ursprünglichen Kunden als Zahler wählen, oder diese Teilnehmer aus der Buchung entfernen und in Schritt 1 die Teilnehmer des neuen Kunden bzw. neue Teilnehmer zuweisen.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={removeForeign}>Entfernen und Teilnehmer neu zuweisen</Button>
          </AlertDescription>
        </Alert>
      )}

      {cartItems.length > 1 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <ShoppingCart className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">
              {cartItems.length} Produkte im Warenkorb
            </span>
            <div className="flex flex-wrap gap-1 sm:ml-2">
              {cartItems.map((item, idx) => (
                <Badge key={item.id} variant="secondary" className="text-xs">
                  {item.productType === "private"
                    ? "Privat"
                    : item.productType === "group"
                      ? "Gruppe"
                      : `#${idx + 1}`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer (payer) selection only — participants are assigned in Step 1 */}
      <Card>
        <CardContent className="p-4">
          <CustomerPayerCard
            customer={state.customer}
            onCustomerChange={setCustomer}
          />
        </CardContent>
      </Card>
    </div>
  );
}
