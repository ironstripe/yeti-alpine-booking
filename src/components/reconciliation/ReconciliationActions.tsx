import { Button } from "@/components/ui/button";
import { Printer, Download, Lock, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ReconciliationActionsProps {
  canClose: boolean;
  isLocked: boolean;
  onPrint: () => void;
  onClose: () => void;
  closingReason?: string;
}

export function ReconciliationActions({
  canClose,
  isLocked,
  onPrint,
  onClose,
  closingReason,
}: ReconciliationActionsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onPrint}>
          <Printer className="h-4 w-4 mr-2" />
          Bericht drucken
        </Button>
        <Button variant="outline" onClick={onPrint}>
          <Download className="h-4 w-4 mr-2" />
          Als PDF exportieren
        </Button>
        
        {!isLocked && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!canClose}>
                <Lock className="h-4 w-4 mr-2" />
                Tag abschliessen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tag abschliessen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Nach dem Abschluss können keine Änderungen mehr vorgenommen werden.
                  Stellen Sie sicher, dass alle Zahlungen korrekt erfasst sind.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={onClose}>
                  Ja, abschliessen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {!isLocked && closingReason && (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          {closingReason}
        </div>
      )}

      {!isLocked && (
        <p className="text-sm text-muted-foreground">
          ⚠️ Nach dem Abschluss können keine Änderungen mehr vorgenommen werden.
        </p>
      )}

      {isLocked && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700">
          ✅ Dieser Tag wurde bereits abgeschlossen.
        </div>
      )}
    </div>
  );
}
