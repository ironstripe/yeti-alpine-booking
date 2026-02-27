import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Users, UserCheck, Info } from "lucide-react";
import { CustomerPayerCard } from "./CustomerPayerCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function Step2AssignCustomer() {
  const { state, setCustomer, getAllCartItems, replaceLocalParticipantIds } = useBookingWizard();
  const cartItems = getAllCartItems();
  const hasPersisted = useRef(false);

  // Persist local participants to DB when customer is selected
  const persistMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const locals = state.localParticipants;
      if (locals.length === 0) return {};

      const idMap: Record<string, string> = {};

      for (const lp of locals) {
        const { data, error } = await supabase
          .from("customer_participants")
          .insert({
            customer_id: customerId,
            first_name: lp.first_name,
            last_name: lp.last_name || null,
            birth_date: lp.birth_date || "2015-01-01",
            level_current_season: lp.skill_level || null,
            sport: lp.sport,
          })
          .select()
          .single();

        if (error) throw error;
        idMap[lp.id] = data.id;
      }

      return idMap;
    },
    onSuccess: (idMap) => {
      if (Object.keys(idMap).length > 0) {
        replaceLocalParticipantIds(idMap);
        toast.success(`${Object.keys(idMap).length} Teilnehmer dem Kunden zugeordnet`);
      }
    },
    onError: (err) => {
      console.error("Failed to persist local participants:", err);
      toast.error("Fehler beim Speichern der Teilnehmer");
    },
  });

  // Auto-persist when customer is set and there are local participants
  useEffect(() => {
    if (
      state.customer &&
      state.localParticipants.length > 0 &&
      !hasPersisted.current &&
      !persistMutation.isPending
    ) {
      hasPersisted.current = true;
      persistMutation.mutate(state.customer.id);
    }
    // Reset flag if customer changes
    if (!state.customer) {
      hasPersisted.current = false;
    }
  }, [state.customer, state.localParticipants.length]);

  const isExistingCustomerPrefill = !!state.customer && !!state.conversationId;

  return (
    <div className="space-y-4">
      {/* Existing customer info banner */}
      {isExistingCustomerPrefill && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <span className="text-sm text-primary">
              Bestandskunde erkannt. Kundendaten wurden automatisch übernommen.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Local participants info */}
      {state.localParticipants.length > 0 && !state.customer && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-600" />
            <span className="text-sm">
              {state.localParticipants.length} Teilnehmer werden dem Kunden zugeordnet, sobald einer ausgewählt wird.
            </span>
          </CardContent>
        </Card>
      )}

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
