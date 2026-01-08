import { useState, useEffect } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Show "back online" message briefly
      setShowIndicator(true);
      setTimeout(() => setShowIndicator(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowIndicator(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Show indicator if starting offline
    if (!navigator.onLine) {
      setShowIndicator(true);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!showIndicator) return null;

  return (
    <div
      className={cn(
        "fixed top-14 md:top-0 left-0 right-0 z-50 py-2 px-4 text-center text-sm font-medium transition-all duration-300",
        isOnline
          ? "bg-success text-success-foreground"
          : "bg-warning text-warning-foreground"
      )}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <RefreshCw className="h-4 w-4" />
            <span>Wieder online – Daten werden synchronisiert</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Offline – Änderungen werden synchronisiert wenn online</span>
          </>
        )}
      </div>
    </div>
  );
}
