import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { format } from 'date-fns';

export function usePendingBookingsCount() {
  const { instructorId, loading: roleLoading } = useUserRole();

  return useQuery({
    queryKey: ['instructor-pending-count', instructorId],
    queryFn: async () => {
      if (!instructorId) return 0;

      const today = format(new Date(), 'yyyy-MM-dd');

      const { count, error } = await supabase
        .from('ticket_items')
        .select('*', { count: 'exact', head: true })
        .eq('instructor_id', instructorId)
        .eq('instructor_confirmation', 'pending')
        .gte('date', today);

      if (error) {
        console.error('Error fetching pending count:', error);
        return 0;
      }

      return count || 0;
    },
    enabled: !roleLoading && !!instructorId,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000,
  });
}
