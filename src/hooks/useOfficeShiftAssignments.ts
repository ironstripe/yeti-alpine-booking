import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { OfficeShiftAssignment } from '@/types/group-courses';

// Fetch all office shift assignments for a given instance
export function useOfficeShiftAssignments(instanceId: string | undefined) {
  return useQuery({
    queryKey: ['office-shift-assignments', instanceId],
    queryFn: async (): Promise<OfficeShiftAssignment[]> => {
      if (!instanceId) return [];

      const { data, error } = await supabase
        .from('office_shift_assignments')
        .select(`
          *,
          instructor:instructor_id(id, first_name, last_name)
        `)
        .eq('instance_id', instanceId);

      if (error) throw error;
      return data as unknown as OfficeShiftAssignment[];
    },
    enabled: !!instanceId,
  });
}

// Fetch all office shift assignments for multiple instances (bulk)
export function useOfficeShiftAssignmentsBulk(instanceIds: string[]) {
  return useQuery({
    queryKey: ['office-shift-assignments-bulk', instanceIds.join(',')],
    queryFn: async (): Promise<Record<string, OfficeShiftAssignment[]>> => {
      if (instanceIds.length === 0) return {};

      const { data, error } = await supabase
        .from('office_shift_assignments')
        .select(`
          *,
          instructor:instructor_id(id, first_name, last_name)
        `)
        .in('instance_id', instanceIds);

      if (error) throw error;

      // Group by instance_id
      const grouped: Record<string, OfficeShiftAssignment[]> = {};
      for (const assignment of (data as unknown as OfficeShiftAssignment[])) {
        if (!grouped[assignment.instance_id]) {
          grouped[assignment.instance_id] = [];
        }
        grouped[assignment.instance_id].push(assignment);
      }
      return grouped;
    },
    enabled: instanceIds.length > 0,
  });
}

// Add a staff member to an office shift
export function useAddOfficeShiftAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      instructorId 
    }: { 
      instanceId: string; 
      instructorId: string;
    }) => {
      const { data, error } = await supabase
        .from('office_shift_assignments')
        .insert({
          instance_id: instanceId,
          instructor_id: instructorId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['office-shift-assignments', variables.instanceId] });
      queryClient.invalidateQueries({ queryKey: ['office-shift-assignments-bulk'] });
      queryClient.invalidateQueries({ queryKey: ['scheduler-data'] });
      toast.success('Mitarbeiter zugewiesen');
    },
    onError: (error: any) => {
      console.error('Error adding office shift assignment:', error);
      if (error.code === '23505') {
        toast.error('Mitarbeiter ist bereits zugewiesen');
      } else {
        toast.error('Fehler beim Zuweisen des Mitarbeiters');
      }
    },
  });
}

// Remove a staff member from an office shift
export function useRemoveOfficeShiftAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      instructorId 
    }: { 
      instanceId: string; 
      instructorId: string;
    }) => {
      const { error } = await supabase
        .from('office_shift_assignments')
        .delete()
        .eq('instance_id', instanceId)
        .eq('instructor_id', instructorId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['office-shift-assignments', variables.instanceId] });
      queryClient.invalidateQueries({ queryKey: ['office-shift-assignments-bulk'] });
      queryClient.invalidateQueries({ queryKey: ['scheduler-data'] });
      toast.success('Mitarbeiter entfernt');
    },
    onError: (error) => {
      console.error('Error removing office shift assignment:', error);
      toast.error('Fehler beim Entfernen des Mitarbeiters');
    },
  });
}

// Bulk update staff assignments for an instance (replace all)
export function useSetOfficeShiftAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      instructorIds 
    }: { 
      instanceId: string; 
      instructorIds: string[];
    }) => {
      // Delete existing assignments
      await supabase
        .from('office_shift_assignments')
        .delete()
        .eq('instance_id', instanceId);

      // Insert new assignments
      if (instructorIds.length > 0) {
        const inserts = instructorIds.map(id => ({
          instance_id: instanceId,
          instructor_id: id,
        }));

        const { error } = await supabase
          .from('office_shift_assignments')
          .insert(inserts);

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['office-shift-assignments', variables.instanceId] });
      queryClient.invalidateQueries({ queryKey: ['office-shift-assignments-bulk'] });
      queryClient.invalidateQueries({ queryKey: ['scheduler-data'] });
      toast.success('Besetzung aktualisiert');
    },
    onError: (error) => {
      console.error('Error setting office shift assignments:', error);
      toast.error('Fehler beim Aktualisieren der Besetzung');
    },
  });
}
