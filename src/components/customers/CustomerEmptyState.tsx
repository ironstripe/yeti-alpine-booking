import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, SearchX } from "lucide-react";

interface CustomerEmptyStateProps {
  searchQuery: string;
  onClearSearch: () => void;
  onCreateCustomer: () => void;
}

export function CustomerEmptyState({
  searchQuery,
  onClearSearch,
  onCreateCustomer,
}: CustomerEmptyStateProps) {
  if (searchQuery) {
    return (
      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <SearchX className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Keine Kunden gefunden für "{searchQuery}"
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Versuche einen anderen Suchbegriff
            </p>
            <Button variant="outline" onClick={onClearSearch}>
              Suche zurücksetzen
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
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold font-display mb-2">
            Noch keine Kunden vorhanden
          </h3>
          <p className="text-muted-foreground text-sm mb-4">
            Erstelle deinen ersten Kunden, um loszulegen
          </p>
          <Button onClick={onCreateCustomer}>
            Ersten Kunden erstellen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
