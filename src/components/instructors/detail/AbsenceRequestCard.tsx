import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  CalendarDays, 
  Plus, 
  ChevronDown, 
  ChevronUp,
  Clock,
  Check,
  X,
  AlertCircle,
  Info,
} from "lucide-react";
import { useCreateAbsence, type AbsenceType } from "@/hooks/useInstructorAbsences";
import { useInstructorAbsenceHistory, type AbsenceHistoryItem } from "@/hooks/useInstructorAbsenceHistory";
import { cn } from "@/lib/utils";

interface AbsenceRequestCardProps {
  instructorId: string;
  isTeacherView?: boolean;
}

const ABSENCE_TYPES: { value: AbsenceType; label: string }[] = [
  { value: "vacation", label: "Urlaub" },
  { value: "sick", label: "Krank" },
  { value: "organization", label: "Organisation" },
  { value: "office_duty", label: "Bürodienst" },
  { value: "other", label: "Sonstiges" },
];

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "outline" | "destructive" | "secondary" }> = {
  pending: { label: "Ausstehend", variant: "outline" },
  confirmed: { label: "Genehmigt", variant: "default" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
};

export function AbsenceRequestCard({ instructorId, isTeacherView = false }: AbsenceRequestCardProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Form state
  const [absenceType, setAbsenceType] = useState<AbsenceType>("vacation");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [isFullDay, setIsFullDay] = useState(true);
  const [reason, setReason] = useState("");
  const [submitForApproval, setSubmitForApproval] = useState(false);

  const createAbsence = useCreateAbsence();
  const { data: absenceHistory = [], isLoading: isHistoryLoading } = useInstructorAbsenceHistory(instructorId);

  const handleSubmit = async () => {
    if (!dateRange.from) return;

    const startDate = format(dateRange.from, "yyyy-MM-dd");
    const endDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : startDate;

    await createAbsence.mutateAsync({
      instructorId,
      startDate,
      endDate,
      type: absenceType,
      reason: reason.trim() || undefined,
      // Teachers submit as pending, admins can choose via toggle
      status: isTeacherView ? "pending" : (submitForApproval ? "pending" : "confirmed"),
    });

    // Reset form
    setAbsenceType("vacation");
    setDateRange({ from: undefined, to: undefined });
    setReason("");
    setSubmitForApproval(false);
    setIsFormOpen(false);
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (start === end) {
      return format(startDate, "d. MMM yyyy", { locale: de });
    }
    return `${format(startDate, "d. MMM", { locale: de })} - ${format(endDate, "d. MMM yyyy", { locale: de })}`;
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_BADGES[status] || { label: status, variant: "outline" as const };
    return (
      <Badge 
        variant={config.variant}
        className={cn(
          status === "pending" && "bg-amber-100 text-amber-800 border-amber-300",
          status === "confirmed" && "bg-emerald-100 text-emerald-800 border-emerald-300",
          status === "rejected" && "bg-red-100 text-red-800 border-red-300"
        )}
      >
        {status === "pending" && <Clock className="h-3 w-3 mr-1" />}
        {status === "confirmed" && <Check className="h-3 w-3 mr-1" />}
        {status === "rejected" && <X className="h-3 w-3 mr-1" />}
        {config.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Abwesenheiten
          </span>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsFormOpen(!isFormOpen)}
          >
            <Plus className="h-4 w-4 mr-1" />
            {isTeacherView ? "Antrag stellen" : "Eintragen"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Request Form */}
        <Collapsible open={isFormOpen} onOpenChange={setIsFormOpen}>
          <CollapsibleContent className="space-y-4 border rounded-lg p-4 bg-muted/30">
            {/* Absence Type */}
            <div className="space-y-2">
              <Label>Art der Abwesenheit</Label>
              <Select value={absenceType} onValueChange={(v) => setAbsenceType(v as AbsenceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Zeitraum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd.MM.yyyy")} - {format(dateRange.to, "dd.MM.yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "dd.MM.yyyy")
                      )
                    ) : (
                      "Datum wählen"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start" side="top">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
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

            {/* Reason */}
            <div className="space-y-2">
              <Label>Grund (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. Familienfeier, Arzttermin..."
                rows={2}
              />
            </div>

            {/* Submit for Approval Toggle - Only for Admin/Office */}
            {!isTeacherView && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="submit-for-approval" className="text-sm">
                    Als Antrag senden (erfordert Genehmigung)
                  </Label>
                  <Switch
                    id="submit-for-approval"
                    checked={submitForApproval}
                    onCheckedChange={setSubmitForApproval}
                  />
                </div>
                {submitForApproval && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="text-xs">
                      Der Antrag erscheint im Dashboard zur Genehmigung und ist bis dahin als ausstehend markiert.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={!dateRange.from || createAbsence.isPending}
                className="flex-1"
              >
                {createAbsence.isPending 
                  ? "Wird gesendet..." 
                  : isTeacherView || submitForApproval 
                    ? "Antrag senden" 
                    : "Direkt eintragen"
                }
              </Button>
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>
                Abbrechen
              </Button>
            </div>

            {isTeacherView && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Der Antrag muss vom Büro genehmigt werden.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* History */}
        <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span>Verlauf ({absenceHistory.length})</span>
              {isHistoryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            {isHistoryLoading ? (
              <div className="text-sm text-muted-foreground">Laden...</div>
            ) : absenceHistory.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Keine Abwesenheiten eingetragen
              </div>
            ) : (
              absenceHistory.slice(0, 10).map((absence) => (
                <div 
                  key={absence.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {ABSENCE_TYPES.find(t => t.value === absence.type)?.label || absence.type}
                      </span>
                      {getStatusBadge(absence.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateRange(absence.startDate, absence.endDate)}
                    </p>
                    {absence.status === "rejected" && absence.rejectionReason && (
                      <p className="text-xs text-red-600">
                        Grund: {absence.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
