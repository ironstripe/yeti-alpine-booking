import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  User,
  Users,
  MapPin,
  MessageSquare,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Participant {
  first_name: string;
  last_name: string | null;
  current_ski_level_id: string | null;
  current_snowboard_level_id: string | null;
}

interface PendingBookingCardProps {
  booking: {
    id: string;
    date: string;
    time_start: string | null;
    time_end: string | null;
    meeting_point: string | null;
    internal_notes: string | null;
    products: { name: string; type: string } | null;
    tickets: {
      customers: { first_name: string | null; last_name: string } | null;
      notes_for_instructors: string | null;
    } | null;
    customer_participants: Participant[] | null;
  };
  onConfirm: () => void;
  onDecline: () => void;
  isConfirming: boolean;
}

export function PendingBookingCard({
  booking,
  onConfirm,
  onDecline,
  isConfirming,
}: PendingBookingCardProps) {
  const formattedDate = format(new Date(booking.date), 'EEEE, d. MMMM yyyy', {
    locale: de,
  });

  const timeDisplay =
    booking.time_start && booking.time_end
      ? `${booking.time_start.slice(0, 5)} - ${booking.time_end.slice(0, 5)} Uhr`
      : booking.time_start
        ? `${booking.time_start.slice(0, 5)} Uhr`
        : 'Zeit nicht angegeben';

  const customerName = booking.tickets?.customers
    ? `${booking.tickets.customers.first_name || ''} ${booking.tickets.customers.last_name}`.trim()
    : null;

  const notesForInstructor = booking.tickets?.notes_for_instructors || booking.internal_notes;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{timeDisplay}</span>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            {booking.products?.name || 'Privatunterricht'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Customer */}
        {customerName && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Kunde: </span>
              <span className="font-medium">{customerName}</span>
            </span>
          </div>
        )}

        {/* Participants */}
        {booking.customer_participants && booking.customer_participants.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Teilnehmer:</span>
            </div>
            <ul className="ml-6 space-y-0.5 text-sm">
              {booking.customer_participants.map((participant, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span>
                    • {participant.first_name} {participant.last_name || ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Meeting Point */}
        {booking.meeting_point && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Treffpunkt: </span>
              <span>{booking.meeting_point}</span>
            </span>
          </div>
        )}

        {/* Notes for Instructor */}
        {notesForInstructor && (
          <div className="rounded-md bg-muted/50 p-3">
            <div className="flex items-start gap-2 text-sm">
              <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="font-medium text-muted-foreground">
                  Notiz vom Büro:
                </span>
                <p className="mt-1">{notesForInstructor}</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="default"
            className="flex-1 min-h-[44px]"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Bestätigen
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-h-[44px]"
            onClick={onDecline}
            disabled={isConfirming}
          >
            <X className="mr-2 h-4 w-4" />
            Ablehnen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
