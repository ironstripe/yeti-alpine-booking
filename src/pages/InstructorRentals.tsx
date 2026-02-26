import { useState } from "react";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserRole } from "@/hooks/useUserRole";
import { useInstructorRentals, useConfirmRental, useInitiateReturn, RentalWithDetails } from "@/hooks/useRentals";
import { Package, CheckCircle2, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

const itemStatusColors: Record<string, string> = {
  "Ausgeliehen": "bg-blue-100 text-blue-800",
  "Rückgabe initiiert": "bg-orange-100 text-orange-800",
  "Zurückgegeben": "bg-green-100 text-green-800",
  "Verloren gemeldet": "bg-red-100 text-red-800",
};

export default function InstructorRentals() {
  const { instructorId } = useUserRole();
  const { data: rentals, isLoading } = useInstructorRentals(instructorId);
  const confirmMutation = useConfirmRental();
  const returnMutation = useInitiateReturn();
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});

  const toggleItem = (rentalId: string, itemId: string) => {
    setSelectedItems((prev) => {
      const current = prev[rentalId] || [];
      return {
        ...prev,
        [rentalId]: current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
      };
    });
  };

  const handleReturn = (rentalId: string) => {
    const itemIds = selectedItems[rentalId] || [];
    if (itemIds.length === 0) return;
    returnMutation.mutate(itemIds, {
      onSuccess: () => setSelectedItems((prev) => ({ ...prev, [rentalId]: [] })),
    });
  };

  const pendingRentals = rentals?.filter((r) => r.status === "Wartet auf Quittierung") || [];
  const activeRentals = rentals?.filter((r) => r.status === "Ausgeliehen" || r.status === "Teilweise zurückgegeben") || [];
  const completedRentals = rentals?.filter((r) => r.status === "Abgeschlossen") || [];

  return (
    <InstructorLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Mein Material</h2>
        </div>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {/* Pending confirmation */}
        {pendingRentals.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Ausstehende Bestätigungen</h3>
            {pendingRentals.map((rental) => (
              <Card key={rental.id} className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Neue Ausleihe</span>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">Quittierung ausstehend</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Ab {format(new Date(rental.rental_period_start), "dd.MM.yyyy", { locale: de })}
                    {rental.rental_period_end && ` bis ${format(new Date(rental.rental_period_end), "dd.MM.yyyy", { locale: de })}`}
                  </p>
                  <div className="space-y-1">
                    {rental.items?.map((ri) => (
                      <div key={ri.id} className="flex items-center gap-2 text-sm bg-background rounded px-3 py-2">
                        <span className="font-medium">{ri.item?.name}</span>
                        {ri.item?.size && <Badge variant="outline" className="text-xs">{ri.item.size}</Badge>}
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => confirmMutation.mutate(rental.id)}
                    disabled={confirmMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Empfang bestätigen & Quittieren
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Active rentals */}
        {activeRentals.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Aktuell ausgeliehen</h3>
            {activeRentals.map((rental) => {
              const returnableItems = rental.items?.filter((i) => i.status === "Ausgeliehen") || [];
              const selected = selectedItems[rental.id] || [];
              return (
                <Card key={rental.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Ausleihe vom {format(new Date(rental.rental_period_start), "dd.MM.yyyy", { locale: de })}</span>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">{rental.status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      {rental.items?.map((ri) => {
                        const isReturnable = ri.status === "Ausgeliehen";
                        const isChecked = selected.includes(ri.id);
                        return (
                          <div key={ri.id} className="flex items-center gap-3 text-sm bg-muted/50 rounded px-3 py-2">
                            {isReturnable && (
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleItem(rental.id, ri.id)}
                              />
                            )}
                            <span className="font-medium flex-1">{ri.item?.name}</span>
                            {ri.item?.size && <Badge variant="outline" className="text-xs">{ri.item.size}</Badge>}
                            <Badge variant="secondary" className={itemStatusColors[ri.status] || ""}>
                              {ri.status}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                    {returnableItems.length > 0 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleReturn(rental.id)}
                        disabled={selected.length === 0 || returnMutation.isPending}
                      >
                        <Undo2 className="h-4 w-4 mr-2" /> Rückgabe initiieren ({selected.length})
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Completed */}
        {completedRentals.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Abgeschlossen</h3>
            {completedRentals.map((rental) => (
              <Card key={rental.id} className="opacity-60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>{format(new Date(rental.rental_period_start), "dd.MM.yyyy", { locale: de })} – {rental.items?.length} Artikel</span>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">Abgeschlossen</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && rentals?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Keine Materialausleihen vorhanden.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </InstructorLayout>
  );
}
