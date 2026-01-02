import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  CreditCard
} from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookingDetail";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { cn } from "@/lib/utils";

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
  const { data: booking, isLoading } = useBookingDetail(ticketItemId);
  const updateTicketItem = useUpdateTicketItem();
  
  const [isEditing, setIsEditing] = useState(false);
  const [meetingPoint, setMeetingPoint] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [instructorNotes, setInstructorNotes] = useState("");

  // Sync form state when booking loads
  useEffect(() => {
    if (booking) {
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

  const handleSave = () => {
    if (!ticketItemId) return;

    updateTicketItem.mutate(
      {
        ticketItemId,
        meetingPoint: meetingPoint || null,
        internalNotes: internalNotes || null,
        instructorNotes: instructorNotes || null,
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleCancel = () => {
    if (booking) {
      setMeetingPoint(booking.meetingPoint || "");
      setInternalNotes(booking.internalNotes || "");
      setInstructorNotes(booking.instructorNotes || "");
    }
    setIsEditing(false);
  };

  const isPaid = booking?.ticket?.paidAmount && booking?.ticket?.totalAmount 
    ? booking.ticket.paidAmount >= booking.ticket.totalAmount 
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Bearbeiten
                </Button>
              )}
            </div>

            <Separator />

            {/* Course Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Kursinfo</h4>
              
              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    {format(new Date(booking.date), "EEEE, d. MMMM yyyy", { locale: de })}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    {booking.timeStart?.slice(0, 5)} - {booking.timeEnd?.slice(0, 5)} Uhr
                  </span>
                </div>

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

                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="meetingPoint" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Treffpunkt
                    </Label>
                    <Input
                      id="meetingPoint"
                      value={meetingPoint}
                      onChange={(e) => setMeetingPoint(e.target.value)}
                      placeholder="z.B. Talstation, Hotel Gorfion"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{booking.meetingPoint || "Kein Treffpunkt"}</span>
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
                    onClick={handleSave}
                    disabled={updateTicketItem.isPending}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {updateTicketItem.isPending ? "Speichern..." : "Speichern"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
