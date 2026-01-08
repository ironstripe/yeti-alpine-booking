import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions<T> {
  table: string;
  schema?: string;
  event?: PostgresChangeEvent;
  filter?: string;
  queryKey: string[];
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T) => void;
  onDelete?: (payload: { old: T }) => void;
  enabled?: boolean;
}

export function useRealtimeSubscription<T extends { id: string }>({
  table,
  schema = 'public',
  event = '*',
  filter,
  queryKey,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Store callbacks in refs to avoid recreating the subscription on callback changes
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  callbacksRef.current = { onInsert, onUpdate, onDelete };
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  useEffect(() => {
    if (!enabled) return;

    const channelName = `${table}-${filter || 'all'}-${Date.now()}`;

    const handleChange = (payload: RealtimePostgresChangesPayload<T>) => {
      console.log(`[Realtime] ${table}:`, payload.eventType, payload);

      switch (payload.eventType) {
        case 'INSERT':
          if (callbacksRef.current.onInsert) {
            callbacksRef.current.onInsert(payload.new as T);
          } else {
            queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
          }
          break;

        case 'UPDATE':
          if (callbacksRef.current.onUpdate) {
            callbacksRef.current.onUpdate(payload.new as T);
          } else {
            queryClient.setQueryData(queryKeyRef.current, (old: T[] | undefined) => {
              if (!old || !Array.isArray(old)) return old;
              return old.map((item) =>
                item.id === (payload.new as T).id ? payload.new : item
              );
            });
          }
          break;

        case 'DELETE':
          if (callbacksRef.current.onDelete) {
            callbacksRef.current.onDelete({ old: payload.old as T });
          } else {
            queryClient.setQueryData(queryKeyRef.current, (old: T[] | undefined) => {
              if (!old || !Array.isArray(old)) return old;
              return old.filter((item) => item.id !== (payload.old as T).id);
            });
          }
          break;
      }
    };

    // Create channel with subscription
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(channelName) as any;
    
    // Build subscription config
    const subscriptionConfig = filter
      ? { event, schema, table, filter }
      : { event, schema, table };

    channel.on('postgres_changes', subscriptionConfig, handleChange);

    channel.subscribe((status: string) => {
      console.log(`[Realtime] ${table} subscription:`, status);
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, schema, event, filter, enabled, queryClient]);

  return channelRef.current;
}
