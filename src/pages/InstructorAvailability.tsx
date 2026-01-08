import { useState } from "react";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, Trash2, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const absenceTypes = [
  { value: "vacation", label: "Urlaub", icon: "🏖️" },
  { value: "sick", label: "Krankheit", icon: "🤒" },
  { value: "training", label: "Weiterbildung", icon: "🎓" },
  { value: "personal", label: "Privat", icon: "👤" },
];

export default function InstructorAvailability() {
  const queryClient = useQueryClient();
  const { instructorId } = useUserRole();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [absenceType, setAbsenceType] = useState("personal");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("17:00");
  const [reason, setReason] = useState("");

  // Fetch absences
  const { data: absences, isLoading } = useQuery({
    queryKey: ["instructor-absences", instructorId],
    queryFn: async () => {
      if (!instructorId) return [];

      const { data, error } = await supabase
        .from("instructor_absences")
        .select("*")
        .eq("instructor_id", instructorId)
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!instructorId,
  });

  // Check for conflicts
  const { data: conflicts } = useQuery({
    queryKey: ["absence-conflicts", instructorId, startDate, endDate],
    queryFn: async () => {
      if (!instructorId || !startDate) return [];

      const checkEndDate = endDate || startDate;

      const { data, error } = await supabase
        .from("ticket_items")
        .select("id, date, time_start, time_end")
        .eq("instructor_id", instructorId)
        .gte("date", startDate)
        .lte("date", checkEndDate);

      if (error) throw error;
      return data || [];
    },
    enabled: !!instructorId && !!startDate,
  });

  // Create absence mutation
  const createAbsenceMutation = useMutation({
    mutationFn: async () => {
      if (!instructorId) throw new Error("No instructor ID");

      const { error } = await supabase.from("instructor_absences").insert({
        instructor_id: instructorId,
        type: absenceType,
        start_date: startDate,
        end_date: endDate || startDate,
        is_full_day: isFullDay,
        time_start: isFullDay ? null : timeStart,
        time_end: isFullDay ? null : timeEnd,
        reason,
        status: "pending",
        requested_by: "self",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abwesenheit beantragt");
      queryClient.invalidateQueries({ queryKey: ["instructor-absences"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      console.error("Error creating absence:", error);
      toast.error("Fehler beim Beantragen der Abwesenheit");
    },
  });

  // Cancel absence mutation
  const cancelAbsenceMutation = useMutation({
    mutationFn: async (absenceId: string) => {
      const { error } = await supabase
        .from("instructor_absences")
        .delete()
        .eq("id", absenceId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abwesenheit storniert");
      queryClient.invalidateQueries({ queryKey: ["instructor-absences"] });
    },
    onError: (error) => {
      console.error("Error canceling absence:", error);
      toast.error("Fehler beim Stornieren");
    },
  });

  const resetForm = () => {
    setAbsenceType("personal");
    setIsFullDay(true);
    setStartDate("");
    setEndDate("");
    setTimeStart("09:00");
    setTimeEnd("17:00");
    setReason("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-500">🟢 Genehmigt</Badge>;
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">🟡 Beantragt</Badge>;
      case "rejected":
        return <Badge variant="destructive">🔴 Abgelehnt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    const found = absenceTypes.find((t) => t.value === type);
    return found?.icon || "📅";
  };

  const getTypeLabel = (type: string) => {
    const found = absenceTypes.find((t) => t.value === type);
    return found?.label || type;
  };

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div className="space-y-6">
        {/* Absences List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              ABWESENHEITEN
            </h2>
          </div>

          {(absences || []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-muted-foreground">Keine Abwesenheiten eingetragen</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(absences || []).map((absence: any) => (
                <Card key={absence.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getTypeIcon(absence.type)}</span>
                          <span className="font-medium">{getTypeLabel(absence.type)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(absence.start_date), "d. MMMM yyyy", { locale: de })}
                          {absence.end_date !== absence.start_date && (
                            <> - {format(parseISO(absence.end_date), "d. MMMM yyyy", { locale: de })}</>
                          )}
                        </p>
                        {!absence.is_full_day && absence.time_start && (
                          <p className="text-sm text-muted-foreground">
                            {absence.time_start?.slice(0, 5)} - {absence.time_end?.slice(0, 5)}
                          </p>
                        )}
                        {absence.reason && (
                          <p className="text-sm text-muted-foreground mt-2">
                            "{absence.reason}"
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(absence.status)}
                        {absence.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-8"
                            onClick={() => cancelAbsenceMutation.mutate(absence.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Request Absence Button */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Abwesenheit beantragen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Abwesenheit beantragen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {/* Type Selection */}
                <div className="space-y-2">
                  <Label>Art der Abwesenheit</Label>
                  <RadioGroup
                    value={absenceType}
                    onValueChange={setAbsenceType}
                    className="grid grid-cols-2 gap-2"
                  >
                    {absenceTypes.map((type) => (
                      <div key={type.value}>
                        <RadioGroupItem
                          value={type.value}
                          id={type.value}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={type.value}
                          className="flex items-center gap-2 rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                        >
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Full Day Toggle */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="full-day">Ganztägig</Label>
                  <Switch
                    id="full-day"
                    checked={isFullDay}
                    onCheckedChange={setIsFullDay}
                  />
                </div>

                {/* Date Selection */}
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Von</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bis</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate}
                      />
                    </div>
                  </div>

                  {/* Time Selection (if not full day) */}
                  {!isFullDay && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Zeit von</Label>
                        <Input
                          type="time"
                          value={timeStart}
                          onChange={(e) => setTimeStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Zeit bis</Label>
                        <Input
                          type="time"
                          value={timeEnd}
                          onChange={(e) => setTimeEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <Label>Grund (optional)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="z.B. Arzttermin..."
                    rows={2}
                  />
                </div>

                {/* Conflict Warning */}
                {conflicts && conflicts.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          Achtung: {conflicts.length} Buchung(en) betroffen
                        </p>
                        <p className="text-amber-700 dark:text-amber-300">
                          Diese müssen umgebucht werden.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit */}
                <Button
                  className="w-full"
                  onClick={() => createAbsenceMutation.mutate()}
                  disabled={!startDate || createAbsenceMutation.isPending}
                >
                  {createAbsenceMutation.isPending ? "Wird beantragt..." : "Antrag senden"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </InstructorLayout>
  );
}
