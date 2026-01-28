import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useConfirmBooking } from '@/hooks/useConfirmBooking';
import { InstructorLayout } from '@/components/instructor-portal/InstructorLayout';
import { PendingBookingCard } from '@/components/instructor-portal/PendingBookingCard';
import { DeclineBookingModal } from '@/components/instructor-portal/DeclineBookingModal';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function InstructorConfirmations() {
  const [selectedTicketItemId, setSelectedTicketItemId] = useState<string | null>(null);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const { instructorId, loading: roleLoading } = useUserRole();
  const { mutate: confirmBooking, isPending: isConfirming } = useConfirmBooking();

  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['instructor-pending-bookings', instructorId],
    queryFn: async () => {
      if (!instructorId) return [];

      const today = format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('ticket_items')
        .select(`
          id,
          date,
          time_start,
          time_end,
          meeting_point,
          internal_notes,
          ticket_id,
          products (name, type),
          tickets!inner (
            id,
            customer_id,
            notes_for_instructors,
            customers (first_name, last_name)
          )
        `)
        .eq('instructor_id', instructorId)
        .eq('instructor_confirmation', 'pending')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time_start', { ascending: true });

      if (error) throw error;

      // Fetch participants separately based on ticket's customer_id
      const bookingsWithParticipants = await Promise.all(
        (data || []).map(async (booking) => {
          const customerId = booking.tickets?.customer_id;

          let participants: Array<{
            first_name: string;
            last_name: string | null;
            current_ski_level_id: string | null;
            current_snowboard_level_id: string | null;
          }> = [];

          if (customerId) {
            const { data: participantsData } = await supabase
              .from('customer_participants')
              .select('first_name, last_name, current_ski_level_id, current_snowboard_level_id')
              .eq('customer_id', customerId);
            participants = participantsData || [];
          }

          return {
            ...booking,
            customer_participants: participants,
          };
        })
      );

      return bookingsWithParticipants;
    },
    enabled: !roleLoading && !!instructorId,
  });

  const handleConfirm = (ticketItemId: string) => {
    confirmBooking({ ticketItemId, action: 'confirm' });
  };

  const handleOpenDeclineModal = (ticketItemId: string) => {
    setSelectedTicketItemId(ticketItemId);
    setDeclineModalOpen(true);
  };

  const handleCloseDeclineModal = (open: boolean) => {
    setDeclineModalOpen(open);
    if (!open) {
      setSelectedTicketItemId(null);
    }
  };

  const renderContent = () => {
    if (isLoading || roleLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-3 pt-2">
                  <Skeleton className="h-11 flex-1" />
                  <Skeleton className="h-11 flex-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-sm text-muted-foreground">
              Fehler beim Laden der Buchungen. Bitte versuche es später erneut.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (!bookings || bookings.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-primary mb-4" />
            <p className="font-medium">Alles erledigt!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Du hast keine offenen Buchungen zu bestätigen.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {bookings.map((booking) => (
          <PendingBookingCard
            key={booking.id}
            booking={booking}
            onConfirm={() => handleConfirm(booking.id)}
            onDecline={() => handleOpenDeclineModal(booking.id)}
            isConfirming={isConfirming}
          />
        ))}
      </div>
    );
  };

  return (
    <InstructorLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Bestätigungen</h1>
          {bookings && bookings.length > 0 && (
            <Badge variant="secondary">
              {bookings.length} offen{bookings.length !== 1 ? 'e' : ''}
            </Badge>
          )}
        </div>

        {/* Content */}
        {renderContent()}
      </div>

      {/* Decline Modal */}
      <DeclineBookingModal
        ticketItemId={selectedTicketItemId}
        open={declineModalOpen}
        onOpenChange={handleCloseDeclineModal}
      />
    </InstructorLayout>
  );
}
