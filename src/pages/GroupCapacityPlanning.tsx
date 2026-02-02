import { useState } from 'react';
import { startOfWeek, format, addWeeks, subWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Users2,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { TrainingsLayout } from '@/components/trainings/TrainingsLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { GroupCapacityCard } from '@/components/group-capacity/GroupCapacityCard';
import { SplitGroupDialog } from '@/components/group-capacity/SplitGroupDialog';
import { MergeGroupsDialog } from '@/components/group-capacity/MergeGroupsDialog';
import { AddAssistantDialog } from '@/components/group-capacity/AddAssistantDialog';
import { 
  useGroupCapacityData, 
  useGenerateTrainingGroups,
  type GroupCapacityInfo 
} from '@/hooks/useGroupCapacityData';
import { useInstructors } from '@/hooks/useInstructors';
import { toast } from 'sonner';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="w-3 h-12 rounded" />
                <div>
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ onGenerate, isGenerating }: { onGenerate: () => void; isGenerating: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Users2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">Keine Gruppen vorhanden</h3>
        <p className="text-muted-foreground text-center mb-6 max-w-sm">
          Für diese Woche wurden noch keine Trainingsgruppen generiert. 
          Klicke auf den Button, um Gruppen basierend auf den Anmeldungen zu erstellen.
        </p>
        <Button onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Gruppen generieren
        </Button>
      </CardContent>
    </Card>
  );
}

export default function GroupCapacityPlanning() {
  const [currentWeek, setCurrentWeek] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  
  // Dialog states
  const [splitDialogGroup, setSplitDialogGroup] = useState<GroupCapacityInfo | null>(null);
  const [mergeDialogGroup, setMergeDialogGroup] = useState<GroupCapacityInfo | null>(null);
  const [assistantDialogGroup, setAssistantDialogGroup] = useState<GroupCapacityInfo | null>(null);

  const { data, isLoading, error } = useGroupCapacityData(currentWeek);
  const { data: instructors = [] } = useInstructors();
  const generateMutation = useGenerateTrainingGroups();

  const groups = data?.groups || [];
  const stats = data?.stats;

  const overbookedGroups = groups.filter(g => g.capacityStatus === 'overbooked');
  const underbookedGroups = groups.filter(g => g.capacityStatus === 'underbooked');
  const okGroups = groups.filter(g => g.capacityStatus === 'ok');

  const handleGenerate = async () => {
    try {
      await generateMutation.mutateAsync(currentWeek);
      toast.success('Gruppen erfolgreich generiert');
    } catch (err) {
      toast.error('Fehler beim Generieren der Gruppen');
    }
  };

  const weekLabel = `${format(currentWeek, 'd. MMMM', { locale: de })} - ${format(
    addWeeks(currentWeek, 0).setDate(currentWeek.getDate() + 6),
    'd. MMMM yyyy',
    { locale: de }
  )}`;

  return (
    <TrainingsLayout>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[280px] text-center">
            <span className="font-medium">KW {format(currentWeek, 'w')}</span>
            <span className="text-muted-foreground ml-2 text-sm">{weekLabel}</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button 
          variant="outline" 
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Gruppen aktualisieren
        </Button>
      </div>

      {/* Stats Summary */}
      {stats && stats.totalGroups > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.totalGroups}</div>
              <div className="text-sm text-muted-foreground">Gruppen</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.totalParticipants}</div>
              <div className="text-sm text-muted-foreground">Teilnehmer</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{stats.overbookedCount}</div>
              <div className="text-sm text-muted-foreground">Überbucht</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.underbookedCount}</div>
              <div className="text-sm text-muted-foreground">Unterbelegt</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Warnings */}
      {(overbookedGroups.length > 0 || underbookedGroups.length > 0) && (
        <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Handlungsbedarf</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            {overbookedGroups.length > 0 && (
              <span>{overbookedGroups.length} Gruppe(n) überbucht · </span>
            )}
            {underbookedGroups.length > 0 && (
              <span>{underbookedGroups.length} Gruppe(n) unterbelegt</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>
            Daten konnten nicht geladen werden: {error.message}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : groups.length === 0 ? (
        <EmptyState onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
      ) : (
        <div className="space-y-8">
          {/* Overbooked Groups */}
          {overbookedGroups.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                Überbuchte Gruppen
              </h2>
              <div className="space-y-3">
                {overbookedGroups.map(group => (
                  <GroupCapacityCard
                    key={group.id || group.courseId}
                    group={group}
                    variant="overbooked"
                    onSplit={() => setSplitDialogGroup(group)}
                    onAddAssistant={() => setAssistantDialogGroup(group)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Underbooked Groups */}
          {underbookedGroups.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Unterbelegte Gruppen
              </h2>
              <div className="space-y-3">
                {underbookedGroups.map(group => (
                  <GroupCapacityCard
                    key={group.id || group.courseId}
                    group={group}
                    variant="underbooked"
                    onMerge={() => setMergeDialogGroup(group)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* OK Groups */}
          {okGroups.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Gruppen mit optimaler Belegung
              </h2>
              <div className="space-y-3">
                {okGroups.map(group => (
                  <GroupCapacityCard
                    key={group.id || group.courseId}
                    group={group}
                    variant="ok"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Dialogs */}
      <SplitGroupDialog
        open={!!splitDialogGroup}
        onOpenChange={(open) => !open && setSplitDialogGroup(null)}
        group={splitDialogGroup}
        instructors={instructors}
        weekStart={currentWeek}
      />

      <MergeGroupsDialog
        open={!!mergeDialogGroup}
        onOpenChange={(open) => !open && setMergeDialogGroup(null)}
        group={mergeDialogGroup}
        allGroups={groups}
        instructors={instructors}
        weekStart={currentWeek}
      />

      <AddAssistantDialog
        open={!!assistantDialogGroup}
        onOpenChange={(open) => !open && setAssistantDialogGroup(null)}
        group={assistantDialogGroup}
        instructors={instructors}
      />
    </TrainingsLayout>
  );
}
