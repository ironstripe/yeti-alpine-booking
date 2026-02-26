import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRentals, RentalWithDetails } from "@/hooks/useRentals";
import { NewRentalDialog } from "@/components/rentals/NewRentalDialog";
import { RentalDetailDialog } from "@/components/rentals/RentalDetailDialog";
import { ReturnCheckDialog } from "@/components/rentals/ReturnCheckDialog";
import { Plus, Eye, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const statusColors: Record<string, string> = {
  "Wartet auf Quittierung": "bg-amber-100 text-amber-800",
  "Ausgeliehen": "bg-blue-100 text-blue-800",
  "Teilweise zurückgegeben": "bg-purple-100 text-purple-800",
  "Abgeschlossen": "bg-green-100 text-green-800",
};

export default function Rentals() {
  const { data: rentals, isLoading } = useRentals();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [detailRental, setDetailRental] = useState<RentalWithDetails | null>(null);
  const [returnCheckRental, setReturnCheckRental] = useState<RentalWithDetails | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materialausleihe"
        actions={
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Neue Ausleihe
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Ausleihen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lehrer</TableHead>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead>Artikel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rentals?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Keine Ausleihen vorhanden
                    </TableCell>
                  </TableRow>
                )}
                {rentals?.map((rental) => {
                  const hasReturns = rental.items?.some((i) => i.status === "Rückgabe initiiert");
                  return (
                    <TableRow key={rental.id}>
                      <TableCell className="font-medium">
                        {rental.instructor ? `${rental.instructor.first_name} ${rental.instructor.last_name}` : "–"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(rental.rental_period_start), "dd.MM.yyyy", { locale: de })}
                        {rental.rental_period_end && ` – ${format(new Date(rental.rental_period_end), "dd.MM.yyyy", { locale: de })}`}
                      </TableCell>
                      <TableCell>{rental.items?.length || 0} Artikel</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[rental.status] || ""}>
                          {rental.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hasReturns && (
                            <Button variant="ghost" size="icon" onClick={() => setReturnCheckRental(rental)} title="Rückgabe prüfen">
                              <CheckCircle className="h-4 w-4 text-orange-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => setDetailRental(rental)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewRentalDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
      <RentalDetailDialog rental={detailRental} onClose={() => setDetailRental(null)} />
      <ReturnCheckDialog rental={returnCheckRental} onClose={() => setReturnCheckRental(null)} />
    </div>
  );
}
