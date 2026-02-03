import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FlaskConical, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface GenerationResult {
  success: boolean;
  created?: {
    tickets: number;
    items: number;
  };
  dateRange?: {
    start: string;
    end: string;
  };
  error?: string;
  groupCourses?: {
    trainingGroups: number;
    enrollments: number;
    customersCreated: number;
  };
}

export function TestDataGenerator() {
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bookingCount, setBookingCount] = useState(50);
  const [daysSpread, setDaysSpread] = useState(14);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // Group course options
  const [generateGroupCourses, setGenerateGroupCourses] = useState(true);
  const [weeksToGenerate, setWeeksToGenerate] = useState(4);
  const [includeCapacityScenarios, setIncludeCapacityScenarios] = useState(true);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress(10);
    setResult(null);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke("generate-test-bookings", {
        body: {
          startDate,
          bookingCount,
          daysSpread,
          generateGroupCourses,
          weeksToGenerate,
          includeCapacityScenarios,
        },
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        throw new Error(error.message);
      }

      setResult(data as GenerationResult);

      if (data.success) {
        const groupMsg = data.groupCourses 
          ? ` Gruppenkurse: ${data.groupCourses.trainingGroups} Gruppen, ${data.groupCourses.enrollments} Einschreibungen.`
          : "";
        toast({
          title: "Testdaten generiert",
          description: `${data.created?.tickets || 0} Buchungen mit ${data.created?.items || 0} Lektionen erstellt.${groupMsg}`,
        });
      }
    } catch (error) {
      console.error("Generation error:", error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
      toast({
        title: "Fehler",
        description: "Testdaten konnten nicht generiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Testdaten generieren
        </CardTitle>
        <CardDescription>
          Generieren Sie realistische Testbuchungen für den Scheduler. Die Buchungen werden mit zufälligen Kunden, Teilnehmern und Instruktoren erstellt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Private Lessons Section */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Privatlektionen</Label>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookingCount">Anzahl Buchungen</Label>
              <Input
                id="bookingCount"
                type="number"
                min={1}
                max={200}
                value={bookingCount}
                onChange={(e) => setBookingCount(Number(e.target.value))}
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daysSpread">Tage verteilen</Label>
              <Input
                id="daysSpread"
                type="number"
                min={1}
                max={30}
                value={daysSpread}
                onChange={(e) => setDaysSpread(Number(e.target.value))}
                disabled={isGenerating}
              />
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Verteilung der generierten Privatlektionen:</p>
            <ul className="mt-1 list-disc list-inside">
              <li>35% Vormittag 09:00-11:00 (2h)</li>
              <li>25% Vormittag 10:00-12:00 (2h)</li>
              <li>25% Nachmittag 14:00-16:00 (2h)</li>
              <li>15% Halbtag (3h)</li>
              <li>80% mit Instruktor bestätigt</li>
            </ul>
            <p className="mt-2 text-xs">Gruppen-Instruktoren werden automatisch ausgeschlossen.</p>
          </div>
        </div>

        {/* Group Courses Section */}
        <div className="space-y-4 border-t pt-4">
          <Label className="text-base font-semibold">Gruppenkurse</Label>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="generateGroupCourses" 
              checked={generateGroupCourses}
              onCheckedChange={(checked) => setGenerateGroupCourses(!!checked)}
              disabled={isGenerating}
            />
            <Label htmlFor="generateGroupCourses" className="cursor-pointer">
              Gruppenkurs-Buchungen generieren
            </Label>
          </div>
          
          {generateGroupCourses && (
            <div className="space-y-4 pl-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="weeksToGenerate">Wochen generieren</Label>
                  <Input
                    id="weeksToGenerate"
                    type="number"
                    min={1}
                    max={12}
                    value={weeksToGenerate}
                    onChange={(e) => setWeeksToGenerate(Number(e.target.value))}
                    disabled={isGenerating}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="includeCapacityScenarios" 
                  checked={includeCapacityScenarios}
                  onCheckedChange={(checked) => setIncludeCapacityScenarios(!!checked)}
                  disabled={isGenerating}
                />
                <Label htmlFor="includeCapacityScenarios" className="cursor-pointer">
                  Kapazitäts-Szenarien einschliessen (überbucht, unterbelegt)
                </Label>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p>Pro Kurs/Woche werden generiert:</p>
                <ul className="mt-1 list-disc list-inside">
                  <li>50% normale Auslastung (min bis max)</li>
                  <li>20% überbucht (+4 bis +12 über max)</li>
                  <li>20% unterbelegt (1 bis min-1)</li>
                  <li>10% leer (0 Teilnehmer)</li>
                </ul>
                <p className="mt-2 text-xs">70% der Buchungen werden als bezahlt markiert.</p>
              </div>
            </div>
          )}
        </div>

        {isGenerating && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Generiere Testdaten...
            </p>
          </div>
        )}

        {result && (
          <div
            className={`p-4 rounded-lg flex items-start gap-3 ${
              result.success
                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {result.success ? (
              <>
                <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Erfolgreich generiert</p>
                  <div className="text-sm mt-1 space-y-1">
                    <p>
                      Privatlektionen: {result.created?.tickets || 0} Buchungen mit {result.created?.items || 0} Lektionen
                    </p>
                    {result.groupCourses && (
                      <p>
                        Gruppenkurse: {result.groupCourses.trainingGroups} Gruppen, {result.groupCourses.enrollments} Einschreibungen
                      </p>
                    )}
                    {result.dateRange && (
                      <p className="text-xs opacity-75">
                        Zeitraum: {result.dateRange.start} bis {result.dateRange.end}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Fehler bei der Generierung</p>
                  <p className="text-sm mt-1">{result.error}</p>
                </div>
              </>
            )}
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || bookingCount < 1}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generiere...
            </>
          ) : (
            <>
              <FlaskConical className="mr-2 h-4 w-4" />
              Testdaten generieren
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
