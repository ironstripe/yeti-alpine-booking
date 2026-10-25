// L1/B07b: accessible price-change confirmation (replaces window.confirm). Mounted once in App;
// move / period changes await the office's explicit choice. Closing or Escape = not confirmed.
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { registerPriceAckHost } from "@/lib/privateAppointmentsApi";

export function PriceAckDialogHost() {
  const [text, setText] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerPriceAckHost((t) => new Promise<boolean>((resolve) => {
      resolver.current?.(false); // never two open questions: an older one counts as declined
      resolver.current = resolve;
      setText(t);
    }));
    return () => { registerPriceAckHost(null); resolver.current?.(false); };
  }, []);

  const finish = (ok: boolean) => { const r = resolver.current; resolver.current = null; setText(null); r?.(ok); };

  return (
    <AlertDialog open={text !== null} onOpenChange={(open) => { if (!open) finish(false); }}>
      <AlertDialogContent data-testid="price-ack-dialog" className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Neuer Preis bestätigen</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line text-foreground">{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>Abbrechen – nichts ändern</AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)}>Neuen Preis übernehmen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
