import { useState, useEffect } from "react";
import { Loader2, GraduationCap, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSchoolTariff, useUpdateSchoolTariff, type SchoolTariff } from "@/hooks/useSchoolTariff";

export function SchoolTariffCard() {
  const { data: tariff, isLoading } = useSchoolTariff();
  const updateTariff = useUpdateSchoolTariff();
  const [localTariff, setLocalTariff] = useState<SchoolTariff | null>(null);

  const currentTariff = localTariff || tariff;
  const hasChanges = localTariff !== null;

  const handleChange = (field: keyof SchoolTariff, value: number) => {
    setLocalTariff((prev) => ({
      hourly_rate: prev?.hourly_rate ?? tariff?.hourly_rate ?? 95,
      currency: prev?.currency ?? tariff?.currency ?? "CHF",
      min_hours_per_group: prev?.min_hours_per_group ?? tariff?.min_hours_per_group ?? 1.5,
      description: prev?.description ?? tariff?.description ?? "",
      [field]: value,
    }));
  };

  const handleSave = () => {
    if (localTariff) {
      updateTariff.mutate(localTariff, {
        onSuccess: () => setLocalTariff(null),
      });
    }
  };

  const handleCancel = () => {
    setLocalTariff(null);
  };

  // Example calculation values
  const exampleGroups = 4;
  const exampleDays = 5;
  const exampleHoursPerDay = 1.5;
  const exampleTotal = exampleGroups * exampleDays * exampleHoursPerDay * (currentTariff?.hourly_rate || 95);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Schultarif</CardTitle>
        </div>
        <CardDescription>
          Einheitlicher Tarif für alle Schulen und Skilager. Berechnung erfolgt pro Gruppe und Stunde.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="hourly_rate">Stundensatz pro Gruppe</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">CHF</span>
              <Input
                id="hourly_rate"
                type="number"
                step="0.50"
                min="0"
                value={currentTariff?.hourly_rate ?? 95}
                onChange={(e) => handleChange("hourly_rate", parseFloat(e.target.value) || 0)}
                className="w-28"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="min_hours">Mindestdauer pro Einheit</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="min_hours"
                type="number"
                step="0.5"
                min="0.5"
                value={currentTariff?.min_hours_per_group ?? 1.5}
                onChange={(e) => handleChange("min_hours_per_group", parseFloat(e.target.value) || 0.5)}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">Stunden</span>
            </div>
          </div>
        </div>

        <Alert className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <div className="font-medium">Berechnungsbeispiel:</div>
            <div className="text-sm">
              {exampleGroups} Gruppen × {exampleDays} Tage × {exampleHoursPerDay}h × CHF {currentTariff?.hourly_rate?.toFixed(2)} = 
              <span className="font-semibold ml-1">CHF {exampleTotal.toLocaleString("de-CH", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Formel: Anzahl Gruppen × Tage × Stunden pro Tag × Stundensatz
            </div>
          </AlertDescription>
        </Alert>

        {hasChanges && (
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={handleCancel}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={updateTariff.isPending}>
              {updateTariff.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
