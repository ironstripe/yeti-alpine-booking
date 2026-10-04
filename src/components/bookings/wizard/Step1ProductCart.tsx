import { useState } from "react";
import { ShoppingCart, Plus, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { CustomerSearch } from "./CustomerSearch";
import { Step2ProductAllocation } from "./Step2ProductAllocation";

export function Step1ProductCart() {
  const { state, setCustomer, addCartItem, removeCartItem, setActiveCartItem, getAllCartItems } = useBookingWizard();
  const [showShortcut, setShowShortcut] = useState(false);

  const cartItems = getAllCartItems();
  const activeItem = cartItems.find(i => i.id === state.activeCartItemId);
  const hasValidItem = activeItem?.productType && activeItem.selectedDates.length > 0;

  return (
    <div className="space-y-4">
      {/* Existing customer shortcut */}
      <div>
        <Button
          variant="outline"
          size="sm"
          className="control-target h-auto w-full justify-between whitespace-normal py-2 text-left"
          aria-expanded={showShortcut}
          onClick={() => setShowShortcut(!showShortcut)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="min-w-0 break-words">Bestehenden Kunden auswählen</span>
          </div>
          {showShortcut ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <p className="mt-1 px-1 text-sm text-muted-foreground">Bereits erfasste Teilnehmer übernehmen.</p>
        {showShortcut && (
          <div className="mt-2">
            {state.customer ? (
              <Card className="bg-muted/50">
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <span className="min-w-0 break-words text-sm font-medium">
                    {state.customer.first_name} {state.customer.last_name}
                  </span>
                  <Button variant="ghost" size="sm" className="icon-action shrink-0 p-0" aria-label="Vorab gewählten Kunden entfernen" onClick={() => setCustomer(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <CustomerSearch
                selectedCustomer={null}
                onSelect={setCustomer}
                onClear={() => {}}
              />
            )}
            <p className="mt-2 px-1 text-sm text-muted-foreground">
              Neue zahlungspflichtige Kunden erfasst du im nächsten Schritt.
            </p>
          </div>
        )}
      </div>

      {/* Product Configuration (reuses existing component) */}
      <Step2ProductAllocation key={state.activeCartItemId ?? "empty-cart"} />

      {/* Cart Summary Bar - only shown when multiple items */}
      {cartItems.length > 1 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Warenkorb ({cartItems.length})
              </span>
            </div>
            <div className="space-y-1">
              {cartItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 text-sm p-1.5 rounded cursor-pointer transition-colors ${
                    item.id === state.activeCartItemId
                      ? "bg-primary/10 font-medium"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setActiveCartItem(item.id)}
                >
                  <div className="min-w-0 break-words">
                    <span>
                      {idx + 1}.{" "}
                      {item.productType === "private"
                        ? "Privatstunde"
                        : item.productType === "group"
                          ? "Gruppenkurs"
                          : "Neues Produkt"}
                      {item.selectedDates.length > 0 &&
                        ` · ${item.selectedDates.length} Tag${item.selectedDates.length !== 1 ? "e" : ""}`}
                    </span>
                    {item.assignedParticipantIds.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({item.assignedParticipantIds.map((pid) => {
                          const local = state.localParticipants?.find((lp) => lp.id === pid);
                          if (local) return local.first_name;
                          const db = state.selectedParticipants?.find((sp) => sp.id === pid);
                          if (db) return db.first_name;
                          return "?";
                        }).join(", ")})
                      </span>
                    )}
                  </div>
                  {item.id !== state.activeCartItemId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="icon-action shrink-0 p-0"
                      aria-label={`Produkt ${idx + 1} aus dem Warenkorb entfernen`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCartItem(item.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add another product */}
      {hasValidItem && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={addCartItem}>
            <Plus className="mr-2 h-4 w-4" />
            Weiteres Produkt hinzufügen
          </Button>
        </div>
      )}
    </div>
  );
}
