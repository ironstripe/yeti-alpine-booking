import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RentalWithDetails, useCompleteReturn, useUpdateRentalStatus } from "@/hooks/useRentals";

interface ReturnItemState {
  id: string;
  item_id: string;
  name: string;
  return_condition: string;
  notes: string;
}

interface Props {
  rental: RentalWithDetails | null;
  onClose: () => void;
}

export function ReturnCheckDialog({ rental, onClose }: Props) {
  const completeMutation = useCompleteReturn();
  const updateStatus = useUpdateRentalStatus();
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);

  useEffect(() => {
    if (rental) {
      const pendingReturns = rental.items?.filter((i) => i.status === "Rückgabe initiiert") || [];
      setReturnItems(
        pendingReturns.map((ri) => ({
          id: ri.id,
          item_id: ri.item_id,
          name: ri.item?.name || "–",
          return_condition: "Ok",
          notes: "",
        }))
      );
    }
  }, [rental]);

  const handleComplete = () => {
    if (!rental) return;
    completeMutation.mutate(
      returnItems.map((ri) => ({
        id: ri.id,
        item_id: ri.item_id,
        return_condition: ri.return_condition,
        notes: ri.notes,
      })),
      {
        onSuccess: () => {
          // Check if all items are now returned
          const totalItems = rental.items?.length || 0;
          const alreadyReturned = rental.items?.filter((i) => i.status === "Zurückgegeben").length || 0;
          const justReturned = returnItems.length;
          const allReturned = alreadyReturned + justReturned >= totalItems;

          updateStatus.mutate({
            rentalId: rental.id,
            status: allReturned ? "Abgeschlossen" : "Teilweise zurückgegeben",
          });
          onClose();
        },
      }
    );
  };

  if (!rental) return null;

  return (
    <Dialog open={!!rental} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Rückgabe prüfen – {rental.instructor?.first_name} {rental.instructor?.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {returnItems.map((ri, idx) => (
            <div key={ri.id} className="border rounded-lg p-3 space-y-2">
              <p className="font-medium text-sm">{ri.name}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Zustand</label>
                  <Select
                    value={ri.return_condition}
                    onValueChange={(v) => {
                      const copy = [...returnItems];
                      copy[idx] = { ...copy[idx], return_condition: v };
                      setReturnItems(copy);
                    }}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ok">Ok</SelectItem>
                      <SelectItem value="Beschädigt">Beschädigt</SelectItem>
                      <SelectItem value="Verloren">Verloren</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notiz</label>
                  <Input
                    className="h-8"
                    value={ri.notes}
                    onChange={(e) => {
                      const copy = [...returnItems];
                      copy[idx] = { ...copy[idx], notes: e.target.value };
                      setReturnItems(copy);
                    }}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
          ))}

          {returnItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Keine Artikel zur Rückgabe bereit.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleComplete} disabled={returnItems.length === 0 || completeMutation.isPending}>
            Rückgabe abschliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
