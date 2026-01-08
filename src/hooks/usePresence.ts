import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PresenceState {
  odId: string;
  odName: string;
  odPage: string;
  odLastSeen: string;
}

export function usePresence(roomId: string = 'global') {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`presence:${roomId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        
        // Convert to array of online users
        const users = Object.values(state).flat();
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Presence] User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[Presence] User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track this user's presence
          await channel.track({
            odId: user.id,
            odName: user.email || 'Unknown',
            odPage: window.location.pathname,
            odLastSeen: new Date().toISOString(),
          });
        }
      });

    // Update presence on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        channel.track({
          odId: user.id,
          odName: user.email || 'Unknown',
          odPage: window.location.pathname,
          odLastSeen: new Date().toISOString(),
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [roomId, user]);

  const updatePage = useCallback(async (page: string) => {
    if (!user) return;
    
    const channel = supabase.channel(`presence:${roomId}`);
    await channel.track({
      odId: user.id,
      odName: user.email || 'Unknown',
      odPage: page,
      odLastSeen: new Date().toISOString(),
    });
  }, [roomId, user]);

  return { onlineUsers, updatePage };
}
