import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ConfirmBookingParams {
  ticketItemId: string;
  action: 'confirm' | 'decline';
  reason?: string;
}

export function useConfirmBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ticketItemId, action, reason }: ConfirmBookingParams) => {
      const { data, error } = await supabase.functions.invoke('set-booking-confirmation', {
        body: { ticketItemId, action, reason },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Ein Fehler ist aufgetreten');
      }

      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refetch instructor bookings
      queryClient.invalidateQueries({ queryKey: ['instructor-pending-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['instructor-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['instructor-portal-data'] });

      toast({
        title: variables.action === 'confirm' ? 'Buchung bestätigt' : 'Buchung abgelehnt',
        description: variables.action === 'confirm'
          ? 'Die Buchung wurde erfolgreich bestätigt.'
          : 'Die Buchung wurde abgelehnt. Das Büro wurde benachrichtigt.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
        variant: 'destructive',
      });
    },
  });
}
