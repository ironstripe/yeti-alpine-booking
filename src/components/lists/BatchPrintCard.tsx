import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";

interface BatchPrintCardProps {
  lunchList: boolean;
  setLunchList: (val: boolean) => void;
  groupAssignment: boolean;
  setGroupAssignment: (val: boolean) => void;
  instructorSchedules: boolean;
  setInstructorSchedules: (val: boolean) => void;
  dailyOverview: boolean;
  setDailyOverview: (val: boolean) => void;
  attendanceLists: boolean;
  setAttendanceLists: (val: boolean) => void;
  onPrint: () => void;
  hasAnySelection: boolean;
}

export function BatchPrintCard({
  lunchList,
  setLunchList,
  groupAssignment,
  setGroupAssignment,
  instructorSchedules,
  setInstructorSchedules,
  dailyOverview,
  setDailyOverview,
  attendanceLists,
  setAttendanceLists,
  onPrint,
  hasAnySelection,
}: BatchPrintCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stapeldruck</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Alle Morgenlisten auf einmal drucken:
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="batch-lunch"
              checked={lunchList}
              onCheckedChange={(checked) => setLunchList(checked === true)}
            />
            <Label htmlFor="batch-lunch" className="text-sm">
              Mittagsliste
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="batch-groups"
              checked={groupAssignment}
              onCheckedChange={(checked) => setGroupAssignment(checked === true)}
            />
            <Label htmlFor="batch-groups" className="text-sm">
              Gruppeneinteilung
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="batch-instructors"
              checked={instructorSchedules}
              onCheckedChange={(checked) => setInstructorSchedules(checked === true)}
            />
            <Label htmlFor="batch-instructors" className="text-sm">
              Skilehrer-Einsatzpläne (einzeln)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="batch-overview"
              checked={dailyOverview}
              onCheckedChange={(checked) => setDailyOverview(checked === true)}
            />
            <Label htmlFor="batch-overview" className="text-sm">
              Tagesübersicht
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="batch-attendance"
              checked={attendanceLists}
              onCheckedChange={(checked) => setAttendanceLists(checked === true)}
            />
            <Label htmlFor="batch-attendance" className="text-sm">
              Anwesenheitslisten (alle Gruppen)
            </Label>
          </div>
        </div>

        <Button
          onClick={onPrint}
          className="w-full"
          disabled={!hasAnySelection}
        >
          <Printer className="h-4 w-4 mr-2" />
          Ausgewählte drucken
        </Button>
      </CardContent>
    </Card>
  );
}
