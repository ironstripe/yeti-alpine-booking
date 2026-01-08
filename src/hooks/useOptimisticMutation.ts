import { useMutation, useQueryClient, QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

interface UseOptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: QueryKey;
  optimisticUpdate: (old: TData[], variables: TVariables) => TData[];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

export function useOptimisticMutation<TData, TVariables>({
  mutationFn,
  queryKey,
  optimisticUpdate,
  successMessage,
  errorMessage = 'Ein Fehler ist aufgetreten',
  onSuccess,
  onError,
}: UseOptimisticMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<TData[]>(queryKey);

      // Optimistically update
      if (previousData) {
        queryClient.setQueryData<TData[]>(queryKey, (old = []) => {
          return optimisticUpdate(old, variables);
        });
      }

      return { previousData };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      toast.error(errorMessage, {
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });

      onError?.(error instanceof Error ? error : new Error(String(error)));
    },
    onSuccess: (data) => {
      if (successMessage) {
        toast.success(successMessage);
      }
      onSuccess?.(data);
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// Helper for simple cache updates
export function createOptimisticUpdate<T extends { id: string }>(
  type: 'add' | 'update' | 'remove',
  getId: (variables: unknown) => string = (v: unknown) => (v as { id: string }).id
) {
  return (old: T[], variables: unknown): T[] => {
    switch (type) {
      case 'add':
        return [variables as T, ...old];
      case 'update':
        return old.map((item) =>
          item.id === getId(variables) ? { ...item, ...(variables as Partial<T>) } : item
        );
      case 'remove':
        return old.filter((item) => item.id !== getId(variables));
      default:
        return old;
    }
  };
}
