import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Plus } from 'lucide-react';

interface TrainingsEmptyStateProps {
  onCreateClick: () => void;
  hasFilters: boolean;
}

export function TrainingsEmptyState({ onCreateClick, hasFilters }: TrainingsEmptyStateProps) {
  return (
    <Card className="bg-card">
      <CardContent className="py-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
          </div>
          
          {hasFilters ? (
            <>
              <h3 className="text-lg font-semibold font-display mb-2">
                Keine Trainings gefunden
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Mit den aktuellen Filtern wurden keine Trainings gefunden.
                Versuche die Filter anzupassen.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold font-display mb-2">
                Noch keine Trainings
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                Erstelle dein erstes wiederkehrendes Training wie "Blauer Prinz" 
                oder "Kinderskikurs Anfänger".
              </p>
              <Button onClick={onCreateClick}>
                <Plus className="h-4 w-4 mr-2" />
                Erstes Training erstellen
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
