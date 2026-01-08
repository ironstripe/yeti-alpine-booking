import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { cn } from "@/lib/utils";

export function InstallBanner() {
  const { showBanner, install, dismiss, canInstall } = useInstallPrompt();

  if (!showBanner || !canInstall) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-fade-in">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">YETY als App installieren?</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Schnellerer Zugriff direkt vom Homescreen.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            className="h-8 w-8 shrink-0 -mt-1 -mr-1"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button onClick={install} size="sm" className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Installieren
          </Button>
          <Button onClick={dismiss} variant="outline" size="sm">
            Später
          </Button>
        </div>
      </div>
    </div>
  );
}
