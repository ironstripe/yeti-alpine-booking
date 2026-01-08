import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BookingsEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function BookingsEmptyState({ hasFilters, onClearFilters }: BookingsEmptyStateProps) {
  const navigate = useNavigate();

  if (hasFilters) {
    return (
      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Keine Buchungen gefunden
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
              Es wurden keine Buchungen gefunden, die Ihren Filterkriterien entsprechen.
            </p>
            <Button variant="outline" onClick={onClearFilters}>
              Filter zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardContent className="py-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold font-display mb-2">
            Noch keine Buchungen
          </h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
            Erstellen Sie Ihre erste Buchung, um mit der Verwaltung Ihrer Skischule zu beginnen.
          </p>
          <Button onClick={() => navigate("/bookings/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Buchung
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
