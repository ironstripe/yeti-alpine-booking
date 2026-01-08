import { useState } from "react";
import { Loader2, CalendarDays, Plus, Trash2 } from "lucide-react";
import { format, parseISO, isWithinInterval, eachDayOfInterval, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useSeasons,
  useCurrentSeason,
  useHighSeasonPeriods,
  useCreateSeason,
  useUpdateSeason,
  useCreateHighSeasonPeriod,
  useDeleteHighSeasonPeriod,
} from "@/hooks/useSeasons";

export default function SettingsSeasons() {
  const { data: seasons, isLoading: seasonsLoading } = useSeasons();
  const { data: currentSeason } = useCurrentSeason();
  const { data: highSeasonPeriods, isLoading: periodsLoading } = useHighSeasonPeriods(currentSeason?.id);
  
  const createSeason = useCreateSeason();
  const updateSeason = useUpdateSeason();
  const createPeriod = useCreateHighSeasonPeriod();
  const deletePeriod = useDeleteHighSeasonPeriod();

  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ name: "", start_date: "", end_date: "" });
  const [periodForm, setPeriodForm] = useState({ name: "", start_date: "", end_date: "" });

  const isLoading = seasonsLoading || periodsLoading;

  const handleCreateSeason = () => {
    if (!seasonForm.name || !seasonForm.start_date || !seasonForm.end_date) return;
    createSeason.mutate({
      name: seasonForm.name,
      start_date: seasonForm.start_date,
      end_date: seasonForm.end_date,
      is_current: !currentSeason,
    }, {
      onSuccess: () => {
        setIsSeasonModalOpen(false);
        setSeasonForm({ name: "", start_date: "", end_date: "" });
      }
    });
  };

  const handleCreatePeriod = () => {
    if (!currentSeason || !periodForm.name || !periodForm.start_date || !periodForm.end_date) return;
    createPeriod.mutate({
      season_id: currentSeason.id,
      name: periodForm.name,
      start_date: periodForm.start_date,
      end_date: periodForm.end_date,
    }, {
      onSuccess: () => {
        setIsPeriodModalOpen(false);
        setPeriodForm({ name: "", start_date: "", end_date: "" });
      }
    });
  };

  const handleSetCurrent = (seasonId: string) => {
    updateSeason.mutate({ id: seasonId, is_current: true });
  };

  // Generate calendar preview
  const renderCalendarPreview = () => {
    if (!currentSeason) return null;

    const seasonStart = parseISO(currentSeason.start_date);
    const months = [
      startOfMonth(seasonStart),
      startOfMonth(addMonths(seasonStart, 1)),
    ];

    const isHighSeason = (date: Date) => {
      return highSeasonPeriods?.some(period => 
        isWithinInterval(date, { start: parseISO(period.start_date), end: parseISO(period.end_date) })
      );
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {months.map((monthStart) => {
          const monthEnd = endOfMonth(monthStart);
          const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
          const firstDayOfWeek = (monthStart.getDay() + 6) % 7; // Monday = 0

          return (
            <div key={monthStart.toISOString()} className="text-center">
              <h4 className="font-medium mb-2">
                {format(monthStart, "MMMM yyyy", { locale: de })}
              </h4>
              <div className="grid grid-cols-7 gap-1 text-xs">
                {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(day => (
                  <div key={day} className="text-muted-foreground font-medium py-1">{day}</div>
                ))}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {days.map(day => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "py-1 rounded text-sm",
                      isHighSeason(day) && "bg-primary text-primary-foreground font-medium"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <SettingsLayout title="Saisons" description="Definiere Haupt- und Nebensaison für die Preisgestaltung">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Saisons" description="Definiere Haupt- und Nebensaison für die Preisgestaltung">
      <div className="space-y-6">
        {/* Current Season */}
        {currentSeason ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Aktuelle Saison: {currentSeason.name}</CardTitle>
                <Badge>Aktiv</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Saisonstart</Label>
                  <p className="font-medium">{format(parseISO(currentSeason.start_date), "dd.MM.yyyy")}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Saisonende</Label>
                  <p className="font-medium">{format(parseISO(currentSeason.end_date), "dd.MM.yyyy")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Keine Saison definiert"
            description="Erstelle eine Saison, um Hochsaison-Perioden festzulegen."
            action={{
              label: "Saison erstellen",
              onClick: () => setIsSeasonModalOpen(true),
            }}
          />
        )}

        {/* High Season Periods */}
        {currentSeason && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Hochsaison-Perioden</CardTitle>
                <Button size="sm" onClick={() => setIsPeriodModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Neu
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!highSeasonPeriods?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine Hochsaison-Perioden definiert
                </p>
              ) : (
                highSeasonPeriods.map((period) => (
                  <div
                    key={period.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{period.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(period.start_date), "dd.MM.yyyy")} - {format(parseISO(period.end_date), "dd.MM.yyyy")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deletePeriod.mutate({ id: period.id, seasonId: currentSeason.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Calendar Preview */}
        {currentSeason && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kalendervorschau</CardTitle>
            </CardHeader>
            <CardContent>
              {renderCalendarPreview()}
              <div className="flex items-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-primary" />
                  <span className="text-muted-foreground">Hochsaison</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Seasons List */}
        {seasons && seasons.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Alle Saisons</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setIsSeasonModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Saison
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {seasons.map((season) => (
                <div
                  key={season.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{season.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(season.start_date), "dd.MM.yyyy")} - {format(parseISO(season.end_date), "dd.MM.yyyy")}
                    </p>
                  </div>
                  {season.is_current ? (
                    <Badge>Aktuell</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleSetCurrent(season.id)}>
                      Aktivieren
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Season Modal */}
      <Dialog open={isSeasonModalOpen} onOpenChange={setIsSeasonModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Saison erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={seasonForm.name}
                onChange={(e) => setSeasonForm(s => ({ ...s, name: e.target.value }))}
                placeholder="Winter 2025/26"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Startdatum *</Label>
                <Input
                  type="date"
                  value={seasonForm.start_date}
                  onChange={(e) => setSeasonForm(s => ({ ...s, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Enddatum *</Label>
                <Input
                  type="date"
                  value={seasonForm.end_date}
                  onChange={(e) => setSeasonForm(s => ({ ...s, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSeasonModalOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateSeason} disabled={createSeason.isPending}>
              {createSeason.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Period Modal */}
      <Dialog open={isPeriodModalOpen} onOpenChange={setIsPeriodModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hochsaison-Periode hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={periodForm.name}
                onChange={(e) => setPeriodForm(s => ({ ...s, name: e.target.value }))}
                placeholder="Weihnachten/Neujahr"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Von *</Label>
                <Input
                  type="date"
                  value={periodForm.start_date}
                  onChange={(e) => setPeriodForm(s => ({ ...s, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Bis *</Label>
                <Input
                  type="date"
                  value={periodForm.end_date}
                  onChange={(e) => setPeriodForm(s => ({ ...s, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPeriodModalOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreatePeriod} disabled={createPeriod.isPending}>
              {createPeriod.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
