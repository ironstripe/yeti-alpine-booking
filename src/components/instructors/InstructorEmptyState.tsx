import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserCheck, Plus } from "lucide-react";

interface InstructorEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  onAddInstructor: () => void;
}

export function InstructorEmptyState({
  hasFilters,
  onClearFilters,
  onAddInstructor,
}: InstructorEmptyStateProps) {
  return (
    <Card className="bg-card">
      <CardContent className="py-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <UserCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          {hasFilters ? (
            <>
              <h3 className="text-lg font-semibold font-display mb-2">
                Keine Skilehrer gefunden
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                Es wurden keine Skilehrer gefunden, die den Filterkriterien entsprechen.
              </p>
              <Button variant="outline" onClick={onClearFilters}>
                Filter zurücksetzen
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold font-display mb-2">
                Noch keine Skilehrer
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                Füge deinen ersten Skilehrer hinzu, um mit der Verwaltung zu beginnen.
              </p>
              <Button onClick={onAddInstructor}>
                <Plus className="h-4 w-4 mr-2" />
                Neuer Skilehrer
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
