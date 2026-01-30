import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";
import { 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Home,
  FileText,
  Pencil,
  Save,
  X,
  CreditCard,
  Lock,
  AlertTriangle,
  Users,
  ExternalLink
} from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookingDetail";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { useInstructors } from "@/hooks/useInstructors";
import { useSendBookingChangeNotification } from "@/hooks/useBookingChangeNotification";
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
import { hasOverlap, type SchedulerBooking } from "@/lib/scheduler-utils";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookingChangeConfirmDialog, 
  detectChangeType, 
  type ChangeType 
} from "@/components/bookings/BookingChangeConfirmDialog";

interface BookingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketItemId: string | null;
}

export function BookingDetailDialog({
  open,
  onOpenChange,
  ticketItemId,
}: BookingDetailDialogProps) {
  const navigate = useNavigate();
  const { data: booking, isLoading } = useBookingDetail(ticketItemId);
  const { data: instructors = [] } = useInstructors();
  const updateTicketItem = useUpdateTicketItem();
  
  const [isEditing, setIsEditing] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [showChangeConfirmDialog, setShowChangeConfirmDialog] = useState(false);
  const [pendingInstructorId, setPendingInstructorId] = useState<string | null>(null);
  const [instructorConflicts, setInstructorConflicts] = useState<Record<string, boolean>>({});
  
  // Notification hook
  const sendChangeNotification = useSendBookingChangeNotification();
  
  // Form state
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [meetingPoint, setMeetingPoint] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [instructorNotes, setInstructorNotes] = useState("");

  // Derived values
  const editableStatus = useMemo(() => {
    if (!booking?.date) return { editable: false, reason: "Keine Buchungsdaten" };
    return getEditableStatus(booking.date);
  }, [booking?.date]);

  const duration = useMemo(() => {
    if (!timeStart || !timeEnd) return null;
    return calculateDuration(timeStart, timeEnd);
  }, [timeStart, timeEnd]);

  const timeRangeValid = useMemo(() => {
    if (!timeStart || !timeEnd) return true;
    return isValidTimeRange(timeStart, timeEnd);
  }, [timeStart, timeEnd]);

  // Filter instructors by specialization if product type known
  const filteredInstructors = useMemo(() => {
    const activeInstructors = instructors.filter(i => i.status === 'active');
    // Could filter by specialization based on product.type if needed
    return activeInstructors;
  }, [instructors]);

  // Fetch instructor conflicts when editing and date/time changes
  useEffect(() => {
    const checkConflicts = async () => {
      if (!isEditing || !date || !timeStart || !timeEnd) {
        setInstructorConflicts({});
        return;
      }

      const dateStr = format(date, "yyyy-MM-dd");
      
      // Fetch all bookings for this date
      const { data: bookingsData } = await supabase
        .from("ticket_items")
        .select("id, instructor_id, time_start, time_end")
        .eq("date", dateStr)
        .not("status", "eq", "cancelled")
        .not("instructor_id", "is", null);

      if (!bookingsData) {
        setInstructorConflicts({});
        return;
      }

      // Check conflicts for each instructor
      const conflicts: Record<string, boolean> = {};
      
      filteredInstructors.forEach((instructor) => {
        // Get bookings for this instructor (excluding current booking)
        const instructorBookings = bookingsData
          .filter(b => b.instructor_id === instructor.id && b.id !== ticketItemId)
          .map(b => ({
            id: b.id,
            instructorId: b.instructor_id,
            date: dateStr,
            timeStart: b.time_start || "",
            timeEnd: b.time_end || "",
            type: "private" as const,
            isPaid: false,
            ticketId: "",
            status: "confirmed",
          }));

        // Check if there's overlap
        conflicts[instructor.id] = hasOverlap(
          instructor.id,
          dateStr,
          timeStart,
          timeEnd,
          instructorBookings
        );
      });

      setInstructorConflicts(conflicts);
    };

    checkConflicts();
  }, [isEditing, date, timeStart, timeEnd, filteredInstructors, ticketItemId]);

  // Get pending instructor details for conflict dialog
  const pendingInstructor = useMemo(() => {
    if (!pendingInstructorId) return null;
    return filteredInstructors.find(i => i.id === pendingInstructorId);
  }, [pendingInstructorId, filteredInstructors]);

  // Handle instructor selection with conflict check
  const handleInstructorChange = useCallback((newInstructorId: string | null) => {
    if (!newInstructorId || newInstructorId === "none") {
      setInstructorId(null);
      return;
    }

    // Check if instructor has conflict
    if (instructorConflicts[newInstructorId]) {
      setPendingInstructorId(newInstructorId);
      setShowConflictDialog(true);
    } else {
      setInstructorId(newInstructorId);
    }
  }, [instructorConflicts]);

  // Confirm instructor despite conflict
  const handleConfirmConflict = () => {
    if (pendingInstructorId) {
      setInstructorId(pendingInstructorId);
    }
    setShowConflictDialog(false);
    setPendingInstructorId(null);
  };

  // Sync form state when booking loads
  useEffect(() => {
    if (booking) {
      setDate(booking.date ? new Date(booking.date) : undefined);
      setTimeStart(booking.timeStart?.slice(0, 5) || "");
      setTimeEnd(booking.timeEnd?.slice(0, 5) || "");
      setInstructorId(booking.instructorId);
      setMeetingPoint(booking.meetingPoint || "");
      setInternalNotes(booking.internalNotes || "");
      setInstructorNotes(booking.instructorNotes || "");
    }
  }, [booking]);

  // Reset edit mode when dialog closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  // Compute change type for confirmation dialog
  const currentChangeType = useMemo(() => {
    if (!booking || !date) return 'none' as ChangeType;
    const originalDate = booking.date;
    const originalTime = `${booking.timeStart?.slice(0, 5) || ""} - ${booking.timeEnd?.slice(0, 5) || ""}`;
    const newDateStr = format(date, "yyyy-MM-dd");
    const newTime = `${timeStart} - ${timeEnd}`;
    
    return detectChangeType(
      originalDate,
      originalTime,
      booking.instructorId,
      newDateStr,
      newTime,
      instructorId
    );
  }, [booking, date, timeStart, timeEnd, instructorId]);

  // Get old and new values for confirmation dialog
  const changeDialogValues = useMemo(() => {
    if (!booking || !date) return { oldValues: {}, newValues: {} };
    
    const originalInstructor = instructors.find(i => i.id === booking.instructorId);
    const newInstructor = instructors.find(i => i.id === instructorId);
    
    return {
      oldValues: {
        date: booking.date ? format(new Date(booking.date), "d. MMMM yyyy", { locale: de }) : "",
        time: `${booking.timeStart?.slice(0, 5) || ""} - ${booking.timeEnd?.slice(0, 5) || ""} Uhr`,
        instructor: originalInstructor 
          ? `${originalInstructor.first_name} ${originalInstructor.last_name}` 
          : undefined,
      },
      newValues: {
        date: format(date, "d. MMMM yyyy", { locale: de }),
        time: `${timeStart} - ${timeEnd} Uhr`,
        instructor: newInstructor 
          ? `${newInstructor.first_name} ${newInstructor.last_name}` 
          : undefined,
      },
    };
  }, [booking, date, timeStart, timeEnd, instructorId, instructors]);

  const handleSaveClick = () => {
    if (!ticketItemId || !date) return;
    if (!timeRangeValid) return;

    // Check if there are significant changes that need confirmation
    if (currentChangeType !== 'none') {
      setShowChangeConfirmDialog(true);
    } else {
      // No significant changes, save directly
      performSave(false);
    }
  };

  const performSave = (notifyCustomer: boolean) => {
    if (!ticketItemId || !date || !booking) return;

    const newDateStr = format(date, "yyyy-MM-dd");
    const originalInstructor = instructors.find(i => i.id === booking.instructorId);
    const newInstructor = instructors.find(i => i.id === instructorId);

    updateTicketItem.mutate(
      {
        ticketItemId,
        date: newDateStr,
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
          toast.success("Buchung erfolgreich aktualisiert");

          // Send notification if requested
          if (notifyCustomer && currentChangeType !== 'none') {
            sendChangeNotification.mutate({
              ticketItemId,
              changeType: currentChangeType,
              oldValues: {
                date: booking.date ? format(new Date(booking.date), "d. MMMM yyyy", { locale: de }) : "",
                time: `${booking.timeStart?.slice(0, 5) || ""} - ${booking.timeEnd?.slice(0, 5) || ""} Uhr`,
                instructorId: booking.instructorId,
                instructorName: originalInstructor 
                  ? `${originalInstructor.first_name} ${originalInstructor.last_name}` 
                  : undefined,
              },
              newValues: {
                date: format(date, "d. MMMM yyyy", { locale: de }),
                time: `${timeStart} - ${timeEnd} Uhr`,
                instructorId: instructorId,
                instructorName: newInstructor 
                  ? `${newInstructor.first_name} ${newInstructor.last_name}` 
                  : undefined,
              },
              productName: booking.product?.name,
              meetingPoint: meetingPoint || booking.meetingPoint,
            });
          }
        },
      }
    );
  };

  const handleConfirmChangeDialog = (notifyCustomer: boolean) => {
    setShowChangeConfirmDialog(false);
    performSave(notifyCustomer);
  };

  const handleCancel = () => {
    if (booking) {
      setDate(booking.date ? new Date(booking.date) : undefined);
      setTimeStart(booking.timeStart?.slice(0, 5) || "");
      setTimeEnd(booking.timeEnd?.slice(0, 5) || "");
      setInstructorId(booking.instructorId);
      setMeetingPoint(booking.meetingPoint || "");
      setInternalNotes(booking.internalNotes || "");
      setInstructorNotes(booking.instructorNotes || "");
    }
    setIsEditing(false);
  };

  const isPaid = booking?.ticket?.paidAmount && booking?.ticket?.totalAmount 
    ? booking.ticket.paidAmount >= booking.ticket.totalAmount 
    : false;

  const selectedInstructor = filteredInstructors.find(i => i.id === instructorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Buchungsdetails
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!isLoading && booking && (
          <div className="space-y-4">
            {/* Header with Ticket Number and Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Ticket #{booking.ticket?.ticketNumber}
                </span>
                <Badge variant={isPaid ? "default" : "destructive"}>
                  <CreditCard className="h-3 w-3 mr-1" />
                  {isPaid ? "Bezahlt" : "Offen"}
                </Badge>
              </div>
              {!isEditing && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditing(true)}
                          disabled={!editableStatus.editable}
                        >
                          {editableStatus.editable ? (
                            <Pencil className="h-4 w-4 mr-1" />
                          ) : (
                            <Lock className="h-4 w-4 mr-1" />
                          )}
                          Bearbeiten
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!editableStatus.editable && (
                      <TooltipContent>
                        <p>{editableStatus.reason}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <Separator />

            {/* Course Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Kursinfo</h4>
              
              <div className="grid gap-3">
                {/* Date */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Datum
                    </Label>
                    <EnhancedDatePicker
                      value={date}
                      onChange={setDate}
                      disabled={(d) => d < startOfDay(new Date())}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>
                      {format(new Date(booking.date), "EEEE, d. MMMM yyyy", { locale: de })}
                    </span>
                    {!editableStatus.editable && (
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Vergangen
                      </Badge>
                    )}
                  </div>
                )}
                
                {/* Time */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
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
                ) : (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>
                      {booking.timeStart?.slice(0, 5)} - {booking.timeEnd?.slice(0, 5)} Uhr
                    </span>
                  </div>
                )}

                {/* Product & Participant */}
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    {booking.product?.name || "Privatstunde"}
                    {booking.participant && (
                      <span className="text-muted-foreground ml-1">
                        ({booking.participant.firstName} {booking.participant.lastName || ""})
                      </span>
                    )}
                  </span>
                </div>

                {/* Instructor */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Lehrer
                    </Label>
                    <Select 
                      value={instructorId || "none"} 
                      onValueChange={(val) => handleInstructorChange(val === "none" ? null : val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Lehrer auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">Später zuweisen</span>
                        </SelectItem>
                        {filteredInstructors.map((instructor) => {
                          const hasConflict = instructorConflicts[instructor.id];
                          return (
                            <SelectItem 
                              key={instructor.id} 
                              value={instructor.id}
                              className={cn(hasConflict && "text-amber-600")}
                            >
                              <span className="flex items-center gap-1.5">
                                {hasConflict && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                )}
                                {instructor.first_name} {instructor.last_name}
                                {instructor.specialization && (
                                  <span className="text-muted-foreground ml-1">
                                    ({instructor.specialization === 'ski' ? '⛷️' : 
                                      instructor.specialization === 'snowboard' ? '🏂' : '⛷️🏂'})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : booking.instructor ? (
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>
                      {booking.instructor.firstName} {booking.instructor.lastName}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Kein Lehrer zugewiesen</span>
                  </div>
                )}

                {/* Meeting Point */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
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
                ) : (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{getMeetingPointById(booking.meetingPoint)?.name || "Kein Treffpunkt"}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Customer Contact */}
            {booking.customer && (
              <>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Kundenkontakt</h4>
                  
                  <div className="grid gap-2">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>
                        {booking.customer.firstName} {booking.customer.lastName}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a 
                        href={`mailto:${booking.customer.email}`}
                        className="text-primary hover:underline"
                      >
                        {booking.customer.email}
                      </a>
                    </div>

                    {booking.customer.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a 
                          href={`tel:${booking.customer.phone}`}
                          className="text-primary hover:underline"
                        >
                          {booking.customer.phone}
                        </a>
                      </div>
                    )}

                    {booking.customer.holidayAddress && (
                      <div className="flex items-center gap-3">
                        <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{booking.customer.holidayAddress}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Notes */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Notizen</h4>

              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="internalNotes">Interne Notizen</Label>
                    <Textarea
                      id="internalNotes"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Nur für Büro sichtbar..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="instructorNotes">Notizen für Lehrer</Label>
                    <Textarea
                      id="instructorNotes"
                      value={instructorNotes}
                      onChange={(e) => setInstructorNotes(e.target.value)}
                      placeholder="Sichtbar für den Lehrer..."
                      rows={2}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {booking.internalNotes && (
                    <div className={cn(
                      "p-3 rounded-md text-sm",
                      "bg-muted"
                    )}>
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        Intern
                      </span>
                      {booking.internalNotes}
                    </div>
                  )}
                  {booking.instructorNotes && (
                    <div className={cn(
                      "p-3 rounded-md text-sm",
                      "bg-primary/5 border border-primary/10"
                    )}>
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        Für Lehrer
                      </span>
                      {booking.instructorNotes}
                    </div>
                  )}
                  {!booking.internalNotes && !booking.instructorNotes && (
                    <p className="text-sm text-muted-foreground">Keine Notizen</p>
                  )}
                </div>
              )}
            </div>

            {/* Edit Mode Actions */}
            {isEditing && (
              <>
                <Separator />
                <div className="flex justify-end gap-2">
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
                    onClick={handleSaveClick}
                    disabled={updateTicketItem.isPending || !timeRangeValid}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {updateTicketItem.isPending ? "Speichern..." : "Speichern"}
                  </Button>
                </div>
              </>
            )}

            {/* Full Edit Navigation - Always visible when not editing */}
            {!isEditing && booking.ticketId && (
              <>
                <Separator />
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/bookings/${booking.ticketId}?from=scheduler&date=${booking.date}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Vollständig bearbeiten
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>

      {/* Instructor Conflict Confirmation Dialog */}
      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Zeitkonflikt erkannt
            </AlertDialogTitle>
            <AlertDialogDescription>
              Der Lehrer <strong>{pendingInstructor?.first_name} {pendingInstructor?.last_name}</strong> hat 
              bereits eine Buchung um <strong>{timeStart} - {timeEnd}</strong> Uhr. 
              Möchtest du trotzdem fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingInstructorId(null)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmConflict}>
              Trotzdem zuweisen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Booking Change Confirmation Dialog */}
      <BookingChangeConfirmDialog
        open={showChangeConfirmDialog}
        onOpenChange={setShowChangeConfirmDialog}
        onConfirm={handleConfirmChangeDialog}
        changeType={currentChangeType}
        customerName={booking?.customer 
          ? `${booking.customer.firstName} ${booking.customer.lastName}` 
          : undefined}
        customerEmail={booking?.customer?.email}
        oldValues={changeDialogValues.oldValues}
        newValues={changeDialogValues.newValues}
        isLoading={updateTicketItem.isPending || sendChangeNotification.isPending}
      />
    </Dialog>
  );
}
