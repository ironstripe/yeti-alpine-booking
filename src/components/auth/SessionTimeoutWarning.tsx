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
    // Initialize last activity
    if (!localStorage.getItem(ACTIVITY_KEY)) {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    }

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    
    // Check session periodically
    const interval = setInterval(() => {
      const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0');
      const timeSinceActivity = Date.now() - lastActivity;
      const timeUntilTimeout = SESSION_TIMEOUT - timeSinceActivity;
      
      if (timeUntilTimeout <= WARNING_BEFORE && timeUntilTimeout > 0) {
        setShowWarning(true);
        setRemainingTime(Math.ceil(timeUntilTimeout / 1000));
      } else if (timeUntilTimeout <= 0) {
        // Session expired - log out
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
