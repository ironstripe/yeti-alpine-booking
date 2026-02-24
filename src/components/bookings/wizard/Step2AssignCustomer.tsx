import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Step1CustomerParticipant } from "./Step1CustomerParticipant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";

export function Step2AssignCustomer() {
  const { state, getAllCartItems } = useBookingWizard();
  const cartItems = getAllCartItems();

  return (
    <div className="space-y-4">
      {/* Cart summary reminder when multiple items */}
      {cartItems.length > 1 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-sm font-medium">
              {cartItems.length} Produkte im Warenkorb
            </span>
            <div className="flex gap-1 ml-2">
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

      {/* Customer + Participant selection (reuses existing component) */}
      <Step1CustomerParticipant />
    </div>
  );
}
