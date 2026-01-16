import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE = 5 * 60 * 1000;   // 5 minutes before
const ACTIVITY_KEY = 'yety_last_activity';

export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  
  const resetTimer = useCallback(() => {
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    setShowWarning(false);
  }, []);
  
  useEffect(() => {
    // ALWAYS reset activity timestamp on mount (fresh login = fresh timer)
    // This prevents stale timestamps from previous sessions causing immediate logout
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    
    // Check session periodically
    const interval = setInterval(() => {
      const lastActivityRaw = localStorage.getItem(ACTIVITY_KEY);
      const lastActivity = lastActivityRaw ? parseInt(lastActivityRaw, 10) : 0;
      
      // Guard against invalid/NaN values - treat as fresh activity
      if (isNaN(lastActivity) || lastActivity <= 0) {
        localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
        return;
      }
      
      const timeSinceActivity = Date.now() - lastActivity;
      const timeUntilTimeout = SESSION_TIMEOUT - timeSinceActivity;
      
      if (timeUntilTimeout <= WARNING_BEFORE && timeUntilTimeout > 0) {
        setShowWarning(true);
        setRemainingTime(Math.ceil(timeUntilTimeout / 1000));
      } else if (timeUntilTimeout <= 0) {
        // Session expired - log out and clear activity key
        localStorage.removeItem(ACTIVITY_KEY);
        supabase.auth.signOut();
        window.location.href = '/login?reason=timeout';
      } else {
        setShowWarning(false);
      }
    }, 1000);
    
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      clearInterval(interval);
    };
  }, [resetTimer]);
  
  const handleExtend = async () => {
    await supabase.auth.refreshSession();
    resetTimer();
  };

  const handleLogout = async () => {
    localStorage.removeItem(ACTIVITY_KEY);
    await supabase.auth.signOut();
    window.location.href = '/login';
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (!showWarning) return null;

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Sitzung läuft ab
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-muted-foreground">
            Ihre Sitzung läuft in <span className="font-mono font-semibold text-foreground">{formatTime(remainingTime)}</span> ab.
            Möchten Sie angemeldet bleiben?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleLogout}>
              Abmelden
            </Button>
            <Button onClick={handleExtend}>
              Angemeldet bleiben
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
