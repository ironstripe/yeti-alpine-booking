import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, History, Boxes } from "lucide-react";
import { useInstructorRentals } from "@/hooks/useRentals";
import { NewRentalDialog } from "@/components/rentals/NewRentalDialog";

const statusColors: Record<string, string> = {
  "Wartet auf Quittierung": "bg-amber-100 text-amber-800",
  "Ausgeliehen": "bg-blue-100 text-blue-800",
  "Teilweise zurückgegeben": "bg-purple-100 text-purple-800",
};

const ACTIVE_STATUSES = ["Wartet auf Quittierung", "Ausgeliehen", "Teilweise zurückgegeben"];

interface Props {
  instructorId: string;
}

export function InstructorRentalsCard({ instructorId }: Props) {
  const navigate = useNavigate();
  const { data: rentals, isLoading } = useInstructorRentals(instructorId);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const activeRentals = rentals?.filter((r) => ACTIVE_STATUSES.includes(r.status)) || [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4" />
            Materialausleihe
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNewDialogOpen(true)} title="Neue Ausleihe">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/rentals?instructor_id=${instructorId}`)} title="Historie">
              <History className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : activeRentals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine aktiven Ausleihen</p>
          ) : (
            <div className="space-y-2">
              {activeRentals.map((rental) => (
                <div key={rental.id} className="flex items-center justify-between text-sm">
                  <span>{rental.items?.length || 0} Artikel</span>
                  <Badge variant="secondary" className={statusColors[rental.status] || ""}>
                    {rental.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NewRentalDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        preselectedInstructorId={instructorId}
      />
    </>
  );
}
