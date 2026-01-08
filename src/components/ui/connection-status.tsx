import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export function ConnectionStatus() {
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    // Monitor Supabase realtime connection
    const channel = supabase.channel('connection-monitor');

    channel.subscribe((state) => {
      switch (state) {
        case 'SUBSCRIBED':
          setStatus('connected');
          setIsReconnecting(false);
          break;
        case 'CHANNEL_ERROR':
        case 'TIMED_OUT':
          setStatus('disconnected');
          break;
        case 'CLOSED':
          setStatus('disconnected');
          break;
      }
    });

    // Monitor browser online/offline
    const handleOnline = () => {
      setIsReconnecting(true);
      setStatus('connecting');
    };

    const handleOffline = () => {
      setStatus('disconnected');
      setIsReconnecting(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial online state
    if (!navigator.onLine) {
      setStatus('disconnected');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(channel);
    };
  }, []);

  // Don't show anything when connected normally
  if (status === 'connected' && !isReconnecting) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-2 rounded-full shadow-lg',
        'text-sm font-medium transition-all duration-300',
        status === 'disconnected' && 'bg-destructive text-destructive-foreground',
        status === 'connecting' && 'bg-warning text-warning-foreground',
        isReconnecting && 'bg-warning text-warning-foreground'
      )}
    >
      {status === 'disconnected' ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Keine Verbindung</span>
        </>
      ) : isReconnecting ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Verbindung wird hergestellt...</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 animate-pulse" />
          <span>Verbinde...</span>
        </>
      )}
    </div>
  );
}
