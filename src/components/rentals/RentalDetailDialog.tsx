import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RentalWithDetails } from "@/hooks/useRentals";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const itemStatusColors: Record<string, string> = {
  "Ausgeliehen": "bg-blue-100 text-blue-800",
  "Rückgabe initiiert": "bg-orange-100 text-orange-800",
  "Zurückgegeben": "bg-green-100 text-green-800",
  "Verloren gemeldet": "bg-red-100 text-red-800",
};

interface Props {
  rental: RentalWithDetails | null;
  onClose: () => void;
}

export function RentalDetailDialog({ rental, onClose }: Props) {
  if (!rental) return null;

  return (
    <Dialog open={!!rental} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Ausleihe – {rental.instructor?.first_name} {rental.instructor?.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Zeitraum:</span>
              <p className="font-medium">
                {format(new Date(rental.rental_period_start), "dd.MM.yyyy", { locale: de })}
                {rental.rental_period_end && ` – ${format(new Date(rental.rental_period_end), "dd.MM.yyyy", { locale: de })}`}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <p><Badge variant="secondary">{rental.status}</Badge></p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikel</TableHead>
                <TableHead>Grösse</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rückgabe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rental.items?.map((ri) => (
                <TableRow key={ri.id}>
                  <TableCell className="font-medium">{ri.item?.name || "–"}</TableCell>
                  <TableCell>{ri.item?.size || "–"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={itemStatusColors[ri.status] || ""}>
                      {ri.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ri.returned_at ? format(new Date(ri.returned_at), "dd.MM.yyyy", { locale: de }) : "–"}
                    {ri.return_condition && <span className="ml-1 text-xs text-muted-foreground">({ri.return_condition})</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
