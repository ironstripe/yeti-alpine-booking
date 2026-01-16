import { useState, useMemo } from "react";
import { format, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  Pencil,
  Save,
  X,
  Lock,
  AlertTriangle,
  Users
} from "lucide-react";
import { useInstructors } from "@/hooks/useInstructors";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { EnhancedDatePicker } from "@/components/ui/enhanced-date-picker";
import { cn } from "@/lib/utils";
import { 
  isBookingEditable, 
  getEditableStatus, 
  START_TIMES, 
  END_TIMES,
  isValidTimeRange,
  calculateDuration
} from "@/lib/booking-utils";
import { MEETING_POINTS, getMeetingPointById } from "@/lib/meeting-point-utils";

interface TicketItem {
  id: string;
  date: string;
  time_start: string | null;
  time_end: string | null;
  meeting_point: string | null;
  internal_notes: string | null;
  instructor_notes: string | null;
  instructor_id: string | null;
  participant_id: string | null;
  line_total: number | null;
  unit_price: number | null;
  product?: {
    id: string;
    name: string;
    type: string;
  } | null;
  participant?: {
    id: string;
    first_name: string;
    last_name: string | null;
  } | null;
  instructor?: {
    id: string;
    first_name: string;
    last_name: string;
    specialization: string | null;
  } | null;
}

interface TicketItemEditCardProps {
  item: TicketItem;
  onUpdate?: () => void;
}

export function TicketItemEditCard({ item, onUpdate }: TicketItemEditCardProps) {
  const { data: instructors = [] } = useInstructors();
  const updateTicketItem = useUpdateTicketItem();
  
  const [isEditing, setIsEditing] = useState(false);
  
  // Form state
  const [date, setDate] = useState<Date | undefined>(item.date ? new Date(item.date) : undefined);
  const [timeStart, setTimeStart] = useState(item.time_start?.slice(0, 5) || "");
  const [timeEnd, setTimeEnd] = useState(item.time_end?.slice(0, 5) || "");
  const [instructorId, setInstructorId] = useState<string | null>(item.instructor_id);
  const [meetingPoint, setMeetingPoint] = useState(item.meeting_point || "");
  const [internalNotes, setInternalNotes] = useState(item.internal_notes || "");
  const [instructorNotes, setInstructorNotes] = useState(item.instructor_notes || "");

  // Derived values
  const editableStatus = useMemo(() => getEditableStatus(item.date), [item.date]);

  const duration = useMemo(() => {
    if (!timeStart || !timeEnd) return null;
    return calculateDuration(timeStart, timeEnd);
  }, [timeStart, timeEnd]);

  const timeRangeValid = useMemo(() => {
    if (!timeStart || !timeEnd) return true;
    return isValidTimeRange(timeStart, timeEnd);
  }, [timeStart, timeEnd]);

  // Filter active instructors
  const filteredInstructors = useMemo(() => {
    return instructors.filter(i => i.status === 'active');
  }, [instructors]);

  const resetForm = () => {
    setDate(item.date ? new Date(item.date) : undefined);
    setTimeStart(item.time_start?.slice(0, 5) || "");
    setTimeEnd(item.time_end?.slice(0, 5) || "");
    setInstructorId(item.instructor_id);
    setMeetingPoint(item.meeting_point || "");
    setInternalNotes(item.internal_notes || "");
    setInstructorNotes(item.instructor_notes || "");
  };

  const handleEdit = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!date || !timeRangeValid) return;

    updateTicketItem.mutate(
      {
        ticketItemId: item.id,
        date: format(date, "yyyy-MM-dd"),
        timeStart: timeStart || undefined,
        timeEnd: timeEnd || undefined,
        instructorId: instructorId,
        meetingPoint: meetingPoint || null,
        internalNotes: internalNotes || null,
        instructorNotes: instructorNotes || null,
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          onUpdate?.();
        },
      }
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (isEditing) {
    return (
      <Card className="border-primary">
        <CardContent className="pt-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {item.participant?.first_name} {item.participant?.last_name || ""} 
              </span>
              <span className="text-muted-foreground">-</span>
              <span>{item.product?.name || "Produkt"}</span>
            </div>
            <span className="font-medium">CHF {formatCurrency(item.line_total || item.unit_price || 0)}</span>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Datum
            </Label>
            <EnhancedDatePicker
              value={date}
              onChange={setDate}
              disabled={(d) => d < startOfDay(new Date())}
            />
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Uhrzeit
            </Label>
            <div className="flex items-center gap-2">
              <Select value={timeStart} onValueChange={setTimeStart}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent>
                  {START_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">-</span>
              <Select value={timeEnd} onValueChange={setTimeEnd}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Ende" />
                </SelectTrigger>
                <SelectContent>
                  {END_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {duration && (
                <Badge variant="outline" className="ml-2">
                  {duration}h
                </Badge>
              )}
            </div>
            {!timeRangeValid && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Endzeit muss nach Startzeit liegen
              </p>
            )}
          </div>

          {/* Instructor */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              Lehrer
            </Label>
            <Select 
              value={instructorId || "none"} 
              onValueChange={(val) => setInstructorId(val === "none" ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Lehrer auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Später zuweisen</span>
                </SelectItem>
                {filteredInstructors.map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.first_name} {instructor.last_name}
                    {instructor.specialization && (
                      <span className="text-muted-foreground ml-1">
                        ({instructor.specialization === 'ski' ? '⛷️' : 
                          instructor.specialization === 'snowboard' ? '🏂' : '⛷️🏂'})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Meeting Point */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Treffpunkt
            </Label>
            <Select value={meetingPoint} onValueChange={setMeetingPoint}>
              <SelectTrigger>
                <SelectValue placeholder="Treffpunkt auswählen" />
              </SelectTrigger>
              <SelectContent>
                {MEETING_POINTS.map((mp) => (
                  <SelectItem key={mp.id} value={mp.id}>
                    {mp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm">Interne Notizen</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Nur für Büro sichtbar..."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Notizen für Lehrer</Label>
            <Textarea
              value={instructorNotes}
              onChange={(e) => setInstructorNotes(e.target.value)}
              placeholder="Sichtbar für den Lehrer..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={updateTicketItem.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Abbrechen
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateTicketItem.isPending || !timeRangeValid}
            >
              <Save className="h-4 w-4 mr-1" />
              {updateTicketItem.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // View Mode
  return (
    <div className={cn(
      "flex justify-between items-start p-3 rounded-lg transition-colors",
      editableStatus.editable 
        ? "bg-muted/50 hover:bg-muted/80 cursor-pointer group" 
        : "bg-muted/30"
    )}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">
            {item.participant?.first_name} {item.participant?.last_name || ""} - {item.product?.name}
          </p>
          {!editableStatus.editable && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Vergangen
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(item.date), 'dd.MM.yyyy', { locale: de })}
          {item.time_start && ` · ${item.time_start.substring(0, 5)}`}
          {item.time_end && ` - ${item.time_end.substring(0, 5)}`}
        </p>
        {item.instructor && (
          <p className="text-sm text-muted-foreground">
            <Users className="h-3 w-3 inline mr-1" />
            {item.instructor.first_name} {item.instructor.last_name}
          </p>
        )}
        {item.meeting_point && (
          <p className="text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 inline mr-1" />
            {getMeetingPointById(item.meeting_point)?.name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p className="font-medium">CHF {formatCurrency(item.line_total || item.unit_price || 0)}</p>
        {editableStatus.editable && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit();
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bearbeiten</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}