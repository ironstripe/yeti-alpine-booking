import { useState } from "react";
import { format, addMonths } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Ban, Calendar, Clock, Info, Repeat } from "lucide-react";
import { useCreateAbsence } from "@/hooks/useInstructorAbsences";
import { useCreateRecurringBlock, useRecurringBlockConflicts } from "@/hooks/useRecurringBlocks";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useUserRole } from "@/hooks/useUserRole";
import type { SchedulerBooking } from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";

export const ABSENCE_TYPES = {
  vacation: { label: "Urlaub", description: "Geplanter Urlaub" },
  sick: { label: "Krank", description: "Krankheitsbedingte Abwesenheit" },
  organization: { label: "Organisation", description: "Organisatorische Aufgaben" },
  office_duty: { label: "Bürodienst", description: "Büroarbeit / Verwaltung" },
  other: { label: "Sonstiges", description: "Andere Abwesenheitsgründe" },
} as const;

export type AbsenceType = keyof typeof ABSENCE_TYPES;

interface AbsenceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: SchedulerBooking[];
  onSuccess: () => void;
}

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

export function AbsenceTypeDialog({
  open,
  onOpenChange,
  conflicts,
  onSuccess,
}: AbsenceTypeDialogProps) {
  const [activeTab, setActiveTab] = useState<"one-time" | "recurring">("one-time");
  
  // One-time absence state
  const [selectedType, setSelectedType] = useState<AbsenceType>("vacation");
  const [reason, setReason] = useState("");
  const [submitForApproval, setSubmitForApproval] = useState(false);
  const [isFullDay, setIsFullDay] = useState(true);
  const [timeStart, setTimeStart] = useState("12:00");
  const [timeEnd, setTimeEnd] = useState("14:00");
  
  // Recurring block state
  const [recurringStartTime, setRecurringStartTime] = useState("12:00");
  const [recurringEndTime, setRecurringEndTime] = useState("13:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const today = format(new Date(), "yyyy-MM-dd");
  const [validFrom, setValidFrom] = useState(today);
  const [validUntil, setValidUntil] = useState("");
  const [recurringReason, setRecurringReason] = useState("");
  
  const { state, clearSelection } = useSchedulerSelection();
  const { isAdminOrOffice, instructorId } = useUserRole();
  const createAbsence = useCreateAbsence();
  const createRecurringBlock = useCreateRecurringBlock();

  // Check recurring block conflicts
  const { data: recurringConflicts = [] } = useRecurringBlockConflicts(
    state.teacherId,
    recurringStartTime,
    recurringEndTime,
    weekdays,
    validFrom,
    validUntil || null
  );

  const hasConflicts = conflicts.length > 0;
  const hasRecurringConflicts = recurringConflicts.length > 0;
  
  // Determine if the absence should be pending or confirmed
  const willBePending = !isAdminOrOffice || submitForApproval;
  
  // Teachers can only create absences for themselves
  const isCreatingForSelf = instructorId && state.teacherId === instructorId;
  const canCreateAbsence = isAdminOrOffice || isCreatingForSelf;

  const handleConfirmOneTime = async () => {
    if (hasConflicts || !state.teacherId || state.selections.length === 0) return;
    
    // Validate time range for partial-day
    if (!isFullDay && timeStart >= timeEnd) return;

    // Get date range from selections
    const dates = state.selections.map((s) => s.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    await createAbsence.mutateAsync({
      instructorId: state.teacherId,
      startDate,
      endDate,
      type: selectedType,
      reason: reason || undefined,
      status: willBePending ? "pending" : "confirmed",
      isFullDay,
      timeStart: isFullDay ? undefined : timeStart,
      timeEnd: isFullDay ? undefined : timeEnd,
    });

    clearSelection();
    onSuccess();
    onOpenChange(false);
    resetForm();
  };

  const handleConfirmRecurring = async () => {
    if (hasRecurringConflicts || !state.teacherId || weekdays.length === 0) return;
    
    // Validate time range
    if (recurringStartTime >= recurringEndTime) return;

    await createRecurringBlock.mutateAsync({
      instructor_id: state.teacherId,
      start_time: recurringStartTime,
      end_time: recurringEndTime,
      weekdays,
      valid_from: validFrom,
      valid_until: validUntil || null,
      reason: recurringReason || null,
      preset_type: null,
    });

    clearSelection();
    onSuccess();
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setActiveTab("one-time");
    setSelectedType("vacation");
    setReason("");
    setSubmitForApproval(false);
    setIsFullDay(true);
    setTimeStart("12:00");
    setTimeEnd("14:00");
    setRecurringStartTime("12:00");
    setRecurringEndTime("13:00");
    setWeekdays([1, 2, 3, 4, 5]);
    setValidFrom(today);
    setValidUntil("");
    setRecurringReason("");
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const toggleWeekday = (day: number) => {
    setWeekdays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const selectAllWeekdays = () => setWeekdays([0, 1, 2, 3, 4, 5, 6]);
  const selectWeekdaysOnly = () => setWeekdays([1, 2, 3, 4, 5]);
  const selectWeekend = () => setWeekdays([0, 6]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {activeTab === "recurring" ? (
              <Repeat className="h-5 w-5" />
            ) : willBePending ? (
              <Clock className="h-5 w-5 text-amber-500" />
            ) : (
              <Ban className="h-5 w-5" />
            )}
            {activeTab === "recurring" 
              ? "Wiederkehrende Blockierung"
              : willBePending 
                ? "Abwesenheit beantragen" 
                : "Abwesenheit eintragen"
            }
          </DialogTitle>
          <DialogDescription>
            {activeTab === "recurring"
              ? "Regelmäßige Zeitblockierung erstellen (z.B. Mittagspause)."
              : willBePending 
                ? "Dein Antrag wird zur Genehmigung an das Büro gesendet."
                : "Wähle den Grund der Abwesenheit für den ausgewählten Zeitraum."
            }
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "one-time" | "recurring")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="one-time">Einmalig</TabsTrigger>
            <TabsTrigger value="recurring">Wiederkehrend</TabsTrigger>
          </TabsList>

          {/* One-time absence tab */}
          <TabsContent value="one-time" className="flex-1 overflow-y-auto space-y-4 py-2 mt-0">
            {/* Teacher Not Creating For Self Warning */}
            {!canCreateAbsence && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Keine Berechtigung</AlertTitle>
                <AlertDescription>
                  Du kannst nur Abwesenheiten für dich selbst beantragen.
                </AlertDescription>
              </Alert>
            )}

            {/* Conflict Warning */}
            {hasConflicts && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Konflikt mit bestehenden Buchungen</AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="mb-2">
                    Es gibt {conflicts.length} Buchung(en) im ausgewählten Zeitraum. 
                    Diese müssen zuerst verschoben werden:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {conflicts.slice(0, 3).map((booking) => (
                      <li key={booking.id}>
                        {booking.date}: {booking.timeStart} - {booking.timeEnd}
                        {booking.participantName && ` (${booking.participantName})`}
                      </li>
                    ))}
                    {conflicts.length > 3 && (
                      <li>...und {conflicts.length - 3} weitere</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Pending Info Banner */}
            {willBePending && canCreateAbsence && !hasConflicts && (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <Clock className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-600">Antrag erforderlich</AlertTitle>
                <AlertDescription className="text-amber-600/80">
                  Deine Abwesenheit wird als Antrag eingereicht und muss vom Büro genehmigt werden.
                </AlertDescription>
              </Alert>
            )}

            {/* Selection Summary */}
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {state.selections.length} Zeitfenster ausgewählt
              </span>
            </div>

            {/* Absence Type Selection */}
            <div className="space-y-3">
              <Label>Art der Abwesenheit</Label>
              <RadioGroup
                value={selectedType}
                onValueChange={(value) => setSelectedType(value as AbsenceType)}
                className="space-y-2"
              >
                {Object.entries(ABSENCE_TYPES).map(([key, { label, description }]) => (
                  <label
                    key={key}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-md border cursor-pointer",
                      "hover:bg-muted/50 transition-colors",
                      selectedType === key && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value={key} className="mt-0.5" />
                    <div>
                      <span className="font-medium">{label}</span>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Optional Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Bemerkung (optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. Arzttermin, Fortbildung..."
                rows={2}
              />
            </div>

            {/* Full Day Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Ganztägig</Label>
                  <p className="text-sm text-muted-foreground">
                    Gesamten Tag blockieren
                  </p>
                </div>
                <Switch
                  checked={isFullDay}
                  onCheckedChange={setIsFullDay}
                />
              </div>
              
              {/* Time Selection - Only show when not full day */}
              {!isFullDay && (
                <div className="space-y-2">
                  <Label>Zeitraum</Label>
                  <div className="flex items-center gap-2">
                    <Select value={timeStart} onValueChange={setTimeStart}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.slice(0, -1).map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">bis</span>
                    <Select value={timeEnd} onValueChange={setTimeEnd}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.slice(1).map((time) => (
                          <SelectItem 
                            key={time} 
                            value={time}
                            disabled={time <= timeStart}
                          >
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {timeStart >= timeEnd && (
                    <p className="text-xs text-destructive">
                      Endzeit muss nach Startzeit liegen
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Submit for Approval Toggle - Only for Admin/Office */}
            {isAdminOrOffice && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Als Antrag senden</Label>
                    <p className="text-sm text-muted-foreground">
                      Erfordert Genehmigung im Dashboard
                    </p>
                  </div>
                  <Switch
                    checked={submitForApproval}
                    onCheckedChange={setSubmitForApproval}
                  />
                </div>
                {submitForApproval && (
                  <Alert className="border-amber-500/30 bg-amber-500/10">
                    <Info className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-amber-600/80">
                      Die Abwesenheit wird als Antrag eingereicht und erscheint im Dashboard zur Genehmigung.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </TabsContent>

          {/* Recurring block tab */}
          <TabsContent value="recurring" className="flex-1 overflow-y-auto space-y-4 py-2 mt-0">
            {/* Teacher Not Creating For Self Warning */}
            {!canCreateAbsence && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Keine Berechtigung</AlertTitle>
                <AlertDescription>
                  Du kannst nur Blockierungen für dich selbst beantragen.
                </AlertDescription>
              </Alert>
            )}

            {/* Recurring Conflicts */}
            {hasRecurringConflicts && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Konflikt mit bestehenden Buchungen</AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="mb-2">
                    Es gibt {recurringConflicts.length} Buchung(en) die mit diesem Block kollidieren:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {recurringConflicts.slice(0, 3).map((conflict) => (
                      <li key={conflict.booking_id}>
                        {conflict.booking_date}: {conflict.time_start} - {conflict.time_end}
                        {conflict.participant_name && ` (${conflict.participant_name})`}
                      </li>
                    ))}
                    {recurringConflicts.length > 3 && (
                      <li>...und {recurringConflicts.length - 3} weitere</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Info Banner */}
            <Alert className="border-amber-500/30 bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-600">Antrag erforderlich</AlertTitle>
              <AlertDescription className="text-amber-600/80">
                Wiederkehrende Blockierungen werden zur Genehmigung eingereicht.
              </AlertDescription>
            </Alert>

            {/* Time Selection */}
            <div className="space-y-2">
              <Label>Zeitfenster</Label>
              <div className="flex items-center gap-2">
                <Select value={recurringStartTime} onValueChange={setRecurringStartTime}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.slice(0, -1).map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">bis</span>
                <Select value={recurringEndTime} onValueChange={setRecurringEndTime}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.slice(1).map((time) => (
                      <SelectItem 
                        key={time} 
                        value={time}
                        disabled={time <= recurringStartTime}
                      >
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {recurringStartTime >= recurringEndTime && (
                <p className="text-xs text-destructive">
                  Endzeit muss nach Startzeit liegen
                </p>
              )}
            </div>

            {/* Weekday Selection */}
            <div className="space-y-2">
              <Label>Wochentage</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, index) => (
                  <label
                    key={index}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-md border cursor-pointer transition-colors",
                      weekdays.includes(index) 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-background hover:bg-muted"
                    )}
                  >
                    <Checkbox
                      checked={weekdays.includes(index)}
                      onCheckedChange={() => toggleWeekday(index)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={selectAllWeekdays}
                >
                  Alle
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={selectWeekdaysOnly}
                >
                  Mo-Fr
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={selectWeekend}
                >
                  Wochenende
                </Button>
              </div>
            </div>

            {/* Validity Period */}
            <div className="space-y-2">
              <Label>Gültigkeitszeitraum</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Von</Label>
                  <Input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    min={today}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Bis (optional)</Label>
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    min={validFrom || today}
                  />
                </div>
              </div>
              {!validUntil && (
                <p className="text-xs text-muted-foreground">
                  Ohne Enddatum gilt die Blockierung unbefristet
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="recurring-reason">Grund (optional)</Label>
              <Textarea
                id="recurring-reason"
                value={recurringReason}
                onChange={(e) => setRecurringReason(e.target.value)}
                placeholder="z.B. Mittagspause, regelmäßiger Termin..."
                rows={2}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          {activeTab === "one-time" ? (
            <Button
              onClick={handleConfirmOneTime}
              disabled={hasConflicts || !canCreateAbsence || createAbsence.isPending}
            >
              {createAbsence.isPending 
                ? "Speichern..." 
                : willBePending 
                  ? "Antrag senden" 
                  : "Abwesenheit eintragen"
              }
            </Button>
          ) : (
            <Button
              onClick={handleConfirmRecurring}
              disabled={
                hasRecurringConflicts || 
                !canCreateAbsence || 
                weekdays.length === 0 ||
                recurringStartTime >= recurringEndTime ||
                createRecurringBlock.isPending
              }
            >
              {createRecurringBlock.isPending ? "Speichern..." : "Antrag senden"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
